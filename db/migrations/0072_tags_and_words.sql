-- Hashtags on anything and word levels (owner, 2026-10-27, #230; docs/community.md "Tags" and "Word levels").
-- Creators, projects and community spaces take tags like products, releases and events already do (the store's rule,
-- server/lib/tags.js: a JSON list of up to 8 folded tags). Takes keep theirs in community_thread_tags, now typed
-- freely; a space's own list (community_space_tags) stays as the suggestions its team offers.
ALTER TABLE creators ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));
ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));
ALTER TABLE community_spaces ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));

-- A tag a space's team hides in its space: its takes keep it, but it isn't shown or listed there.
CREATE TABLE community_hidden_tags (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, tag)
);

-- AutoStacc's admins' site-wide tag rules: hide a tag everywhere, or rename it (everything tagged with it shows and is
-- found under the new name). Applied wherever tags are shown, suggested or searched; nothing tagged is rewritten.
CREATE TABLE tag_rules (
  tag TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('hide', 'rename')),
  rename_to TEXT,
  created_at TEXT NOT NULL,
  CHECK ((action = 'rename') = (rename_to IS NOT NULL))
);

-- A space whose team wants it clean: strong words are refused in posts there too (spaces may only be stricter).
ALTER TABLE community_spaces ADD COLUMN clean_words INTEGER NOT NULL DEFAULT 0;

-- How a reader sees strong words in posts: 'restricted' (softened, f***; the default), 'none' (as written) or 'off'
-- (posts with them fold away behind "Show post").
ALTER TABLE community_members ADD COLUMN word_view TEXT NOT NULL DEFAULT 'restricted' CHECK (word_view IN ('none', 'restricted', 'off'));
