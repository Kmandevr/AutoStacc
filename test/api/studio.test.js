// API studio group: the Product Studio's workspace, release history, readiness, creator sales and insights, and the visual builder
// (docs/studio.md), against its own mock-payments store so its sales and orders never change what other suites see.
// Runs beside accounts.test.js and payments.test.js (npm run test:api).
import { runGroup } from "./group.js";
import studio from "./studio.suite.js";
import builder from "./builder.suite.js";
import team from "./team.suite.js";
import library from "./library.suite.js";
import comingSoon, { SWEEP_TOKEN } from "./coming-soon.suite.js";

runGroup({ name: "studio", ports: { mock: 8820 }, stripe: false, vars: { SWEEP_TOKEN } }, [studio, builder, team, library, comingSoon]);
