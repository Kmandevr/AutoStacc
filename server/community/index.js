// The community's composition root: registers the features (features/index.js) before anything reads the core's
// hooks, then hands out the core's routes (for server/app.js), page handler (for functions/community*.js) and its part
// of the daily sweep (for server/maintenance/sweep.js): retention always, then the switched-on features' upkeep.
import "./features/index.js";
export { routes } from "./core/routes.js";
export { onCommunityRequest } from "./core/entry.js";
export { communityTagCounts } from "./core/spaces.js";
import { communityRetention } from "./core/retention.js";
import { sweepFeatures } from "./core/hooks.js";

export const communitySweep = async (app, opts = {}) => ({ retention: await communityRetention(app, opts), features: await sweepFeatures(app, opts) });
