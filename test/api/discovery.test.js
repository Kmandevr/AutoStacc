// API discovery group: store search, filters, recommendations, wishlists and Studio store details, against its own
// mock-payments store, since its synthetic catalog (thousands of products) must not change what other suites see.
// Runs beside accounts.test.js and payments.test.js (npm run test:api).
import { runGroup } from "./group.js";
import discovery from "./discovery.suite.js";

runGroup({ name: "discovery", ports: { mock: 8807 }, stripe: false }, [discovery]);
