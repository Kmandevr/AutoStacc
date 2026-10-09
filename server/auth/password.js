// Re-checking the signed-in person's password before something that can't be undone or hands the account over
// (deleting it, changing its email). Better Auth does the comparison; a wrong password is false, anything else throws.
import { createAuth } from "./index.js";

export async function passwordMatches(app, password) {
  try {
    await createAuth(app).api.verifyPassword({ body: { password }, headers: app.request.headers });
    return true;
  } catch (e) {
    if (e && (e.status === "BAD_REQUEST" || e.statusCode === 400)) return false;
    throw e;
  }
}
