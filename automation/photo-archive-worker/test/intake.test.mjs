import { DatabaseSync as SQLiteSync } from "node:sqlite";
import { readFileSync } from "node:fs";
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
  assert.deepEqual(lastWrite.options.onlyIf, { etagDoesNotMatch: "*" });
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


test("R2 conditional-put collision never overwrites existing object", async () => {
  const fixture=enabled();
  fixture.env.PHOTO_ORIGINALS.put=async (_key,_bytes,options)=>{
    assert.deepEqual(options.onlyIf,{etagDoesNotMatch:"*"});
    return null; // R2 conditional failure
  };
  await assert.rejects(stageOriginal(fixture.env,{receiptId,mimeType:"image/png",bytes:image}),
    /PHOTO_R2_OBJECT_EXISTS_RECONCILE/);
});

test("ArrayBuffer caller mutation during Brain verification does not change SHA256-staged bytes", async () => {
  const fixture=enabled();
  const source=image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength);
  const snapshot=Uint8Array.from(image);
  const verifier=fixture.env.BRAIN.verifyPhotoArchiveIntent;
  fixture.env.BRAIN.verifyPhotoArchiveIntent=async req=>{
    const proof=await verifier(req);
    new Uint8Array(source)[12]^=0xff;
    return proof;
  };
  const receipt=await stageOriginal(fixture.env,{receiptId,mimeType:"image/png",bytes:source});
  assert.deepEqual(fixture.stats().lastWrite.bytes,snapshot);
  assert.equal(receipt.sha256,Buffer.from(await crypto.subtle.digest("SHA-256",snapshot)).toString("hex"));
});

