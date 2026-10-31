// Cloudflare Pages Function: send contact inquiries via Resend.
// RESEND_API_KEY must remain an encrypted Pages secret (not browser-visible).
const RECIPIENTS = Object.freeze({
  general: "contact@archelaos.club",
  sponsorship: "contact@archelaos.club",
  volunteer: "contact@archelaos.club",
  other: "contact@archelaos.club",
  sport: "sports@archelaos.club",
  archive: "history@archelaos.club"
});
const TOPICS = Object.freeze({
  general: "Γενική επικοινωνία",
  sponsorship: "Χορηγίες / Συνεργασίες",
  volunteer: "Εθελοντισμός",
  other: "Άλλο θέμα",
  sport: "Αθλητικό τμήμα / Εγγραφές",
  archive: "Ιστορικό αρχείο"
});
const SPORTS = Object.freeze({
  handball: "Χάντμπολ", track: "Στίβος", archery: "Τοξοβολία",
  shooting: "Σκοποβολή", gymnastics: "Ενόργανη",
  wrestling: "Πάλη", volleyball: "Βόλεϊ", swimming: "Κολύμβηση"
});
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_FORM_BYTES = 16 * 1024 * 1024;
const ALLOWED = Object.freeze({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain"
});
function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
function fileName(raw) {
  return raw.replace(/[\x00-\x1f\x7f\\/]/g, "_").slice(0, 150).trim();
}
function fileType(name) {
  const ext = name.split(".").pop().toLowerCase();
  return Object.hasOwn(ALLOWED, ext) ? { ext, mime: ALLOWED[ext] } : null;
}
function matchesSignature(bytes, ext) {
  const is = (...arr) => arr.every((value, i) => bytes[i] === value);
  if (ext === "jpg" || ext === "jpeg") return is(0xff, 0xd8, 0xff);
  if (ext === "png") return is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (ext === "gif") return is(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39);
  if (ext === "webp") return is(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (ext === "pdf") return is(0x25, 0x50, 0x44, 0x46);
  if (ext === "docx") return is(0x50, 0x4b);
  if (ext === "doc") return is(0xd0, 0xcf, 0x11, 0xe0);
  if (ext === "heic" || ext === "heif") return bytes[4] === 0x66 && bytes[5] === 0x74 &&
    bytes[6] === 0x79 && bytes[7] === 0x70;
  if (ext === "txt") return !bytes.some(byte => byte === 0);
  return false;
}
function base64(bytes) {
  // Avoid argument limits of fromCharCode for large photo and PDF uploads.
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 16384) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  }
  return btoa(chunks.join(""));
}
export function onRequestGet({ env }) {
  return respond(200, { ok: true, ready: Boolean(env.RESEND_API_KEY), attachments: true });
}
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return respond(403, { ok: false, error: "forbidden" });
  }
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  const multipart = contentType.startsWith("multipart/form-data");
  const json = contentType.startsWith("application/json");
  if (!multipart && !json) return respond(415, { ok: false, error: "content_type" });

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > (multipart ? MAX_FORM_BYTES : 16000)) {
    return respond(413, { ok: false, error: "too_large" });
  }
  let data;
  let files = [];
  try {
    if (multipart) {
      const form = await request.formData();
      data = Object.fromEntries(["name", "email", "phone", "message", "topic", "sport", "website"]
        .map(key => [key, form.get(key)]));
      data.consent = form.get("consent") === "true";
      files = form.getAll("attachments");
      // Some browsers include one empty file control even when no file is selected.
      files = files.filter(f => typeof f !== "string" && Boolean(f.name) && f.size > 0);
      if (files.length > MAX_FILES) return respond(400, { ok: false, error: "too_many_files" });
      const total = files.reduce((sum, f) => sum + f.size, 0);
      if (total > MAX_TOTAL_BYTES) return respond(413, { ok: false, error: "files_total_too_large" });
      if (files.some(f => f.size > MAX_FILE_BYTES)) return respond(413, { ok: false, error: "file_too_large" });
    } else {
      const raw = await request.text();
      if (raw.length > 16000) return respond(413, { ok: false, error: "too_large" });
      data = JSON.parse(raw);
    }
  } catch {
    return respond(400, { ok: false, error: "invalid_request" });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return respond(400, { ok: false, error: "invalid_data" });
  }
  if (typeof data.website === "string" && data.website.trim()) {
    return respond(200, { ok: true });
  }
  const clean = key => typeof data[key] === "string" ? data[key].trim() : "";
  const name = clean("name");
  const email = clean("email");
  const phone = clean("phone");
  const message = clean("message");
  const topic = clean("topic");
  const sport = clean("sport");
  const validEmail = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email);
  if (data.consent !== true || name.length < 2 || name.length > 120 ||
      !validEmail || email.length > 254 || phone.length > 35 ||
      message.length < 10 || message.length > 5000 ||
      !Object.hasOwn(RECIPIENTS, topic) ||
      (topic === "sport" && !Object.hasOwn(SPORTS, sport))) {
    return respond(400, { ok: false, error: "invalid_fields" });
  }
  if (files.length && topic !== "archive") {
    return respond(400, { ok: false, error: "attachments_not_allowed" });
  }
  if (!env.RESEND_API_KEY) return respond(503, { ok: false, error: "not_configured" });

  const attachments = [];
  for (const file of files) {
    if (typeof file.arrayBuffer !== "function") {
      return respond(400, { ok: false, error: "unsupported_file" });
    }
    const safeName = fileName(file.name);
    const type = fileType(safeName);
    if (!type || !safeName || !safeName.includes(".")) {
      return respond(400, { ok: false, error: "unsupported_file" });
    }
    const rawMime = (file.type || "").toLowerCase();
    if (rawMime && rawMime !== "application/octet-stream" && rawMime !== type.mime &&
        !(type.ext === "heic" && rawMime === "image/heif") &&
        !(type.ext === "heif" && rawMime === "image/heic")) {
      return respond(400, { ok: false, error: "unsupported_file" });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length || !matchesSignature(bytes.subarray(0, 32), type.ext)) {
      return respond(400, { ok: false, error: "unsupported_file" });
    }
    attachments.push({ filename: safeName, content: base64(bytes), content_type: type.mime });
  }

  const lines = [
    "Νέο μήνυμα από τη φόρμα archelaos.club",
    "",
    "Θέμα: " + TOPICS[topic],
    ...(topic === "sport" ? ["Άθλημα: " + SPORTS[sport]] : []),
    "Ονοματεπώνυμο: " + name,
    "Email επισκέπτη: " + email,
    "Τηλέφωνο: " + (phone || "—"),
    "",
    "Μήνυμα:",
    message
  ];
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "G.A.S. Archelaos <noreply@archelaos.club>",
        to: [RECIPIENTS[topic]],
        reply_to: [email],
        subject: "Αρχέλαος — " + TOPICS[topic],
        text: lines.join("\n"),
        ...(attachments.length ? { attachments } : {})
      })
    });
    if (!result.ok) {
      console.error("Contact form Resend status:", result.status);
      return respond(502, { ok: false, error: "provider_unavailable" });
    }
    return respond(200, { ok: true });
  } catch {
    return respond(502, { ok: false, error: "provider_unavailable" });
  }
}
