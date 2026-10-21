// When a counter-notice's content may come back (docs/copyright.md): the law asks for at least 10 and at most 14
// business days after it's received, so AutoStacc waits 10 US business days plus one (weekends and US federal
// holidays, with their observed days, don't count). Pure, for unit tests.
const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m, d);
const nth = (y, m, weekday, n) => { const first = new Date(utc(y, m, 1)).getUTCDay(); return utc(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7); };
const last = (y, m, weekday) => { const end = utc(y, m + 1, 0); return end - ((new Date(end).getUTCDay() - weekday + 7) % 7) * DAY; };
// A fixed-date holiday on a Saturday is observed the Friday before, on a Sunday the Monday after.
const observed = (t) => { const w = new Date(t).getUTCDay(); return w === 6 ? t - DAY : w === 0 ? t + DAY : t; };

export function holidays(y) {
  return new Set([
    observed(utc(y, 0, 1)), nth(y, 0, 1, 3), nth(y, 1, 1, 3), last(y, 4, 1), observed(utc(y, 5, 19)), observed(utc(y, 6, 4)),
    nth(y, 8, 1, 1), nth(y, 9, 1, 2), observed(utc(y, 10, 11)), nth(y, 10, 4, 4), observed(utc(y, 11, 25)),
    observed(utc(y + 1, 0, 1)) // next New Year's Day can be observed on 31 December
  ]);
}

export const BUSINESS_DAYS = 11;

// The moment `days` business days after `fromMs` have passed (the end of the last one, UTC).
export function afterBusinessDays(fromMs, days = BUSINESS_DAYS) {
  let t = Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), new Date(fromMs).getUTCDate());
  let left = days;
  while (left > 0) {
    t += DAY;
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6 && !holidays(new Date(t).getUTCFullYear()).has(t)) left--;
  }
  return new Date(t + DAY).toISOString();
}
