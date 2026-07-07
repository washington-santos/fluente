-- supabase/migrations/20260707000001_vip_users.sql
CREATE TABLE IF NOT EXISTS public.vip_users (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text          NOT NULL UNIQUE,
  plan        text          NOT NULL DEFAULT 'pro',
  active      boolean       NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- RLS: only service role can read/write (admin panel uses service role key)
ALTER TABLE public.vip_users ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon/authenticated keys; only service role bypasses RLS

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER vip_users_updated_at
  BEFORE UPDATE ON public.vip_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
