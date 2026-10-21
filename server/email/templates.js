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
  // Double opt-in: nobody joins a project's mailing list until the address's owner clicks.
  "newsletter-confirm": ({ url, project }) => ({
    subject: `Confirm your sign-up to ${project} — AutoStacc`,
    text: `Confirm you want news from ${project} by email:\n${url}\n\nThe link works for 7 days. Didn't sign up? Ignore this mail and nothing happens. Every newsletter has an unsubscribe link.`,
    html: layout(`Confirm your sign-up to ${project}`, para(`One click and you'll get news from ${project}: new releases, presales and free downloads.`) +
      button(url, "Confirm sign-up") + para("The link works for 7 days. Didn't sign up? Ignore this mail and nothing happens. Every newsletter has an unsubscribe link."))
  }),

  // An invitation to join a creator's team (server/creators/team.js). Accepted only by the account with this address.
  "creator-invite": ({ url, creator, role, inviter }) => ({
    subject: `${inviter} invited you to ${creator} on AutoStacc`,
    text: `${inviter} invited you to join ${creator} in the AutoStacc Studio as ${role}.\nAccept: ${url}\n\nSign in (or create an account) with this email address to accept. The link works for 7 days. Not expecting this? Ignore it and nothing happens.`,
    html: layout(`Join ${creator} on AutoStacc`, para(`${inviter} invited you to join ${creator} in the AutoStacc Studio as ${role}.`) + button(url, "Accept the invitation") +
      para("Sign in (or create an account) with this email address to accept. The link works for 7 days. Not expecting this? Ignore it and nothing happens."))
  }),

  "verify-email": ({ url }) => ({
    subject: "Confirm your email — AutoStacc",
    text: `Confirm your email to finish creating your account:\n${url}\n\nThe link works for 24 hours.\nDidn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens.`,
    html: layout("Confirm your email", para("One click and your account is ready.") + button(url, "Confirm email") +
      para("The link works for 24 hours.") + para("Didn't sign up? Don't click: confirming gives that account anything bought with this email. Ignore this mail and nothing happens."))
  }),

  // After guest purchases join an account (confirmed email or password reset).
  "purchases-linked": ({ count, libraryUrl, resetUrl }) => ({
    subject: "Everything you Stacc'd joined your account — AutoStacc",
    text: `${count} order${count === 1 ? "" : "s"} Stacc'd with this email ${count === 1 ? "is" : "are"} now in Your Stacc: ${libraryUrl}\n\nDidn't create an account? Reset its password now to take it over (this logs everyone else out): ${resetUrl}`,
    html: layout("Everything you Stacc'd joined your account", para(`${count} order${count === 1 ? "" : "s"} Stacc'd with this email ${count === 1 ? "is" : "are"} now in Your Stacc.`) +
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

  // A full refund went through (the customer's own, or one made in the payment dashboard). Partial refunds keep access
  // and send nothing.
  "refund-confirmation": ({ order, items, amountCents }) => ({
    subject: `Order ${order.id} refunded — AutoStacc`,
    text: `Order ${order.id} was refunded: ${money(amountCents, order.currency)} goes back to the card or account you paid with. Banks usually take 5–10 days to show it.\n\n${items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join("\n")}\n\nThese files are no longer in Your Stacc. Didn't ask for this? Reply to this email.`,
    html: layout("Order refunded", para(`Order ${order.id} was refunded: ${money(amountCents, order.currency)} goes back to the card or account you paid with. Banks usually take 5–10 days to show it.`) +
      para(items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")) +
      para("These files are no longer in Your Stacc. Didn't ask for this? Reply to this email."))
  }),

  // A creator's payout request was settled by AutoStacc.
  "payout-settled": ({ status, amountCents, currency, note, studioUrl }) => {
    const paid = status === "paid";
    const head = paid ? `Your payout of ${money(amountCents, currency)} is on its way` : `Your payout request of ${money(amountCents, currency)} was declined`;
    const body = paid ? "AutoStacc has sent it. Stripe or your payment provider shows when it arrives." : "The amount is back in your balance, and you can ask again once anything that needed fixing is sorted.";
    return {
      subject: `${head} — AutoStacc`,
      text: `${head}.\n${body}${note ? `\nNote from AutoStacc: ${note}` : ""}\n\nYour earnings: ${studioUrl}`,
      html: layout(head, para(body) + (note ? para(`Note from AutoStacc: ${note}`) : "") + button(studioUrl, "Open the Studio"))
    };
  },

  // A creator's paid storage (server/billing/): a statement (charged to the saved card, or to pay in the Studio), a card
  // charge that didn't go through or that the bank wants the owner to confirm, a statement past due, or a payment.
  "storage-billing": ({ stage, period, amountCents, currency, dueAt, studioUrl, card, nextTryAt }) => {
    const due = String(dueAt || "").slice(0, 10);
    const amount = money(amountCents, currency);
    const yours = card && (card.brand || card.last4) ? `your ${card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : "card"}${card.last4 ? ` ending ${card.last4}` : ""}` : "your saved card";
    const kept = "Nothing you've stored is deleted or hidden, and buyers keep their downloads.";
    const measured = `It's for what you stored above your free storage in ${period}, measured once a day.`;
    const [head, body, label] = {
      issued: [`Your AutoStacc storage statement for ${period}: ${amount}`, card
        ? `${measured} It's charged to ${yours} on ${String(card.chargeOn || "").slice(0, 10)}; you don't need to do anything. The daily figures are in the Studio.`
        : `${measured} Pay it in the Studio by ${due}. The daily figures are there too.`],
      charge_failed: [`We couldn't charge your card for your ${period} storage`, `The charge of ${amount} to ${yours} didn't go through. ${nextTryAt ? `We'll try again on ${String(nextTryAt).slice(0, 10)}. ` : ""}` +
        `You can update your card or pay in the Studio. If it's still unpaid on ${due}, your paid storage limit pauses and new uploads stop once you're over your free storage. ${kept}`, "Update your card or pay"],
      action_required: [`Your bank wants you to confirm your ${period} storage payment`, `Your bank asked you to confirm the charge of ${amount}, so we can't charge your card automatically this time. ` +
        `Pay it in the Studio by ${due}, where your bank can ask you to confirm. ${kept}`, "Pay in the Studio"],
      past_due: [`Your storage statement for ${period} is overdue`, `Your paid storage limit is paused until it's paid, so new uploads stop once you're over your free storage. ${kept}`],
      paid: [`Thanks: your storage statement for ${period} is paid`, "Your paid storage limit is in place."]
    }[stage] || [`Your storage statement for ${period}`, "Details are in the Studio."];
    return {
      subject: `${head} — AutoStacc`,
      text: `${head}.\n${body}\n\nThe Studio: ${studioUrl}`,
      html: layout(head, para(body) + button(studioUrl, label || "Open the Studio"))
    };
  },

  // To the account whose upload a copyright notice took down (server/copyright/mail.js): what and why, without the
  // claimant's details, and how to answer with a counter-notice.
  "copyright-takedown": ({ work, location, url }) => ({
    subject: "Something you uploaded was taken down for copyright — AutoStacc",
    text: `AutoStacc received a copyright notice about something you uploaded, and took it down.\n\nThe work it names: ${work}\nWhere: ${location}\n\nThis counts as a strike on your account (see the copyright policy). If you think it's a mistake, or you have the rights, you can send a counter-notice:\n${url}`,
    html: layout("Something you uploaded was taken down", para("AutoStacc received a copyright notice about something you uploaded, and took it down.") + para(`The work it names: ${work}`) + para(`Where: ${location}`) +
      para("This counts as a strike on your account (see the copyright policy). If you think it's a mistake, or you have the rights, you can send a counter-notice.") + button(url, "Send a counter-notice"))
  }),

  // To the claimant (server/copyright/counter.js): the counter-notice, which the law requires AutoStacc to pass on,
  // and when the content comes back unless they go to court.
  "copyright-counter-notice": ({ name, address, email, restoreAfter }) => ({
    subject: "A counter-notice to your copyright notice — AutoStacc",
    text: `The person whose upload your copyright notice named has sent a counter-notice, saying it was removed by mistake or misidentification, under penalty of perjury, and consenting to the jurisdiction of the courts.\n\nName: ${name}\nAddress: ${address}\nEmail: ${email}\n\nUnless you tell AutoStacc by ${restoreAfter} that you've filed a court action to stop the infringement, the content will be put back. Reply to this email to tell us.`,
    html: layout("A counter-notice to your copyright notice", para("The person whose upload your copyright notice named has sent a counter-notice, saying it was removed by mistake or misidentification, under penalty of perjury, and consenting to the jurisdiction of the courts.") +
      para(`Name: ${name}`) + para(`Address: ${address}`) + para(`Email: ${email}`) + para(`Unless you tell AutoStacc by ${restoreAfter} that you've filed a court action to stop the infringement, the content will be put back. Reply to this email to tell us.`))
  }),

  // To a space's founder (or a project's owners): nobody on the team acted for 40 days, or reports waited that long,
  // so the space went read-only by itself (server/community/features/upkeep/).
  "community-read-only": ({ space, url }) => ({
    subject: `${space} is read-only for now — AutoStacc`,
    text: `Nobody on ${space}'s team has acted in the community for 40 days, or reports have been waiting that long, so the space is read-only for now: people can still read it, but not post.\n\nHandle the waiting reports on the space's Team desk, then press Reopen:\n${url}`,
    html: layout(`${space} is read-only for now`, para(`Nobody on ${space}'s team has acted in the community for 40 days, or reports have been waiting that long, so the space is read-only for now: people can still read it, but not post.`) +
      para("Handle the waiting reports on the space's Team desk, then press Reopen.") + button(url, "Open the space"))
  }),

  // To the admins: something in the Control Center is waiting for them.
  "admin-alert": ({ title, lines, adminUrl }) => ({
    subject: `Store alert: ${title}`,
    text: `${lines.join("\n")}\n\n${adminUrl}`,
    html: layout(title, lines.map(para).join("") + button(adminUrl, "Open the Control Center"))
  }),

  // Changing an account's email: the link goes to the new address, which must be proven before anything moves.
  "email-change-confirm": ({ url }) => ({
    subject: "Confirm your new email — AutoStacc",
    text: `To make this your AutoStacc account's new email, open this link while logged in to that account and press Confirm:\n${url}\n\nThe link works for 1 hour. Your Stacc moves with the account. Didn't ask for this? Ignore this mail and nothing changes.`,
    html: layout("Confirm your new email", para("To make this your AutoStacc account's new email, open this link while logged in to that account and press Confirm. Your Stacc moves with the account.") + button(url, "Open AutoStacc to confirm") +
      para("The link works for 1 hour. Didn't ask for this? Ignore this mail and nothing changes."))
  }),

  // To the old address, when a change is asked for and when it's done, so a stolen session can't move an account quietly.
  "email-change-notice": ({ stage, newEmail, contactUrl }) => {
    const done = stage === "done";
    const head = done ? "Your account's email was changed" : "Someone asked to change your account's email";
    const body = done ? `Your AutoStacc account now uses ${newEmail}. Sign in with that address from now on.`
      : `A confirmation link was sent to ${newEmail}. Nothing changes unless it's clicked within an hour.`;
    return {
      subject: `${head} — AutoStacc`,
      text: `${body}\n\nWasn't you? Change your password now and contact AutoStacc: ${contactUrl}`,
      html: layout(head, para(body) + para("Wasn't you? Change your password now and contact AutoStacc.") + button(contactUrl, "Contact AutoStacc"))
    };
  },

  // A followed project put out something new (sent from the Control Center's Products tab).
  "new-release": ({ project, title, description, url, settingsUrl }) => ({
    subject: `New from ${project}: ${title}`,
    text: `${project} just put out ${title}.${description ? `\n\n${description}` : ""}\n\n${url}\n\nYou get this because you follow ${project} and new-release emails are on. Switch them off: ${settingsUrl}`,
    html: layout(`New from ${project}: ${title}`, (description ? para(description) : "") + button(url, "Take a look") +
      `<p style="color:#5b6470;font-size:12px;margin-top:20px">You get this because you follow ${esc(project)} and new-release emails are on. <a href="${esc(settingsUrl)}">Switch them off</a>.</p>`)
  }),

  // AutoStacc news, written in the Control Center, to accounts that switched it on. Plain text in, paragraphs out.
  "platform-news": ({ subject, body, settingsUrl }) => {
    const paras = String(body).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    return {
      subject: `${subject} — AutoStacc`,
      text: `${paras.join("\n\n")}\n\nYou get this because AutoStacc news is on in your settings. Switch it off: ${settingsUrl}`,
      html: layout(subject, paras.map(para).join("") +
        `<p style="color:#5b6470;font-size:12px;margin-top:20px">You get this because AutoStacc news is on in your settings. <a href="${esc(settingsUrl)}">Switch it off</a>.</p>`)
    };
  },

  "purchase-confirmation": ({ order, items, libraryUrl, guestUrl }) => {
    const lines = items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""} — ${money(i.line_total_cents, order.currency)}`);
    // A promo code's discount, as its own line before the total.
    const discount = order.discount_cents > 0 ? { label: `Discount${order.promo_code ? ` (${order.promo_code})` : ""}`, amount: `−${money(order.discount_cents, order.currency)}` } : null;
    if (discount) lines.push(`${discount.label} — ${discount.amount}`);
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
        ${discount ? `<tr><td style="padding:6px 0;border-bottom:1px solid #dde2e7">${esc(discount.label)}</td><td style="padding:6px 0;border-bottom:1px solid #dde2e7;text-align:right">${esc(discount.amount)}</td></tr>` : ""}
        <tr><td style="padding:8px 0">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${money(order.total_cents, order.currency)}</td></tr></table>` +
        button(guestUrl || libraryUrl, "Open Your Stacc") +
        (guestUrl ? para(`This link works for 30 days. Create an account with ${order.email} to keep your files: ${libraryUrl}`) : ""))
    };
  }
};

// Purchase mail comes from the store address (customers reply about orders); everything else is automated, from noreply.
const STORE_MAIL = new Set(["purchase-confirmation", "purchases-linked", "refund-confirmation"]);
export const senderOf = (kind) => (STORE_MAIL.has(kind) ? "store" : "noreply");

export function render(kind, data) {
  const t = templates[kind];
  if (!t) throw new Error(`Unknown email template: ${kind}`);
  return t(data);
}
