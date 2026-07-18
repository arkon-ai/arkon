-- WI-1848 (2026-07-18): 000's sessions block used created_at where prod (and
-- now the corrected 000) has started_at. Repair DBs initialized from the old
-- 000 — same guarded-rename pattern as 028. No-op on prod and on fresh DBs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'created_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'started_at') THEN
    ALTER TABLE sessions RENAME COLUMN created_at TO started_at;
  END IF;
END;
$$;
