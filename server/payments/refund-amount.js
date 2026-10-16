// How much of an order (or a storage statement) a Stripe refund gave back, in the store's own pre-tax money. Managed
// Payments adds tax on top of the total and Stripe's refund amounts include it, so a refund is scaled by
// total / charged; never more than the total (#129). Without the charged amount (mock events, older events) the
// refund is taken as given. Pure, so both payments/events.js and billing/payments.js use it.
export const preTaxRefund = (totalCents, ev) => {
  const given = ev.amount ?? totalCents;
  const scaled = ev.chargedAmount > totalCents ? Math.round((given * totalCents) / ev.chargedAmount) : given;
  return Math.min(totalCents, Math.max(0, scaled));
};
