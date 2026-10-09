// The requester, for ownership questions: a signed-in verified account and/or the guest orders their cookie unlocks.
import { currentUser } from "../auth/session.js";
import { guestOrderIds } from "../orders/guest.js";
import { fail } from "../lib/http.js";

export async function resolveAccess(app) {
  const [user, guests] = await Promise.all([currentUser(app), guestOrderIds(app)]);
  return { user: user && user.emailVerified ? user : null, guestOrderIds: guests };
}

export async function requireAccess(app) {
  const access = await resolveAccess(app);
  if (!access.user && !access.guestOrderIds.length) fail(401, "unauthenticated", "Log in to see your library.");
  return access;
}

// A stable label for whoever holds this access, used to bind download links to it.
export const subjectsOf = (access) => [
  ...(access.user ? [`u:${access.user.id}`] : []),
  ...access.guestOrderIds.map((id) => `g:${id}`)
];
