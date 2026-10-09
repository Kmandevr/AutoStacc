// Adding a confirmed address to a project's Brevo list (the newsletter itself is written and sent in Brevo, which
// adds the unsubscribe link). With the local "log" email provider nothing leaves the machine.

export async function addContact(config, email, listId) {
  if (config.emailProvider !== "brevo") return;
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": config.brevoKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, listIds: [listId], updateEnabled: true })
  });
  // 201 created, 204 updated (already a contact: the list is added).
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo responded ${res.status}${err.code ? ` ${err.code}` : ""}`);
  }
}
