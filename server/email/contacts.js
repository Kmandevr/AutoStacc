// Brevo contact lists: adding a confirmed address to a list (project newsletters, AutoStacc news) and taking one off.
// What's sent to a list is written in Brevo, which adds the unsubscribe link. With the local "log" email provider
// nothing leaves the machine.

async function brevo(config, path, body) {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method: "POST",
    headers: { "api-key": config.brevoKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo responded ${res.status}${err.code ? ` ${err.code}` : ""}`);
  }
}

// 201 created, 204 updated (already a contact: the list is added).
export async function addContact(config, email, listId) {
  if (config.emailProvider !== "brevo") return;
  await brevo(config, "/contacts", { email, listIds: [listId], updateEnabled: true });
}

export async function removeContact(config, email, listId) {
  if (config.emailProvider !== "brevo") return;
  await brevo(config, `/contacts/lists/${listId}/contacts/remove`, { emails: [email] });
}

// Keeps the AutoStacc news list in step with an account's "AutoStacc news" switch (BREVO_NEWS_LIST). Best effort, in
// the background: a Brevo hiccup never fails the settings change, and the Control Center's own sends read the switch.
export function syncNewsList(app, email, on) {
  const listId = app.config.newsListId;
  if (listId === null) return;
  const job = (on ? addContact : removeContact)(app.config, email, listId).catch((e) => console.error("news list", e.message));
  if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(job);
  return job;
}
