import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGE_BYTES, validateImage, isIntakeEnabled, stageOriginal } from "../src/intake.mjs";

const receiptId = "archelaos.photo.acceptance.0001";
const image = Uint8Array.of(0x89,0x50,0x4e,0x47,13,10,26,10,0,0,0,0,1);
function enabled() {
  let writes = 0, proofs = 0, lastWrite = null;
  const env = {
    PHOTO_ARCHIVE_ENABLED: "true",
    PHOTO_INTAKE_ENABLED: "true",
    PHOTO_EU_REVIEW_APPROVED: "true",
    BRAIN: {
      async verifyPhotoArchiveIntent(request) {
        proofs++;
        return { decision: "AUTHORIZED", ...request, expiresAtMs: Date.now() + 60_000 };
      },
    },
    PHOTO_ORIGINALS: {
      async put(key, bytes, options) {
        writes++;
        lastWrite = { key, bytes, options };
        return { key };
      },
    },
    PHOTO_PUBLISHED: { async put() { throw new Error("MUST_NOT_PUBLISH"); } },
  };
  return { env, stats: () => ({ writes, proofs, lastWrite }) };
}

test("default disabled, independent flags required", () => {
  assert.equal(isIntakeEnabled(), false);
  assert.equal(isIntakeEnabled({}), false);
  assert.equal(isIntakeEnabled({ PHOTO_ARCHIVE_ENABLED: "true", PHOTO_INTAKE_ENABLED: "true" }), false);
});

test("only JPG, PNG and WebP with matching image magic are allowed", () => {
  assert.equal(validateImage(image, "image/png").extension, "png");
  assert.throws(() => validateImage(image, "image/jpeg"), /PHOTO_IMAGE_SIGNATURE_REJECTED/);
  assert.throws(() => validateImage(image, "image/svg+xml"), /PHOTO_IMAGE_TYPE_REJECTED/);
  assert.throws(() => validateImage(new Uint8Array(13), "image/png"), /PHOTO_IMAGE_SIGNATURE_REJECTED/);
  assert.throws(() => validateImage(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/png"), /PHOTO_IMAGE_SIZE_REJECTED/);
});

test("write cannot happen when any enablement gate is false", async () => {
  for (const flag of ["PHOTO_ARCHIVE_ENABLED", "PHOTO_INTAKE_ENABLED", "PHOTO_EU_REVIEW_APPROVED"]) {
    const fixture = enabled();
    fixture.env[flag] = "false";
    await assert.rejects(stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image }), /PHOTO_ARCHIVE_DISABLED/);
    assert.equal(fixture.stats().writes, 0);
    assert.equal(fixture.stats().proofs, 0);
  }
});

test("bad receipt or payload fails before Brain proof", async () => {
  const fixture = enabled();
  await assert.rejects(stageOriginal(fixture.env, { receiptId: "../../bad", mimeType: "image/png", bytes: image }), /PHOTO_RECEIPT_ID_INVALID/);
  await assert.rejects(stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: new Uint8Array(12) }), /PHOTO_IMAGE_SIGNATURE_REJECTED/);
  assert.equal(fixture.stats().proofs, 0);
});

test("missing trusted Brain RPC or R2 binding fails closed", async () => {
  const fixture = enabled();
  delete fixture.env.BRAIN;
  await assert.rejects(stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image }), /PHOTO_BINDING_NOT_READY/);
  const second = enabled();
  delete second.env.PHOTO_ORIGINALS;
  await assert.rejects(stageOriginal(second.env, { receiptId, mimeType: "image/png", bytes: image }), /PHOTO_BINDING_NOT_READY/);
});

test("forged, expired, cross-scope and mismatched Brain proof rejected", async () => {
  for (const mutation of [
    p => ({ ...p, decision: "WAITING_REVIEW" }),
    p => ({ ...p, scope: "photo.publish" }),
    p => ({ ...p, sha256: "0".repeat(64) }),
    p => ({ ...p, receiptId: "another-receipt" }),
    p => ({ ...p, expiresAtMs: Date.now() - 1000 }),
    p => ({ ...p, byteLength: 99 }),
  ]) {
    const fixture = enabled();
    const original = fixture.env.BRAIN.verifyPhotoArchiveIntent;
    fixture.env.BRAIN.verifyPhotoArchiveIntent = async req => mutation(await original(req));
    await assert.rejects(stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image }), /PHOTO_BRAIN_PROOF_REJECTED/);
    assert.equal(fixture.stats().writes, 0);
  }
});

test("authorized original is stored pending; never touches published bucket", async () => {
  const fixture = enabled();
  const result = await stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image });
  const { writes, proofs, lastWrite } = fixture.stats();
  assert.equal(writes, 1);
  assert.equal(proofs, 1);
  assert.equal(result.status, "PENDING_REVIEW");
  assert.equal(result.published, false);
  assert.match(result.objectKey, /^pending\/sha256\/[a-f0-9]{64}\.png$/);
  assert.equal(result.sha256.length, 64);
  assert.deepEqual(lastWrite.bytes, image);
  assert.equal(lastWrite.options.httpMetadata.contentType, "image/png");
  assert.deepEqual(lastWrite.options.customMetadata, { reviewState: "pending", algorithm: "sha256" });
});

test("failed or ambiguous R2 acknowledgement aborts, without retry", async () => {
  const fixture = enabled();
  fixture.env.PHOTO_ORIGINALS.put = async () => { throw new Error("R2_FAILURE"); };
  await assert.rejects(stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image }), /R2_FAILURE/);
  const second = enabled();
  second.env.PHOTO_ORIGINALS.put = async () => ({ key: "different" });
  await assert.rejects(stageOriginal(second.env, { receiptId, mimeType: "image/png", bytes: image }), /PHOTO_R2_ACK_UNKNOWN/);
});

test("receipt ID is not an object key and cannot select a bucket", async () => {
  const fixture = enabled();
  const result = await stageOriginal(fixture.env, { receiptId, mimeType: "image/png", bytes: image, bucket: "archelaos-photo-published", key: "published/bypass" });
  assert.ok(!result.objectKey.includes(receiptId));
  assert.ok(!result.objectKey.includes("bypass"));
  assert.equal(result.status, "PENDING_REVIEW");
});

test("staging configuration is dark with no public routes/triggers", async () => {
  const fs = await import("node:fs/promises");
  const c = JSON.parse(await fs.readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(c.workers_dev, false);
  assert.equal(c.preview_urls, false);
  assert.equal(c.vars.PHOTO_ARCHIVE_ENABLED, "false");
  assert.equal(c.vars.PHOTO_INTAKE_ENABLED, "false");
  assert.equal(c.vars.PHOTO_EU_REVIEW_APPROVED, "false");
  assert.equal(c.vars.PHOTO_PUBLIC_SUBMISSIONS_ENABLED, "false");
  assert.equal(c.vars.PHOTO_PUBLISH_ENABLED, "false");
  assert.equal(c.routes, undefined);
  assert.equal(c.triggers, undefined);
  assert.deepEqual(c.r2_buckets.map(b => b.bucket_name), ["archelaos-photo-originals", "archelaos-photo-published"]);
  assert.equal(c.r2_buckets.some(b => Object.hasOwn(b,"jurisdiction")), false);
});
