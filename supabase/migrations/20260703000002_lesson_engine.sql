-- Lesson catalog (slugs match JSON files in content/curriculum/)
CREATE TABLE lessons (
  slug text PRIMARY KEY,
  cefr_level text NOT NULL CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  order_index integer NOT NULL,
  title_en text NOT NULL,
  title_pt text NOT NULL,
  emoji text,
  estimated_minutes integer DEFAULT 10,
  unlock_after_slug text REFERENCES lessons(slug),
  xp_reward integer DEFAULT 50,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Per-user lesson progress
CREATE TABLE user_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_slug text NOT NULL REFERENCES lessons(slug),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked','available','in_progress','completed')),
  current_step_index integer DEFAULT 0,
  vocab_scores jsonb DEFAULT '{}',
  completed_at timestamptz,
  xp_earned integer DEFAULT 0,
  UNIQUE(user_id, lesson_slug)
);

-- Word-level mastery
CREATE TABLE user_word_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word text NOT NULL,
  lesson_slug text REFERENCES lessons(slug),
  correct_count integer DEFAULT 0,
  incorrect_count integer DEFAULT 0,
  pronunciation_avg numeric DEFAULT 0,
  mastered boolean DEFAULT false,
  next_review_at timestamptz DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, word)
);

-- RLS
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_read" ON lessons FOR SELECT TO authenticated USING (true);

ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ulp_own" ON user_lesson_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_word_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uwm_own" ON user_word_mastery FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed 3 A1 lessons
INSERT INTO lessons (slug, cefr_level, order_index, title_en, title_pt, emoji, estimated_minutes, unlock_after_slug, xp_reward)
VALUES
  ('a1-lesson-01-greetings', 'A1', 1, 'Greetings & Basic Phrases', 'Cumprimentos e Frases Básicas', '👋', 12, null, 50),
  ('a1-lesson-02-numbers',   'A1', 2, 'Numbers 1–10',              'Números de 1 a 10',              '🔢', 12, 'a1-lesson-01-greetings', 50),
  ('a1-lesson-03-colors',    'A1', 3, 'Colors',                    'Cores',                          '🎨', 10, 'a1-lesson-02-numbers',   50);
