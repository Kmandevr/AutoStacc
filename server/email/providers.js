// Email providers behind one interface: send({ from, to, subject, text, html, tags }) -> { id }.
// Brevo is the production provider; "log" keeps mail in the database for local development (see /api/dev/outbox).
// Replacing Brevo means adding one function here and choosing it with EMAIL_PROVIDER.

async function brevo(config, msg) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": config.brevoKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: msg.from.name, email: msg.from.email },
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: msg.html,
      tags: msg.tags
    })
  });
  // Brevo's reason (e.g. unauthorised IP, unverified sender) is kept in email_events.error; it never holds the key.
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo responded ${res.status}${err.code ? ` ${err.code}` : ""}${err.message ? `: ${String(err.message).slice(0, 200)}` : ""}`);
  }
  const body = await res.json().catch(() => ({}));
  return { id: body.messageId || "" };
}

async function log() {
  return { id: "" };
}

export const providers = { brevo, log };
