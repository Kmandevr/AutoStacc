// Email templates: each returns { subject, text, html } from plain data. Provider-agnostic; add a new kind here
// (abandoned cart, release announcement, newsletter) without touching the providers.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

// One AutoStacc wrapper: light card, teal heading and button. Inline styles because email clients need them.
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f7;color:#1b1f24;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 18px;font-weight:700;font-size:18px">Auto<span style="color:#0a716a">Stacc</span></p>
<div style="background:#fff;border:1px solid #dde2e7;border-radius:12px;padding:24px">
<h1 style="color:#1b1f24;font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${bodyHtml}
</div>
<p style="color:#5b6470;font-size:12px;margin-top:20px">AutoStacc · autostacc.com</p>
</div></body></html>`;
}
const button = (url, label) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#0a716a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
const para = (s) => `<p style="line-height:1.6;margin:0 0 12px">${esc(s)}</p>`;

export const templates = {
  "verify-email": ({ url }) => ({
    subject: "Confirm your email — AutoStacc",
    text: `Confirm your email to finish creating your account:\n${url}\n\nThe link works for 24 hours.\nDidn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens.`,
    html: layout("Confirm your email", para("One click and your account is ready.") + button(url, "Confirm email") +
      para("The link works for 24 hours.") + para("Didn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens."))
  }),

  // After guest purchases join an account (confirmed email or password reset).
  "purchases-linked": ({ count, libraryUrl, resetUrl }) => ({
    subject: "Your purchases joined your account — AutoStacc",
    text: `${count} purchase${count === 1 ? "" : "s"} made with this email ${count === 1 ? "is" : "are"} now in Your Stacc: ${libraryUrl}\n\nDidn't create an account? Reset its password now to take it over (this logs everyone else out): ${resetUrl}`,
    html: layout("Your purchases joined your account", para(`${count} purchase${count === 1 ? "" : "s"} made with this email ${count === 1 ? "is" : "are"} now in Your Stacc.`) +
      button(libraryUrl, "Open Your Stacc") + para(`Didn't create an account? Reset its password now to take it over (this logs everyone else out): ${resetUrl}`))
  }),

  "reset-password": ({ url }) => ({
    subject: "Reset your password — AutoStacc",
    text: `Someone asked to reset the password for this email. If it was you:\n${url}\n\nThe link works for 1 hour. If it wasn't you, ignore this; nothing changes.`,
    html: layout("Reset your password", para("Someone asked to reset the password for this email. If it was you:") + button(url, "Choose a new password") + para("The link works for 1 hour. If it wasn't you, ignore this; nothing changes."))
  }),

  // Sent instead of an error when someone signs up with an email that already has an account (no account enumeration).
  "account-exists": ({ loginUrl, resetUrl }) => ({
    subject: "You already have an account — AutoStacc",
    text: `Someone tried to create an account with this email, but you already have one.\nLog in: ${loginUrl}\nForgot your password? ${resetUrl}`,
    html: layout("You already have an account", para("Someone tried to create an account with this email, but you already have one.") + button(loginUrl, "Log in") + para(`Forgot your password? ${resetUrl}`))
  }),

  "payment-rejected": ({ provider, eventId, sessionId, orderId, reason, adminUrl }) => ({
    subject: "Store alert: a payment was refused",
    text: `A ${provider} payment event was refused by the store, so the buyer got nothing yet.\nReason: ${reason}\nEvent: ${eventId}\nSession: ${sessionId || "-"}\nOrder: ${orderId || "-"}\n\nCheck it in the ${provider} dashboard and in ${adminUrl}; refund it there or grant access by hand.`,
    html: layout("Payment refused", para(`A ${provider} payment event was refused by the store, so the buyer got nothing yet.`) +
      para(`Reason: ${reason}`) + para(`Event: ${eventId} · Session: ${sessionId || "-"} · Order: ${orderId || "-"}`) +
      button(adminUrl, "Open the admin") + para("Refund it in the payment dashboard, or grant access by hand."))
  }),

  "purchase-confirmation": ({ order, items, libraryUrl, guestUrl }) => {
    const lines = items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""} — ${money(i.line_total_cents, order.currency)}`);
    const access = guestUrl
      ? `Download from Your Stacc: ${guestUrl}\n(This link works for 30 days. Create an account with this email to keep your files forever: ${libraryUrl})`
      : `Download from Your Stacc: ${libraryUrl}`;
    return {
      subject: `Order ${order.id} — your files are ready`,
      text: `Thanks! Order ${order.id} is paid.\n\n${lines.join("\n")}\nTotal: ${money(order.total_cents, order.currency)}\n\n${access}`,
      html: layout("Order received",
        para(`Order ${order.id} is paid. These are yours now:`) +
        `<table style="width:100%;border-collapse:collapse;margin:0 0 12px">${items.map((i) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #dde2e7">${esc(i.title)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #dde2e7;text-align:right">${money(i.line_total_cents, order.currency)}</td></tr>`).join("")}
        <tr><td style="padding:8px 0">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${money(order.total_cents, order.currency)}</td></tr></table>` +
        button(guestUrl || libraryUrl, "Open Your Stacc") +
        (guestUrl ? para(`This link works for 30 days. Create an account with ${order.email} to keep your files: ${libraryUrl}`) : ""))
    };
  }
};

// Purchase mail comes from the store address (customers reply about orders); everything else is automated, from noreply.
const STORE_MAIL = new Set(["purchase-confirmation", "purchases-linked"]);
export const senderOf = (kind) => (STORE_MAIL.has(kind) ? "store" : "noreply");

export function render(kind, data) {
  const t = templates[kind];
  if (!t) throw new Error(`Unknown email template: ${kind}`);
  return t(data);
}
