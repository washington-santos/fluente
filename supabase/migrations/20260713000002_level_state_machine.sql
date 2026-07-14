-- supabase/migrations/20260713000002_level_state_machine.sql

CREATE TABLE level_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_level  text CHECK (from_level IN ('A1','A2','B1','B2','C1','C2')),
  to_level    text NOT NULL CHECK (to_level IN ('A1','A2','B1','B2','C1','C2')),
  reason      text NOT NULL CHECK (reason IN (
                'placement_recommended',
                'placement_chose_lower',
                'confirmation_suggestion_accepted',
                'manual_downgrade',
                'reinforcement_auto_return'
              )),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE level_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lh_own" ON level_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS level_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinforcement_target_level text
    CHECK (reinforcement_target_level IN ('A1','A2','B1','B2','C1','C2')),
  ADD COLUMN IF NOT EXISTS confirmation_suggestion_dismissed boolean NOT NULL DEFAULT false;
