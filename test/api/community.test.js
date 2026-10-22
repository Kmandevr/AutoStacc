// API community group: the community's public pages, posting, moderation, upkeep and AutoStacc's queue with the feature switch community.forum on (it's off by default,
// so it gets its own store; the switched-off checks run in accounts.test.js). Runs beside the other groups.
import { runGroup } from "./group.js";
import community from "./community.suite.js";
import posting from "./community-posting.suite.js";
import moderation from "./community-moderation.suite.js";
import upkeep, { SWEEP_TOKEN } from "./community-upkeep.suite.js";
import legal from "./community-legal.suite.js";
import rich from "./community-rich.suite.js";
import automod from "./community-automod.suite.js";
import keepup from "./community-keepup.suite.js";
import find from "./community-find.suite.js";
import team from "./community-team.suite.js";
import projects from "./community-projects.suite.js";

runGroup({ name: "community", ports: { mock: 8840 }, stripe: false, vars: { FEATURES_ON: "community.forum", SWEEP_TOKEN } }, [community, posting, moderation, upkeep, legal, rich, automod, keepup, find, team, projects]);
