-- An optional phone number on an account (owner, 2026-10-27), set in Settings › Profile. Private: never shown to anyone
-- else or shared, kept only to reach the person about their account; removed when they clear it or delete the account.
CREATE TABLE IF NOT EXISTS account_phone (
  user_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
