// API community group: the community's public pages, posting and moderation with the feature switch community.forum on (it's off by default,
// so it gets its own store; the switched-off checks run in accounts.test.js). Runs beside the other groups.
import { runGroup } from "./group.js";
import community from "./community.suite.js";
import posting from "./community-posting.suite.js";
import moderation from "./community-moderation.suite.js";

runGroup({ name: "community", ports: { mock: 8840 }, stripe: false, vars: { FEATURES_ON: "community.forum" } }, [community, posting, moderation]);
