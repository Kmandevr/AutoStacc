-- A creator's avatar and banner (owner, 2026-10-22, #211): two of the creator's own uploaded images (site_assets ids),
-- shown on their card in Discover and its spotlight. Picked in the Studio by the creator's owner; NULL until then.
ALTER TABLE creators ADD COLUMN avatar_asset TEXT;
ALTER TABLE creators ADD COLUMN banner_asset TEXT;
