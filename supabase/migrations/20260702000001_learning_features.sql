-- supabase/migrations/20260702000001_learning_features.sql

-- errors_log: spaced-repetition review tracking
ALTER TABLE public.errors_log
  ADD COLUMN IF NOT EXISTS review_count     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_review_at   timestamptz NOT NULL DEFAULT now();

-- sessions: topic key (e.g. 'introductions', 'travel')
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS topic text;

-- messages: optional pronunciation hint from GPT
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pronunciation_hint text;

-- daily mission completion log
CREATE TABLE IF NOT EXISTS public.daily_missions_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date         date        NOT NULL DEFAULT current_date,
  mission_key  text        NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_missions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_missions_log: own rows" ON public.daily_missions_log
  FOR ALL USING (auth.uid() = user_id);
