-- Account settings (docs/store.md#accounts): which optional emails an account wants. Receipts, password resets and
-- other security mail are always sent and have no switch. Both switches are off until the person turns them on;
-- no row means everything optional is off. Forward-only; nothing existing is rewritten.
CREATE TABLE email_preferences (
  user_id TEXT PRIMARY KEY,
  new_releases INTEGER NOT NULL DEFAULT 0 CHECK (new_releases IN (0, 1)),
  platform_news INTEGER NOT NULL DEFAULT 0 CHECK (platform_news IN (0, 1)),
  updated_at TEXT NOT NULL
);
