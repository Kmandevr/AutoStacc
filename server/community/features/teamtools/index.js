// A team's tools for its space (owner, 2026-10-20; docs/community.md, "Features"): edit the space's description and
// rules, add channels, rename them, choose who may start takes and which kinds they take, archive and bring back.
// The writes go through the core's channels.js; this feature checks the person is on the team and clears the cached
// pages. Pinning and featuring takes is the moderation feature's. Its own switch (community.teamTools).
import { json, readJson, str } from "../../../lib/http.js";
import { all, first } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { setSpaceText, addChannel, updateChannel } from "../../core/channels.js";
import { purge } from "../../core/purge.js";
import { logStmts } from "../../core/moderate.js";

const note = (app, space, user, action, reason) => app.db.batch(logStmts(app.db, { spaceId: space.id, actorId: user.id, action, targetType: "space", targetId: space.id, reason }));

async function settings(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId);
  const row = await first(app.db, "SELECT description, rules FROM community_spaces WHERE id = ?", space.id);
  const channels = await all(app.db, `SELECT id, name, post_types AS postTypes, who_may_start AS whoMayStart, archived_at AS archivedAt
    FROM community_channels WHERE space_id = ? ORDER BY position, name`, space.id);
  return json({ description: row.description, rules: row.rules, channels: channels.map((c) => ({ ...c, postTypes: c.postTypes.split(","), archived: Boolean(c.archivedAt), archivedAt: undefined })) }, 200, { "Cache-Control": "no-store" });
}

async function text(app, { spaceId }) {
  const { user, space } = await teamSpace(app, spaceId, { write: true, name: "community-team-tools" });
  const b = await readJson(app.request, 16 * 1024);
  await setSpaceText(app.db, space, { description: b.description, rules: b.rules });
  await note(app, space, user, "space_text", "Description and rules edited");
  purge(app, { space });
  return json({ ok: true });
}

async function channelAdd(app, { spaceId }) {
  const { user, space } = await teamSpace(app, spaceId, { write: true, name: "community-team-tools" });
  const b = await readJson(app.request);
  await addChannel(app.db, space, b);
  await note(app, space, user, "channel_add", String(b.name).slice(0, 40));
  purge(app, { space });
  return json({ ok: true }, 201);
}

async function channelChange(app, { spaceId }) {
  const { user, space } = await teamSpace(app, spaceId, { write: true, name: "community-team-tools" });
  const b = await readJson(app.request);
  await updateChannel(app.db, space, str(b.id, "id", { max: 80 }), b);
  await note(app, space, user, "channel_change", str(b.id, "id", { max: 80 }));
  purge(app, { space });
  return json({ ok: true });
}

export default {
  name: "teamtools",
  switch: "community.teamTools",
  routes: [
    ["GET", "/api/community/spaces/:spaceId/settings", settings],
    ["PUT", "/api/community/spaces/:spaceId/text", text],
    ["POST", "/api/community/spaces/:spaceId/channels", channelAdd],
    ["PATCH", "/api/community/spaces/:spaceId/channels", channelChange]
  ]
};
