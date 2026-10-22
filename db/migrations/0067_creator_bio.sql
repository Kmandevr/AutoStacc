-- A creator's short bio (owner, 2026-10-22, #207): one plain-text line or two shown on their card in the creators
-- directory and Discover. Written in the Studio by the creator's owner; NULL until then.
ALTER TABLE creators ADD COLUMN bio TEXT;
