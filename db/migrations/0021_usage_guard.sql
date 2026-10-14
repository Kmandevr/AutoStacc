-- The budget guard (docs/packs.md, "Staying inside the $5 Workers Paid plan"; server/usage/): when a processing job was
-- actually sent to the engine. A job waiting for next month's allowance stays 'queued' with no sent_at; its time-out
-- counts from when it is sent, not from when it was made. Meters themselves live in usage_meters (0014).
ALTER TABLE processing_jobs ADD COLUMN sent_at TEXT;
UPDATE processing_jobs SET sent_at = created_at WHERE status <> 'queued';
