-- First-party creators' owner comes from the FIRST_PARTY_OWNERS deploy secret (owner, 2026-10-21, #172), assigned when
-- that verified account opens the Studio (server/studio/creators.js). The interim path that let any AutoStacc admin
-- become the first owner is gone: whoever took ownership that way stays on the team as an admin, not removed.
-- creator_members' CHECK allows only 'owner' and 'editor', so a team admin is an 'editor' row plus creator_roles 'admin'
-- (0026). Forward-only: nobody loses access, no data is dropped.
INSERT INTO creator_roles (creator_id, user_id, role, created_at, updated_at)
  SELECT m.creator_id, m.user_id, 'admin', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM creator_members m JOIN creators c ON c.id = m.creator_id
  WHERE m.role = 'owner' AND c.source = 'catalog'
  ON CONFLICT (creator_id, user_id) DO UPDATE SET role = 'admin', updated_at = excluded.updated_at;

UPDATE creator_members SET role = 'editor'
  WHERE role = 'owner' AND creator_id IN (SELECT id FROM creators WHERE source = 'catalog');
