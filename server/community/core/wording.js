// Wording that suggests someone may be hurt or threatened (docs/community-safety.md, "Reports, emergencies and false
// reports"), shared by the reports feature (ranking the team's queue) and the crisis feature (showing help lines).
// Plain word lists matched on our own server; nothing is sent anywhere. Case and accents are folded first.
const HURT = [/\bkill(?:ing)? (?:my ?self|me)\b/, /\bsuicid/, /\bend (?:my life|it all)\b/, /\bself[- ]?harm/, /\bwant to die\b/, /\bcut(?:ting)? myself\b/];
const THREAT = [/\b(?:kill|hurt|shoot|stab|find) (?:you|u)\b/, /\bdox+(?:ed|ing)?\b/, /\bhome address\b/, /\bswat(?:ted|ting)?\b/, /\bi know where you live\b/];

export const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const any = (list, text) => list.some((re) => re.test(fold(text)));

export const mentionsHurt = (text) => any(HURT, text);
export const mentionsThreat = (text) => any(THREAT, text);
