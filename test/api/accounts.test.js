// API security and break tests, accounts group: sign-in, downloads, guests, hygiene, admin, platform, pages, stats,
// creators and account settings, against its own mock-payments store. Runs beside payments.test.js (npm run test:api).
import { runGroup } from "./group.js";
import auth from "./auth.suite.js";
import downloads from "./downloads.suite.js";
import guests from "./guests.suite.js";
import hygiene from "./hygiene.suite.js";
import admin from "./admin.suite.js";
import platform from "./platform.suite.js";
import pages from "./pages.suite.js";
import stats from "./stats.suite.js";
import creators from "./creators.suite.js";
import account from "./account.suite.js";
import newsletter from "./newsletter.suite.js";
import notifications from "./notifications.suite.js";
import emailChange from "./email-change.suite.js";
import projects from "./projects.suite.js";
import collections from "./collections.suite.js";
import reviews from "./reviews.suite.js";
import { switchedOff as twoFactorOff } from "./two-factor.suite.js";

runGroup({ name: "accounts", ports: { mock: 8801 }, stripe: false },
  [auth, downloads, guests, hygiene, admin, platform, pages, stats, creators, account, newsletter, notifications, emailChange, projects, collections, reviews, twoFactorOff]);
