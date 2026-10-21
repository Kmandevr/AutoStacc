// Paid creator storage, the rules and the arithmetic (no database here, so the unit tests cover every case). What a
// creator pays is measured, never estimated: once a day the sweep records what they store (server/creators/storage.js,
// each stored original once), and a month's charge is the sum of that month's days of storage above the free allowance,
// each day a 1/(days in the month) share of a GB-month at that day's rate. A day without a measurement is never charged.
// The rate is the owner's (store setting storage_rate, hundredths of a cent per GB-month: $0.05, owner 2026-10-16).
// A creator caps what they spend a month in dollars; the cap buys an upload limit at the rate, so in the usual case a
// month can't cost more than the cap (storage above a lowered cap is still charged until it's back under: owner).
// What earnings don't cover is charged to the saved card on set days, retried within the grace period (charges.js).
// docs/creators.md, "Paid storage".

export const GB = 1024 ** 3;

export const BILLING = {
  currency: "USD",
  // The spending caps a creator can choose a month, in cents: $1 to $100 (keeps a typo from becoming a large bill).
  minCapCents: 100,
  maxCapCents: 10000,
  // Days after a statement is issued before an unpaid one withdraws the paid limit (the grace period).
  graceDays: 14,
  // The smallest amount charged: Stripe's card minimum in USD. Less is added to the next month's statement.
  minChargeCents: 50,
  // Days after a statement is issued that the daily sweep charges the saved card (the first try, then retries after a
  // decline), all inside the grace period (owner, 2026-10-21, #142).
  chargeDays: [0, 3, 7, 12]
};

/** When the next automatic charge is due, after this many tries (ISO time), or null when there are no tries left. */
export const nextChargeAt = (issuedAtMs, attemptsDone) => (attemptsDone < BILLING.chargeDays.length
  ? new Date(issuedAtMs + BILLING.chargeDays[attemptsDone] * 86400000).toISOString() : null);

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

/**
 * What a statement says: its charge plus anything carried in, settled first from the creator's earnings ready to pay
 * out (owner, 2026-10-16), the rest left for the card: paid (earnings covered it), carried (too small to charge), open
 * or nothing due.
 */
export function statementOf({ usage, carriedIn, availableEarnings = 0 }) {
  const total = usage + carriedIn;
  const earnings = Math.min(total, Math.max(0, availableEarnings));
  const amount = total - earnings;
  const status = total === 0 ? "nothing_due" : amount === 0 ? "paid" : amount < BILLING.minChargeCents ? "carried" : "open";
  return { total, earnings, amount, status };
}

/** The upload limit a monthly spending cap buys at a rate: the free storage plus what the cap pays for all month. */
export const capBytesFor = (capCents, includedBytes, rate) => includedBytes + Math.floor((capCents * 100 * GB) / rate);
