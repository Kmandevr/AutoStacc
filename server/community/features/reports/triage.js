// Ranking a space team's report queue (docs/community-safety.md, "Reports, emergencies and false reports"): danger
// reports first, then wording that suggests someone may be hurt or threatened, then harassment, then how many people
// reported it; oldest first among equals. Plain word lists matched here on our own server: nothing is sent anywhere.
// It only orders the queue; it never hides or removes anything by itself.
const HURT = [/\bkill(?:ing)? (?:my ?self|me)\b/, /\bsuicid/, /\bend (?:my life|it all)\b/, /\bself[- ]?harm/, /\bwant to die\b/, /\bcut(?:ting)? myself\b/];
const THREAT = [/\b(?:kill|hurt|shoot|stab|find) (?:you|u)\b/, /\bdox+(?:ed|ing)?\b/, /\bhome address\b/, /\bswat(?:ted|ting)?\b/, /\bi know where you live\b/];

const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const any = (list, text) => list.some((re) => re.test(text));

// reasons: one per report on the item; text: the reported text plus the reporters' notes.
export function priority({ reasons, text }) {
  const t = fold(text);
  let p = Math.min(reasons.length, 10) * 2;
  if (reasons.includes("danger")) p += 100;
  if (any(HURT, t)) p += 60;
  if (any(THREAT, t)) p += 40;
  if (reasons.includes("harassment")) p += 20;
  return p;
}
