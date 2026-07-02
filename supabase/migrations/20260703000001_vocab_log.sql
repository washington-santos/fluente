CREATE TABLE IF NOT EXISTS public.vocab_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  word          text        NOT NULL,
  definition    text        NOT NULL,
  review_count  integer     NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  next_review_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

ALTER TABLE public.vocab_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vocab_log: own rows" ON public.vocab_log
  FOR ALL USING (auth.uid() = user_id);
