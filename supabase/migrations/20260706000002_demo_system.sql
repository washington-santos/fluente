-- supabase/migrations/20260706000002_demo_system.sql

-- Add demo tracking columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS demo_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS demo_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS demo_status      text
    CHECK (demo_status IN ('active', 'expired', 'exhausted'));

-- Add 'demo' plan to plans table (referenced by users.plan_id during demo period)
INSERT INTO public.plans (id, name, price_brl, minutes_per_month, features)
VALUES (
  'demo',
  'Demonstração Premium',
  0,
  30,
  ARRAY[
    'Teste de nivelamento por IA',
    'Plano de estudos personalizado',
    'Todos os professores',
    'Correções em tempo real',
    'Dashboard completo',
    'Memória entre aulas',
    'Relatórios de evolução'
  ]
)
ON CONFLICT (id) DO NOTHING;