// Native Node 22 SQLite tests. The SQL runs ONLY in memory; production D1 is not touched.
const PA="ph_550e8400-e29b-41d4-a716-446655440000";
const PB="ph_550e8400-e29b-41d4-a716-446655440001";
const T="2026-11-06T12:00:00Z";
const H1="a".repeat(64),H2="b".repeat(64);
function photo_v1_schema_offline(){
  const readme=readFileSync(new URL("../README.md",import.meta.url),"utf8");
  const chunk=readme.split("<!-- PHOTO_D1_CONTRACT_V1_BEGIN -->")[1]
    ?.split("<!-- PHOTO_D1_CONTRACT_V1_END -->")[0];
  const fence=String.fromCharCode(96).repeat(3);
  const sql=chunk?.split(fence+"sql")[1]?.split(fence)[0];
  assert.ok(sql,"D1 v1 SQL contract must be present");
  const db=new SQLiteSync(":memory:");
  db.exec(sql);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
  return db;
}
function createPhoto(db,id=PA) {
  db.prepare("INSERT INTO photos(photo_id,created_at) VALUES(?,?)").run(id,T);
}
function addVersion(db,id=PA,v=1,digest=H1) {
  db.prepare("INSERT INTO photo_versions(photo_id,version_no,sha256,byte_length,mime_type,original_key,provenance_ref,exif_state,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id,v,digest,13,"image/png","pending/sha256/"+digest+".png","private-ref","unreviewed",T);
}
function evidence(db,id,kind,decision,n=1,version=1){
  db.prepare("INSERT INTO photo_evidence(evidence_id,photo_id,version_no,kind,decision,private_evidence_ref,reviewer_ref,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(kind+"_"+id+"_"+n+"_"+version,id,version,kind,decision,"private-evidence",decision==="verified"?"human-moderator":null,T);
}
function approvedAdult(db,id=PA){
  db.prepare("UPDATE photos SET lifecycle_state='active',rights_state='verified',privacy_state='cleared',minor_presence='no',guardian_state='not_applicable' WHERE photo_id=?").run(id);
  evidence(db,id,"copyright","verified");
  evidence(db,id,"privacy","verified");
}
function publish(db,id=PA,exif=1,pk="pub1",version=1){
  db.prepare("INSERT INTO photo_publications(publication_id,photo_id,version_no,derivative_key,derivative_sha256,exif_removed,human_review_ref,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(pk,id,version,"published/reviewed/"+pk+".png",H2,exif,"reviewer",T);
}

test("D1 v1 SQL schema parses in native SQLite with all expected entity tables",()=>{
  const db=photo_v1_schema_offline();
  try {
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    assert.deepEqual(names,["photo_audit","photo_comments","photo_corrections",
      "photo_duplicates","photo_evidence","photo_links","photo_publications",
      "photo_tombstones","photo_versions","photos"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,0);
  }finally{db.close();}
});

test("immutable photo IDs and ordered append-only versions preserve duplicate candidates",()=>{
  const db=photo_v1_schema_offline();
  try {
    createPhoto(db);createPhoto(db,PB);addVersion(db);
    assert.throws(()=>db.prepare("UPDATE photos SET photo_id=? WHERE photo_id=?").run(PB,PA),/PHOTO_ID_IMMUTABLE/);
    assert.throws(()=>db.prepare("DELETE FROM photos WHERE photo_id=?").run(PA),/PHOTO_ID_TOMBSTONE_REQUIRED/);
    assert.throws(()=>addVersion(db,PB,2),/PHOTO_VERSION_OUT_OF_SEQUENCE/);
    addVersion(db,PB,1,H1);addVersion(db,PA,2,H2);
    assert.throws(()=>db.prepare("UPDATE photo_versions SET sha256=? WHERE photo_id=?").run(H2,PA),/PHOTO_VERSION_IMMUTABLE/);
    assert.throws(()=>db.prepare("DELETE FROM photo_versions WHERE photo_id=?").run(PA),/PHOTO_VERSION_DELETE_DENIED/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_versions WHERE sha256=?").get(H1).n,2);
    db.prepare("INSERT INTO photo_duplicates(candidate_id,left_photo_id,right_photo_id,evidence_kind,created_at) VALUES (?,?,?,?,?)").run("pair01",PA,PB,"sha256",T);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos").get().n,2);
  }finally{db.close();}
});

test("no publication without human rights/privacy; revocation immediately removes read-only eligibility",()=>{
  const db=photo_v1_schema_offline();
  try {
    createPhoto(db);addVersion(db);
    assert.throws(()=>publish(db),/PHOTO_PUBLICATION_REVIEW_REQUIRED/);
    approvedAdult(db);
    assert.throws(()=>publish(db,PA,0),/CHECK constraint failed/);
    publish(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,1);
    evidence(db,PA,"copyright","revoked",2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,0);
    assert.throws(()=>publish(db,PA,1,"pub2"),/PHOTO_PUBLICATION_REVIEW_REQUIRED/);
  }finally{db.close();}
});

test("minors require guardian evidence; deletion tombstone suppresses all public references",()=>{
  const db=photo_v1_schema_offline();
  try {
    createPhoto(db);addVersion(db);
    db.prepare("UPDATE photos SET lifecycle_state='active',rights_state='verified',privacy_state='cleared',minor_presence='yes',guardian_state='verified' WHERE photo_id=?").run(PA);
    evidence(db,PA,"copyright","verified");evidence(db,PA,"privacy","verified");
    assert.throws(()=>publish(db),/PHOTO_PUBLICATION_REVIEW_REQUIRED/);
    evidence(db,PA,"guardian_consent","verified");
    publish(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,1);
    db.prepare("INSERT INTO photo_tombstones(photo_id,reason,purge_state,created_at) VALUES(?,?,?,?)").run(PA,"erasure_request","unknown",T);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,0);
  }finally{db.close();}
});

test("News/HOF/person/history links and comments/corrections are unverified until moderated",()=>{
  const db=photo_v1_schema_offline();
  try {
    createPhoto(db);addVersion(db);
    for(const [i,k] of ["news","hall_of_fame","person","historical_event"].entries()){
      db.prepare("INSERT INTO photo_links(link_id,photo_id,version_no,target_kind,target_id,source_evidence_ref,created_at) VALUES (?,?,?,?,?,?,?)")
        .run("link_"+i,PA,1,k,"canonical-"+i,"private-ref",T);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_links WHERE review_state='suggested'").get().n,4);
    assert.throws(()=>db.prepare("INSERT INTO photo_links(link_id,photo_id,version_no,target_kind,target_id,source_evidence_ref,created_at) VALUES (?,?,?,?,?,?,?)").run("bad",PA,1,"face_match","x","evidence",T),/CHECK constraint failed/);
    db.prepare("INSERT INTO photo_comments(comment_id,photo_id,body_private,created_at) VALUES (?,?,?,?)").run("comment1",PA,"Δοκιμαστικό σχόλιο",T);
    db.prepare("INSERT INTO photo_corrections(correction_id,photo_id,field_name,proposed_value_private,created_at) VALUES (?,?,?,?,?)").run("correction1",PA,"year","1994",T);
    assert.equal(db.prepare("SELECT moderation_state FROM photo_comments").get().moderation_state,"pending");
    assert.equal(db.prepare("SELECT moderation_state FROM photo_corrections").get().moderation_state,"pending");
    assert.throws(()=>db.prepare("UPDATE photo_comments SET moderation_state='approved'").run(),/CHECK constraint failed/);
  }finally{db.close();}
});

test("audit events and rights evidence are append-only, never silently changed",()=>{
  const db=photo_v1_schema_offline();
  try {
    createPhoto(db);addVersion(db);evidence(db,PA,"copyright","pending");
    assert.throws(()=>db.prepare("DELETE FROM photo_evidence").run(),/PHOTO_EVIDENCE_DELETE_DENIED/);
    db.prepare("INSERT INTO photo_audit(audit_id,photo_id,event_kind,event_digest,occurred_at) VALUES (?,?,?,?,?)").run("audit1",PA,"review_created",H1,T);
    assert.throws(()=>db.prepare("UPDATE photo_audit SET event_kind='tamper'").run(),/PHOTO_AUDIT_APPEND_ONLY/);
    assert.throws(()=>db.prepare("DELETE FROM photo_audit").run(),/PHOTO_AUDIT_DELETE_DENIED/);
  }finally{db.close();}
});


test("approved v1 rights cannot approve new v2 pixels without independent evidence",()=>{
  const db=photo_v1_schema_offline();
  try{
    createPhoto(db);addVersion(db);approvedAdult(db);publish(db);
    addVersion(db,PA,2,H2);
    assert.throws(()=>publish(db,PA,1,"second_version",2),/PHOTO_PUBLICATION_REVIEW_REQUIRED/);
    evidence(db,PA,"copyright","verified",2,2);
    evidence(db,PA,"privacy","verified",2,2);
    publish(db,PA,1,"second_version",2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,2);
    // If v1's rights are revoked, v2 is not silently revoked or approved.
    evidence(db,PA,"copyright","revoked",3,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photo_public_readonly").get().n,1);
  }finally{db.close();}
});

test("photo identifiers and original object keys reject noncanonical formats",()=>{
  const db=photo_v1_schema_offline();
  try{
    assert.throws(()=>createPhoto(db,"ph_zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"),/CHECK constraint failed/);
    createPhoto(db);
    assert.throws(()=>db.prepare("INSERT INTO photo_versions(photo_id,version_no,sha256,byte_length,mime_type,original_key,provenance_ref,exif_state,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(PA,1,H1,13,"image/png","pending/sha256/"+H2+".png","private-ref","unreviewed",T),/CHECK constraint failed/);
  }finally{db.close();}
});
