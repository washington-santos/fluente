-- Mastery system: per-session competency scoring and spaced repetition

-- 7-competency scores per session
CREATE TABLE IF NOT EXISTS topic_assessments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id          uuid REFERENCES sessions(id) ON DELETE SET NULL,
  topic_id            text NOT NULL,
  speaking            integer NOT NULL DEFAULT 50 CHECK (speaking BETWEEN 0 AND 100),
  listening           integer NOT NULL DEFAULT 50 CHECK (listening BETWEEN 0 AND 100),
  pronunciation       integer NOT NULL DEFAULT 50 CHECK (pronunciation BETWEEN 0 AND 100),
  vocabulary          integer NOT NULL DEFAULT 50 CHECK (vocabulary BETWEEN 0 AND 100),
  grammar             integer NOT NULL DEFAULT 50 CHECK (grammar BETWEEN 0 AND 100),
  confidence          integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  fluency             integer NOT NULL DEFAULT 50 CHECK (fluency BETWEEN 0 AND 100),
  final_score         integer NOT NULL DEFAULT 50,
  passed              boolean NOT NULL DEFAULT false,
  failed_competencies text[],
  methodology         text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE topic_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ta_self" ON topic_assessments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add mastery tracking columns to user_topic_progress
ALTER TABLE user_topic_progress
  ADD COLUMN IF NOT EXISTS mastery_status        text DEFAULT 'learning'
    CHECK (mastery_status IN ('learning','mastered','reviewing','needs_reinforcement')),
  ADD COLUMN IF NOT EXISTS best_score            integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_count         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_review_at        timestamptz,
  ADD COLUMN IF NOT EXISTS review_interval_days  integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_methodology      text DEFAULT 'conversation';
