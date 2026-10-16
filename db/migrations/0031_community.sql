-- The community (docs/community.md, docs/community-safety.md; issue #135): spaces, channels, threads, posts, votes,
-- reports, blocks, bans and the space teams' moderation log. Built and off: nothing writes these until the
-- community.forum switch is on (server/lib/features.js). Later migrations add tags, challenges, notification choices,
-- copyright strikes, profiles and points.
--
-- People: one community_members row per person who has picked a display name and confirmed they're 16 or older.
-- Display names are separate from the account name (not unique, private) and from creator names; name_key is the
-- folded form used for uniqueness and impersonation checks. author_user_id columns become NULL when an account is
-- deleted ("deleted user"); D1 doesn't enforce ON DELETE, so server/account/delete.js does it.
CREATE TABLE community_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  age_confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Spaces: AutoStacc's own (platform), a project's official space (project_id set, one per project; its team is the
-- creator's team, read through projects.creator_id, never copied), and communities anyone can start. state: open,
-- read_only (no new posts; set by a team or the 40-day sweep) or archived. official: shown as Official.
CREATE TABLE community_spaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('platform', 'project', 'community')),
  project_id TEXT UNIQUE REFERENCES projects(id),
  founder_user_id TEXT,
  official INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'read_only', 'archived')),
  state_reason TEXT,
  last_team_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((kind = 'project') = (project_id IS NOT NULL))
);
CREATE INDEX community_spaces_founder ON community_spaces(founder_user_id);
CREATE INDEX community_spaces_state ON community_spaces(state, last_team_activity_at);

-- A community's team (founder and moderators). Project spaces use the creator's roles instead.
CREATE TABLE community_space_roles (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('founder', 'moderator')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, user_id)
);
CREATE INDEX community_space_roles_user ON community_space_roles(user_id);

-- Channels: post_types is a comma-separated list of the types allowed (discussion, question, update, poll, challenge);
-- who_may_start: everyone or team.
CREATE TABLE community_channels (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  post_types TEXT NOT NULL DEFAULT 'discussion,question',
  who_may_start TEXT NOT NULL DEFAULT 'everyone' CHECK (who_may_start IN ('everyone', 'team')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (space_id, slug)
);

-- Threads. state: visible, hidden (by a team or automatically after trusted reports, until a team decides), removed
-- (by a team, or by AutoStacc for a legal reason: removed_reason says which). score: upvotes, a stored counter
-- updated in the same batch as the vote. The address is /community/t/<id>-<slug>; an edited title redirects.
CREATE TABLE community_threads (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  channel_id TEXT NOT NULL REFERENCES community_channels(id),
  type TEXT NOT NULL CHECK (type IN ('discussion', 'question', 'update', 'poll', 'challenge')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  author_user_id TEXT,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'hidden', 'removed')),
  removed_reason TEXT CHECK (removed_reason IN ('space_rules', 'legal', 'author')),
  locked INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  accepted_post_id TEXT,
  poll_id TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_post_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX community_threads_channel ON community_threads(channel_id, state, last_post_at);
CREATE INDEX community_threads_space_score ON community_threads(space_id, state, score);
CREATE INDEX community_threads_type ON community_threads(type, state, created_at);
CREATE INDEX community_threads_author ON community_threads(author_user_id);

-- Posts: the thread's opening post is the first one. body is the author's text as written; it is only ever shown
-- through the one formatter (server/community/format.js). helpful: Helpful votes on answers, a stored counter.
CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  author_user_id TEXT,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'hidden', 'removed')),
  removed_reason TEXT CHECK (removed_reason IN ('space_rules', 'legal', 'author')),
  helpful INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  edited_at TEXT
);
CREATE INDEX community_posts_thread ON community_posts(thread_id, created_at);
CREATE INDEX community_posts_author ON community_posts(author_user_id);

-- Earlier versions of an edited post, so edits keep their history.
CREATE TABLE community_post_edits (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  at TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (post_id, at)
);

-- Votes: up on threads, helpful on answers. One per person, target and kind.
CREATE TABLE community_votes (
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('up', 'helpful')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id, user_id, kind)
);
CREATE INDEX community_votes_user ON community_votes(user_id);

-- Reports. route: space (its team: rules, harassment, danger) or autostacc (illegal content, copyright, impersonation).
-- status: open, upheld, dismissed (a dismissed report lowers the reporter's standing).
CREATE TABLE community_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post', 'space', 'member')),
  target_id TEXT NOT NULL,
  space_id TEXT,
  reporter_user_id TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('rules', 'harassment', 'danger', 'spam', 'illegal', 'copyright', 'impersonation', 'underage')),
  note TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL CHECK (route IN ('space', 'autostacc')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed')),
  handled_by TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX community_reports_queue ON community_reports(route, status, created_at);
CREATE INDEX community_reports_space ON community_reports(space_id, status, created_at);
CREATE INDEX community_reports_target ON community_reports(target_type, target_id);
CREATE INDEX community_reports_reporter ON community_reports(reporter_user_id, status, created_at);

-- Person-to-person blocks, bans from one space, and AutoStacc's suspensions from the whole community.
CREATE TABLE community_blocks (
  user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_user_id)
);
CREATE TABLE community_space_bans (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  user_id TEXT NOT NULL,
  until TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, user_id)
);
CREATE TABLE community_suspensions (
  user_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  until TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

-- What space teams did, visible to the team and AutoStacc, so a founder can see and undo it. AutoStacc's own legal
-- actions go in admin_audit as before. Append-only, like admin_audit (0004).
CREATE TABLE community_mod_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  space_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  automatic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX community_mod_log_space ON community_mod_log(space_id, at);
CREATE TRIGGER community_mod_log_no_update BEFORE UPDATE ON community_mod_log BEGIN SELECT RAISE(ABORT, 'community_mod_log is append-only'); END;
CREATE TRIGGER community_mod_log_no_delete BEFORE DELETE ON community_mod_log BEGIN SELECT RAISE(ABORT, 'community_mod_log is append-only'); END;
