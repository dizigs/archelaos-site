// Cloudflare Pages Function: routes contact messages through Resend.
// RESEND_API_KEY must be configured as an encrypted Pages secret.
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
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  // The website submits from the same origin; do not enable cross-origin API usage.
  if (origin && origin !== new URL(request.url).origin)
    return respond(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    return respond(415, { ok: false, error: "content_type" });
  if (Number(request.headers.get("Content-Length") || 0) > 16000)
    return respond(413, { ok: false, error: "too_large" });

  let data;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return respond(413, { ok: false, error: "too_large" });
    data = JSON.parse(raw);
  } catch {
    return respond(400, { ok: false, error: "invalid_json" });
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return respond(400, { ok: false, error: "invalid_data" });

  // Honeypot: bots are silently acknowledged, without sending email.
  if (data.website) return respond(200, { ok: true });
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
  // Never accept a recipient or sender address from the browser.
  if (!env.RESEND_API_KEY)
    return respond(503, { ok: false, error: "not_configured" });

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
        text: lines.join("\n")
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
