// Three copyright strikes in the community (docs/community-safety.md, "Copyright: tiered strikes"): text only, so a
// take, reply or edit with a link from such an account is refused (links are how infringing copies get shared).
// Asks server/copyright/standing.js, the one place that knows an account's strikes. Links already in older posts
// still show (stripping them as pages are drawn is a later step). Its own switch (community.textOnly).
import { fail } from "../../../lib/http.js";
import { accountLevel } from "../../../copyright/standing.js";

const LINK = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}|\]\(\s*\S/i;

async function postCheck(app, { user, body }) {
  if (!LINK.test(String(body || ""))) return;
  if ((await accountLevel(app.db, user.id)).level >= 3) {
    fail(403, "copyright_text_only", "Your account has three copyright strikes, so its posts can't include links for now. See the copyright policy.");
  }
}

export default {
  name: "textonly",
  switch: "community.textOnly",
  checks: { post: postCheck }
};
