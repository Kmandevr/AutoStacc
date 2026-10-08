// Who counts as an admin: a verified account with role "admin" or an ADMIN_EMAILS address. Never someone being
// impersonated (an impersonated customer is always a customer, whatever their row says).
export const isAdmin = (app, user) =>
  Boolean(user && !user.impersonated && user.emailVerified && (user.role === "admin" || app.config.adminEmails.has(String(user.email).toLowerCase())));
