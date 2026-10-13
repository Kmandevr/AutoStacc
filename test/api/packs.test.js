// API packs group: the Pack Builder's upload → process → publish → download path, against its own mock-payments store
// and the mock engine (test/mock-engine), which reads uploads and writes originals through the store's stand-in storage
// relay exactly as the real engine does through its Worker. Runs beside the other groups (npm run test:api).
import { after } from "node:test";
import { runGroup } from "./group.js";
import { startMockEngine } from "../mock-engine/server.js";
import packs, { SWEEP_TOKEN } from "./packs.suite.js";
import packsStudio from "./packs-studio.suite.js";
import packsRevisions from "./packs-revisions.suite.js";
import packsStore from "./packs-store.suite.js";

const STORE = 8808;
const engine = await startMockEngine(8818, { storage: `http://localhost:${STORE}/api/internal/engine-storage` });
after(() => engine.close());

runGroup({ name: "packs", ports: { mock: STORE }, stripe: false, vars: { ENGINE_URL: engine.url, SWEEP_TOKEN } }, [packs, packsStudio, packsRevisions, packsStore]);
