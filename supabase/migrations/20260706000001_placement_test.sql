-- placement_results: one row per user, stores full skill breakdown
CREATE TABLE placement_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cefr_level       text NOT NULL CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  speaking_pct     integer NOT NULL CHECK (speaking_pct BETWEEN 0 AND 100),
  listening_pct    integer NOT NULL CHECK (listening_pct BETWEEN 0 AND 100),
  grammar_pct      integer NOT NULL CHECK (grammar_pct BETWEEN 0 AND 100),
  vocabulary_pct   integer NOT NULL CHECK (vocabulary_pct BETWEEN 0 AND 100),
  pronunciation_pct integer NOT NULL CHECK (pronunciation_pct BETWEEN 0 AND 100),
  confidence_pct   integer NOT NULL CHECK (confidence_pct BETWEEN 0 AND 100),
  biggest_difficulty text NOT NULL,
  biggest_strength   text NOT NULL,
  next_objective     text NOT NULL,
  completed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE placement_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_own" ON placement_results FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- learning_plans: one row per user, AI-generated after placement
CREATE TABLE learning_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal             text NOT NULL,
  focus_areas      text[] NOT NULL DEFAULT '{}',
  plan_summary_pt  text NOT NULL,
  cefr_at_creation text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lp_own" ON learning_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
