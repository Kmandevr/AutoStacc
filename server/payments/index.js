// Picks the payment provider for this environment. Each provider implements createCheckout, retrieveCheckout and
// livemode; Stripe also verifies webhooks. Adding a provider = one file plus a line here.
// Stripe has two accounts: "main" for AutoStacc's own products and "marketplace" for creators' (server/payments/stripe.js).
import { stripeProvider, marketplaceProvider } from "./stripe.js";
import { mockProvider } from "./mock.js";

const providers = { stripe: stripeProvider, mock: mockProvider };

export const paymentProvider = (app) => providers[app.config.paymentProvider];
export const providerByName = (name) => providers[name];

// The provider for one account of the configured provider. With the mock provider every account is the mock.
export const providerForAccount = (app, account) => (app.config.paymentProvider === "stripe" && account === "marketplace" ? marketplaceProvider : paymentProvider(app));
// The provider that took (or will take) an order's money.
export const providerForOrder = (app, order) => (order.provider === "stripe" && order.payment_account === "marketplace" ? marketplaceProvider : providerByName(order.provider));
