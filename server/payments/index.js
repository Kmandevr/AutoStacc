// Picks the payment provider for this environment. Each provider implements createCheckout, retrieveCheckout and
// livemode; Stripe also verifies webhooks. Adding a provider = one file plus a line here.
import { stripeProvider } from "./stripe.js";
import { mockProvider } from "./mock.js";

const providers = { stripe: stripeProvider, mock: mockProvider };

export const paymentProvider = (app) => providers[app.config.paymentProvider];
export const providerByName = (name) => providers[name];
