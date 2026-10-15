// API two-step sign-in group: admins' authenticator-app codes with the feature switch auth.adminTwoFactor on (it's
// off by default, so it gets its own store; the switched-off checks run in accounts.test.js). Runs beside the other
// groups (npm run test:api).
import { runGroup } from "./group.js";
import twoFactor from "./two-factor.suite.js";

runGroup({ name: "two-factor", ports: { mock: 8830 }, stripe: false, vars: { FEATURES_ON: "auth.adminTwoFactor" } }, [twoFactor]);
