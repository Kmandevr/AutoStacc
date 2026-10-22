// The community's features, in one list (docs/community.md, "Built as independent features"). Each registers its
// manifest with the core's hooks (core/hooks.js); adding a feature is one import and one line here, and removing one
// is deleting its line. Features never import each other. Order matters only where two features arrange the same
// thing (the later one wins).
import { register } from "../core/hooks.js";
import boost from "./boost/index.js";
import qa from "./qa/index.js";
import waves from "./waves/index.js";
import preview from "./preview/index.js";
import pace from "./pace/index.js";
import moderation from "./moderation/index.js";
import reports from "./reports/index.js";
import blocks from "./blocks/index.js";
import crisis from "./crisis/index.js";
import upkeep from "./upkeep/index.js";
import legal from "./legal/index.js";
import textonly from "./textonly/index.js";
import embeds from "./embeds/index.js";
import cards from "./cards/index.js";
import codeblocks from "./codeblocks/index.js";
import linkrules from "./linkrules/index.js";
import wordfilter from "./wordfilter/index.js";
import newaccount from "./newaccount/index.js";
import patterns from "./patterns/index.js";
import follows from "./follows/index.js";
import joined from "./joined/index.js";
import saved from "./saved/index.js";
import mentions from "./mentions/index.js";
import inbox from "./inbox/index.js";
import search from "./search/index.js";
import tags from "./tags/index.js";
import similar from "./similar/index.js";
import selfpromo from "./selfpromo/index.js";
import welcome from "./welcome/index.js";
import look from "./look/index.js";
import teamtools from "./teamtools/index.js";
import profilecard from "./profilecard/index.js";

for (const f of [boost, qa, waves, preview, pace, moderation, reports, blocks, crisis, upkeep, legal, textonly, embeds, cards, codeblocks, linkrules, wordfilter, newaccount, patterns, follows, joined, saved, mentions, inbox, search, tags, similar, selfpromo, welcome, look, teamtools, profilecard]) register(f);
