-- Unique constraint enables the atomic upsert_error_log RPC below
ALTER TABLE public.errors_log
  ADD CONSTRAINT errors_log_user_error_unique UNIQUE (user_id, error_text);

-- Atomic usage_log increment — avoids read-modify-write race in the conversation route
CREATE OR REPLACE FUNCTION public.increment_usage_log(
  p_user_id        uuid,
  p_date           date,
  p_whisper_minutes numeric,
  p_tts_chars      integer,
  p_claude_tokens  integer,
  p_did_credits    integer
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO usage_log (user_id, date, whisper_minutes, tts_chars, claude_tokens, did_credits)
  VALUES (p_user_id, p_date, p_whisper_minutes, p_tts_chars, p_claude_tokens, p_did_credits)
  ON CONFLICT (user_id, date) DO UPDATE SET
    whisper_minutes = usage_log.whisper_minutes + EXCLUDED.whisper_minutes,
    tts_chars       = usage_log.tts_chars       + EXCLUDED.tts_chars,
    claude_tokens   = usage_log.claude_tokens   + EXCLUDED.claude_tokens,
    did_credits     = usage_log.did_credits     + EXCLUDED.did_credits;
$$;

-- Atomic errors_log upsert — avoids duplicate-row race when two turns carry the same error
CREATE OR REPLACE FUNCTION public.upsert_error_log(
  p_user_id    uuid,
  p_error_type text,
  p_error_text text,
  p_correct_form text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO errors_log (user_id, error_type, error_text, correct_form, seen_count, last_seen_at)
  VALUES (p_user_id, p_error_type, p_error_text, p_correct_form, 1, now())
  ON CONFLICT (user_id, error_text) DO UPDATE SET
    seen_count   = errors_log.seen_count + 1,
    last_seen_at = now();
$$;
