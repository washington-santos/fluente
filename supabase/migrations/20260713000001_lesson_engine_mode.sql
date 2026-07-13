-- supabase/migrations/20260713000001_lesson_engine_mode.sql

-- The structured lesson engine (see docs/superpowers/specs/2026-07-13-structured-lesson-engine-design.md)
-- needs its own session mode so /aula and useSession can tell a topic-based
-- structured lesson apart from free-form chat ('daily'/'free').
ALTER TABLE public.sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_mode_check
  CHECK (mode in ('guided','scenario','free','daily','lesson'));
