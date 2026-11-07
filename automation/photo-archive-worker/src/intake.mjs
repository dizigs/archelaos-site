/*
 * ARCHELAOS photo archive: private, pending-only R2 intake.
 * Only a future authenticated canonical Brain RPC may authorize writes.
 * No public endpoints, listing, publishing, or metadata database.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const TYPES = Object.freeze({
  "image/jpeg": { extension: "jpg" },
  "image/png": { extension: "png" },
  "image/webp": { extension: "webp" },
});

export function validateImage(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) {
    throw new TypeError("PHOTO_IMAGE_BYTES_REQUIRED");
  }
  // Defensive copy: callers must not mutate the hashed bytes while Brain RPC is awaited.
  const data = Uint8Array.from(new Uint8Array(bytes));
  if (data.byteLength < 12 || data.byteLength > MAX_IMAGE_BYTES) {
    throw new RangeError("PHOTO_IMAGE_SIZE_REJECTED");
  }
  if (!Object.hasOwn(TYPES, mimeType)) {
    throw new TypeError("PHOTO_IMAGE_TYPE_REJECTED");
  }
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e &&
    data[3] === 0x47 && data[4] === 13 && data[5] === 10 &&
    data[6] === 26 && data[7] === 10;
  const webp = String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...data.slice(8, 12)) === "WEBP";
  if (!((mimeType === "image/jpeg" && jpeg) ||
        (mimeType === "image/png" && png) ||
        (mimeType === "image/webp" && webp))) {
    throw new TypeError("PHOTO_IMAGE_SIGNATURE_REJECTED");
  }
  return { data, extension: TYPES[mimeType].extension, mimeType };
}

export function isIntakeEnabled(env) {
  return env?.PHOTO_ARCHIVE_ENABLED === "true" &&
    env?.PHOTO_INTAKE_ENABLED === "true" &&
    env?.PHOTO_EU_REVIEW_APPROVED === "true";
}

export async function stageOriginal(env, request) {
  if (!isIntakeEnabled(env)) throw new Error("PHOTO_ARCHIVE_DISABLED");
  if (!request || typeof request !== "object") {
    throw new TypeError("PHOTO_REQUEST_REQUIRED");
  }
  if (typeof request.receiptId !== "string" ||
      !/^[a-zA-Z0-9_.:-]{10,160}$/.test(request.receiptId)) {
    throw new TypeError("PHOTO_RECEIPT_ID_INVALID");
  }
  const { data, extension, mimeType } = validateImage(request.bytes, request.mimeType);
  if (typeof env.BRAIN?.verifyPhotoArchiveIntent !== "function" ||
      typeof env.PHOTO_ORIGINALS?.put !== "function") {
    throw new Error("PHOTO_BINDING_NOT_READY");
  }

  const digestBytes = await crypto.subtle.digest("SHA-256", data);
  const digest = Array.from(new Uint8Array(digestBytes), b => b.toString(16).padStart(2, "0")).join("");
  const scope = "photo.original.stage";
  // This method MUST be implemented by the real canonical Brain owner; never stub it in production.
  const proof = await env.BRAIN.verifyPhotoArchiveIntent({
    receiptId: request.receiptId,
    scope,
    sha256: digest,
    byteLength: data.byteLength,
    mimeType,
  });
  if (!proof || proof.decision !== "AUTHORIZED" || proof.scope !== scope ||
      proof.receiptId !== request.receiptId || proof.sha256 !== digest ||
      proof.byteLength !== data.byteLength || proof.mimeType !== mimeType ||
      !Number.isFinite(proof.expiresAtMs) || proof.expiresAtMs <= Date.now()) {
    throw new Error("PHOTO_BRAIN_PROOF_REJECTED");
  }
  const key = "pending/sha256/" + digest + "." + extension;
  // Deterministic content-addressed key: repeat approvals cannot change the bytes.
  // No personal names, file paths, or user-supplied labels in object storage keys.
  const object = await env.PHOTO_ORIGINALS.put(key, data, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { reviewState: "pending", algorithm: "sha256" },
    // R2 conditional write: content-addressed objects must never be overwritten.
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (object === null) {
    // Existing key or failed atomic create; no read/overwrite/retry here.
    throw new Error("PHOTO_R2_OBJECT_EXISTS_RECONCILE");
  }
  if (!object || object.key !== key) {
    // Write might have completed. Treat as UNKNOWN and do not automatically retry.
    throw new Error("PHOTO_R2_ACK_UNKNOWN");
  }
  return Object.freeze({
    status: "PENDING_REVIEW",
    receiptId: request.receiptId,
    objectKey: key,
    sha256: digest,
    published: false,
  });
}
