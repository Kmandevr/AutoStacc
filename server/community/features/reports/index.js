// Reports (docs/community.md, "Who enforces what"; docs/community-safety.md; issue #137): members report takes and
// posts with a reason and a note (filing.js), routed to the space's team or to AutoStacc; enough trusted reporters
// hide a post until the team decides; the team's queue is ranked with danger first (queue.js, triage.js). Shares the
// core's moderate.js with the moderation feature, never the feature itself. Its own switch (community.reports): off,
// nobody can report and the queue is 404; reports already made are kept.
import { all } from "../../../lib/db.js";
import { filingRoutes } from "./filing.js";
import { queueRoutes } from "./queue.js";

export default {
  name: "reports",
  switch: "community.reports",
  routes: [...filingRoutes, ...queueRoutes],
  // Account deletion keeps reports (they're evidence for 12 months) but not who made them: the core does that.
  exportData: async (db, userId) => ({
    reports: await all(db, `SELECT target_type AS targetType, target_id AS targetId, reason, note, status, created_at AS createdAt
      FROM community_reports WHERE reporter_user_id = ? ORDER BY created_at`, userId)
  })
};
