-- supabase/migrations/20260711000001_daily_mission_ai.sql

-- Missions become AI-generated per student per day instead of a static
-- repeating list, so the generated content must be persisted the moment
-- it's generated (not just at completion) — completed_at can no longer
-- have a NOT NULL DEFAULT now() default, since a row now exists before
-- the mission is completed.
ALTER TABLE public.daily_missions_log
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT;

ALTER TABLE public.daily_missions_log
  ADD COLUMN IF NOT EXISTS title_pt text,
  ADD COLUMN IF NOT EXISTS description_pt text;

-- Backfill existing completion-only rows (from the old static-mission
-- system) so the NOT NULL constraint below can be added safely. These
-- rows are historical and never re-displayed as "today's mission" —
-- a new day always queries by today's date.
UPDATE public.daily_missions_log SET title_pt = mission_key WHERE title_pt IS NULL;
UPDATE public.daily_missions_log SET description_pt = mission_key WHERE description_pt IS NULL;

ALTER TABLE public.daily_missions_log
  ALTER COLUMN title_pt SET NOT NULL,
  ALTER COLUMN description_pt SET NOT NULL;

-- Lifetime mission-completion counter (reward), same simple-counter
-- pattern as the existing users.streak_days column.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS missions_completed_count integer NOT NULL DEFAULT 0;

-- Atomic increment, same pattern as increment_topic_progress in
-- supabase/migrations/20260708000001_pedagogy_engine.sql.
CREATE OR REPLACE FUNCTION increment_missions_completed(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users SET missions_completed_count = missions_completed_count + 1 WHERE id = p_user_id;
$$;
