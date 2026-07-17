-- Reconcile migration history with production: topic_assessments' timestamp
-- column is assessed_at (renamed directly in the live DB at some point after
-- 20260708000002_mastery_system.sql, which still declares created_at).
-- Idempotent: safe whether the live column is still created_at or already assessed_at.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'topic_assessments' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'topic_assessments' AND column_name = 'assessed_at'
  ) THEN
    ALTER TABLE topic_assessments RENAME COLUMN created_at TO assessed_at;
  END IF;
END $$;
