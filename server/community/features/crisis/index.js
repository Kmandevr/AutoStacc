// Help lines beside self-harm wording (docs/community-safety.md, "Reports, emergencies and false reports"; issue
// #137): under any post whose words suggest someone may hurt themselves (core/wording.js, matched on our own
// server), a quiet note with where to find help right now. It never hides, flags or reports the post; anyone worried
// about the person can still report it as "Someone may be in danger". Its own switch (community.crisis).
import { mentionsHurt } from "../../core/wording.js";

export const CRISIS_NOTE = `<aside class="cm-crisis" role="note"><p><strong>If you're going through something hard, you don't have to on your own.</strong>
            In the US, call or text <a href="tel:988">988</a> any time. Elsewhere, <a href="https://findahelpline.com" rel="noopener">find a free helpline near you</a>.
            If someone is in immediate danger, call your local emergency number.</p></aside>`;

export default {
  name: "crisis",
  switch: "community.crisis",
  slots: { postFooter: ({ post }) => (post.state === "visible" && mentionsHurt(post.body) ? CRISIS_NOTE : "") }
};
