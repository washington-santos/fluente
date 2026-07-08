-- Tracks which curriculum topics each user has studied
CREATE TABLE IF NOT EXISTS user_topic_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id text NOT NULL,
  cefr_level text NOT NULL,
  first_taught_at timestamptz DEFAULT now(),
  last_taught_at timestamptz DEFAULT now(),
  taught_count integer DEFAULT 1,
  mastery_score numeric DEFAULT 0.5,
  UNIQUE(user_id, topic_id)
);

ALTER TABLE user_topic_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utp_self" ON user_topic_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI-generated lesson plan stored with each session
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lesson_plan_json jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lesson_topic_id text;

-- Atomic increment of topic taught_count (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION increment_topic_progress(
  p_user_id uuid,
  p_topic_id text,
  p_cefr_level text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO user_topic_progress (user_id, topic_id, cefr_level, last_taught_at, taught_count)
  VALUES (p_user_id, p_topic_id, p_cefr_level, now(), 1)
  ON CONFLICT (user_id, topic_id) DO UPDATE SET
    taught_count = user_topic_progress.taught_count + 1,
    last_taught_at = now();
$$;
