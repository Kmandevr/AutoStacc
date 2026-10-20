// The community's composition root: registers the features (features/index.js) before anything reads the core's
// hooks, then hands out the core's routes (for server/app.js) and page handler (for functions/community*.js).
import "./features/index.js";
export { routes } from "./core/routes.js";
export { onCommunityRequest } from "./core/entry.js";
