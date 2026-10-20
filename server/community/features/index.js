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

for (const f of [boost, qa, waves, preview, pace]) register(f);
