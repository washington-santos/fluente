-- supabase/migrations/20260709000001_progressive_messages.sql

-- Persist translation + suggested replies (previously computed but never saved,
-- so they disappeared after any page reload / session resume).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_pt text,
  ADD COLUMN IF NOT EXISTS suggested_replies text[];

-- Progressive delivery status — audio/video are synthesized asynchronously
-- after the text response, so the UI can show per-stage loading/fallback state.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_status text NOT NULL DEFAULT 'ready'
    CHECK (audio_status IN ('pending','ready','failed','skipped')),
  ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'skipped'
    CHECK (video_status IN ('pending','ready','failed','skipped')),
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS did_talk_id text;

CREATE INDEX IF NOT EXISTS messages_did_talk_id_idx ON public.messages(did_talk_id)
  WHERE did_talk_id IS NOT NULL;
