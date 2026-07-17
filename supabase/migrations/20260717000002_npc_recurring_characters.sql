ALTER TABLE sessions ADD COLUMN IF NOT EXISTS npc_key text;

CREATE TABLE IF NOT EXISTS npc_encounters (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  npc_key               text NOT NULL,
  encounter_count       integer NOT NULL DEFAULT 0,
  first_encountered_at  timestamptz,
  last_encountered_at   timestamptz,
  last_summary_pt       text,
  UNIQUE (user_id, npc_key)
);

ALTER TABLE npc_encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_encounters_self" ON npc_encounters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_npc_encounter(p_user_id uuid, p_npc_key text, p_summary_pt text)
RETURNS void AS $$
  INSERT INTO npc_encounters (user_id, npc_key, encounter_count, first_encountered_at, last_encountered_at, last_summary_pt)
  VALUES (p_user_id, p_npc_key, 1, now(), now(), p_summary_pt)
  ON CONFLICT (user_id, npc_key) DO UPDATE SET
    encounter_count = npc_encounters.encounter_count + 1,
    last_encountered_at = now(),
    last_summary_pt = p_summary_pt;
$$ LANGUAGE sql;
