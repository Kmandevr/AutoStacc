-- Team roles for creators (owner, 2026-10-15; docs/builder.md, phase 7). creator_members keeps who belongs to a creator
-- (its CHECK allows only 'owner' and 'editor', and migrations never rebuild tables): every member who isn't the owner
-- is an 'editor' row there, and creator_roles says which role they have. Roles and what each may do:
-- server/creators/roles.js. Only the owner controls money.
CREATE TABLE creator_roles (
  creator_id TEXT NOT NULL REFERENCES creators(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'publisher', 'store_manager', 'editor')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (creator_id, user_id)
);

-- An invitation to join a creator with a role, sent by email. Only a hash of its token is kept; it is accepted by the
-- account signed in with that (confirmed) email address, once, within its 7 days. email is kept so the team page can
-- show who was invited and so it can be withdrawn; it is erased with the invite.
CREATE TABLE creator_invites (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'publisher', 'store_manager', 'editor')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT
);
CREATE INDEX creator_invites_creator ON creator_invites(creator_id, accepted_at);
