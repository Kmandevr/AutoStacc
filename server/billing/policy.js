// Paid creator storage, the rules and the arithmetic (no database here, so the unit tests cover every case). What a
// creator pays is measured, never estimated: once a day the sweep records what they store (server/creators/storage.js,
// each stored original once), and a month's charge is the sum of that month's days of storage above the free allowance,
// each day a 1/(days in the month) share of a GB-month at that day's rate. A day without a measurement is never charged.
// The rate is the owner's (store setting storage_rate, hundredths of a cent per GB-month); nothing here holds a price.
// docs/creators.md, "Paid storage".

export const GB = 1024 ** 3;

export const BILLING = {
  currency: "USD",
  // The largest storage limit a creator can choose, in whole GB (keeps a typo from becoming a large bill).
  maxCapGb: 200,
  // Days after a statement is issued before an unpaid one withdraws the paid limit (the grace period).
  graceDays: 14,
  // The smallest amount charged: Stripe's card minimum in USD. Less is added to the next month's statement.
  minChargeCents: 50
};

// "YYYY-MM" of a time, the month before it, and its number of days (UTC).
export const periodOf = (ms) => new Date(ms).toISOString().slice(0, 7);
export const previousPeriod = (period) => {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const daysInPeriod = (period) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// What one day costs: billable bytes are what's stored above the allowance (nothing below it, nothing while there's no
// plan to charge or no rate).
export const billableBytes = ({ usedBytes, includedBytes, charged }) => (charged ? Math.max(0, usedBytes - includedBytes) : 0);

/**
 * A month's charge in whole cents from its measured days ([{ billable_bytes, rate }]), exact to the hundredth of a cent
 * and rounded half up once at the end, so splitting the month differently can't change the total.
 */
export function usageCents(days, period) {
  const dim = BigInt(daysInPeriod(period));
  let hundredths = 0n; // hundredths of a cent × GB × days in the month
  for (const d of days) if (d.rate && d.billable_bytes > 0) hundredths += BigInt(d.billable_bytes) * BigInt(d.rate);
  const denom = BigInt(GB) * dim * 100n;
  return Number((hundredths * 2n + denom) / (denom * 2n));
}

/** What a statement says: its charge plus anything carried in, and whether it's charged, carried or nothing. */
export function statementOf({ usage, carriedIn }) {
  const amount = usage + carriedIn;
  const status = amount === 0 ? "nothing_due" : amount < BILLING.minChargeCents ? "carried" : "open";
  return { amount, status };
}

/** The most a month can cost at a limit and rate: what the Studio shows next to the limit a creator picks. */
export const maxMonthlyCents = (capBytes, includedBytes, rate) =>
  rate ? Math.ceil((Math.max(0, capBytes - includedBytes) * rate) / GB / 100) : 0;
