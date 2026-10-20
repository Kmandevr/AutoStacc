// AutoStacc's legal minimum in the community (docs/community-safety.md; issue #137): the Control Center's queue of
// reports routed to AutoStacc, decided as a legal removal, dismissed or an underage account (queue.js), and the
// community suspensions it can lift (suspensions.js). Legal removals go through the core's moderate.js. Its own
// switch (community.legal): off, the queue and suspensions are 404; decisions already made stay.
import { queueRoutes } from "./queue.js";
import { suspensionRoutes } from "./suspensions.js";

export default {
  name: "legal",
  switch: "community.legal",
  routes: [...queueRoutes, ...suspensionRoutes]
};
