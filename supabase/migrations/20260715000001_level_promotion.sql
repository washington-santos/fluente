-- supabase/migrations/20260715000001_level_promotion.sql

ALTER TABLE level_history DROP CONSTRAINT IF EXISTS level_history_reason_check;
ALTER TABLE level_history ADD CONSTRAINT level_history_reason_check CHECK (reason IN (
  'placement_recommended',
  'placement_chose_lower',
  'confirmation_suggestion_accepted',
  'manual_downgrade',
  'reinforcement_auto_return',
  'auto_promotion'
));
