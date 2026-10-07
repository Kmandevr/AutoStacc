// Email templates: each returns { subject, text, html } from plain data. Provider-agnostic; add a new kind here
// (abandoned cart, release announcement, newsletter) without touching the providers.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

// One terminal-styled wrapper: black screen, green heading, purple button. Inline styles because email clients need them.
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#000;color:#f2f2f2;font-family:Menlo,Consolas,monospace">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="color:#24b350;margin:0 0 18px">GLITCHES&amp;STITCHES</p>
<h1 style="color:#33ff66;font-size:22px;margin:0 0 16px">$ ${esc(title)}</h1>
${bodyHtml}
<p style="color:#b8b8c0;font-size:12px;margin-top:32px">Tear. Stitch. Glitch. Cinch. Repeat.</p>
</div></body></html>`;
}
const button = (url, label) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#bf5fff;color:#000;padding:12px 18px;text-decoration:none;font-weight:bold">&gt; ${esc(label)}</a></p>`;
const para = (s) => `<p style="line-height:1.6;margin:0 0 12px">${esc(s)}</p>`;

export const templates = {
  "verify-email": ({ url }) => ({
    subject: "Confirm your email — Glitches & Stitches",
    text: `Confirm your email to finish creating your account:\n${url}\n\nThe link works for 24 hours.\nDidn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens.`,
    html: layout("confirm your email", para("One click and your account is stitched together.") + button(url, "Confirm email") +
      para("The link works for 24 hours.") + para("Didn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens."))
  }),

  // After guest purchases join an account (confirmed email or password reset).
  "purchases-linked": ({ count, libraryUrl, resetUrl }) => ({
    subject: "Your purchases joined your account — Glitches & Stitches",
    text: `${count} purchase${count === 1 ? "" : "s"} made with this email ${count === 1 ? "is" : "are"} now in your account library: ${libraryUrl}\n\nDidn't create an account? Reset its password now to take it over (this logs everyone else out): ${resetUrl}`,
    html: layout("stitched in", para(`${count} purchase${count === 1 ? "" : "s"} made with this email ${count === 1 ? "is" : "are"} now in your account library.`) +
      button(libraryUrl, "Open your library") + para(`Didn't create an account? Reset its password now to take it over (this logs everyone else out): ${resetUrl}`))
  }),

  "reset-password": ({ url }) => ({
    subject: "Reset your password — Glitches & Stitches",
    text: `Someone asked to reset the password for this email. If it was you:\n${url}\n\nThe link works for 1 hour. If it wasn't you, ignore this; nothing changes.`,
    html: layout("reset your password", para("Someone asked to reset the password for this email. If it was you:") + button(url, "Choose a new password") + para("The link works for 1 hour. If it wasn't you, ignore this; nothing changes."))
  }),

  // Sent instead of an error when someone signs up with an email that already has an account (no account enumeration).
  "account-exists": ({ loginUrl, resetUrl }) => ({
    subject: "You already have an account — Glitches & Stitches",
    text: `Someone tried to create an account with this email, but you already have one.\nLog in: ${loginUrl}\nForgot your password? ${resetUrl}`,
    html: layout("you already have an account", para("Someone tried to create an account with this email, but you already have one.") + button(loginUrl, "Log in") + para(`Forgot your password? ${resetUrl}`))
  }),

  "payment-rejected": ({ provider, eventId, sessionId, orderId, reason, adminUrl }) => ({
    subject: "Store alert: a payment was refused",
    text: `A ${provider} payment event was refused by the store, so the buyer got nothing yet.\nReason: ${reason}\nEvent: ${eventId}\nSession: ${sessionId || "-"}\nOrder: ${orderId || "-"}\n\nCheck it in the ${provider} dashboard and in ${adminUrl}; refund it there or grant access by hand.`,
    html: layout("payment refused", para(`A ${provider} payment event was refused by the store, so the buyer got nothing yet.`) +
      para(`Reason: ${reason}`) + para(`Event: ${eventId} · Session: ${sessionId || "-"} · Order: ${orderId || "-"}`) +
      button(adminUrl, "Open the admin") + para("Refund it in the payment dashboard, or grant access by hand."))
  }),

  "purchase-confirmation": ({ order, items, libraryUrl, guestUrl }) => {
    const lines = items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""} — ${money(i.line_total_cents, order.currency)}`);
    const access = guestUrl
      ? `Download from your library: ${guestUrl}\n(This link works for 30 days. Create an account with this email to keep your files forever: ${libraryUrl})`
      : `Download from your library: ${libraryUrl}`;
    return {
      subject: `Order ${order.id} — your files are ready`,
      text: `Thanks! Order ${order.id} is paid.\n\n${lines.join("\n")}\nTotal: ${money(order.total_cents, order.currency)}\n\n${access}`,
      html: layout("order received",
        para(`Order ${order.id} is paid. These pieces are yours now:`) +
        `<table style="width:100%;border-collapse:collapse;margin:0 0 12px">${items.map((i) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #222">${esc(i.title)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #222;text-align:right;color:#33ff66">${money(i.line_total_cents, order.currency)}</td></tr>`).join("")}
        <tr><td style="padding:8px 0">Total</td><td style="padding:8px 0;text-align:right;color:#33ff66">${money(order.total_cents, order.currency)}</td></tr></table>` +
        button(guestUrl || libraryUrl, "Open your library") +
        (guestUrl ? para(`This link works for 30 days. Create an account with ${order.email} to keep your files: ${libraryUrl}`) : ""))
    };
  }
};

export function render(kind, data) {
  const t = templates[kind];
  if (!t) throw new Error(`Unknown email template: ${kind}`);
  return t(data);
}
