// Ranking a space team's report queue (docs/community-safety.md, "Reports, emergencies and false reports"): danger
// reports first, then wording that suggests someone may be hurt or threatened (core/wording.js), then harassment,
// then how many people reported it; oldest first among equals. It only orders the queue; it never hides or removes
// anything by itself.
import { mentionsHurt, mentionsThreat } from "../../core/wording.js";

// reasons: one per report on the item; text: the reported text plus the reporters' notes.
export function priority({ reasons, text }) {
  let p = Math.min(reasons.length, 10) * 2;
  if (reasons.includes("danger")) p += 100;
  if (mentionsHurt(text)) p += 60;
  if (mentionsThreat(text)) p += 40;
  if (reasons.includes("harassment")) p += 20;
  return p;
}
