-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── users ────────────────────────────────────────────────────────────────
create table public.users (
  id              uuid references auth.users(id) on delete cascade primary key,
  email           text        not null,
  name            text,
  created_at      timestamptz not null default now(),
  plan_id         text,
  cefr_level      text        check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  teacher_id      uuid,
  personal_context text[],
  streak_days     integer     not null default 0,
  last_session_at timestamptz,
  preferred_session_time time,
  theme           text        not null default 'dark' check (theme in ('light','dark'))
);

alter table public.users enable row level security;
create policy "users: own row" on public.users
  for all using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── onboarding_progress ─────────────────────────────────────────────────
create table public.onboarding_progress (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references public.users(id) on delete cascade not null,
  current_step            integer not null default 1 check (current_step between 1 and 8),
  written_answers         text[],
  conversation_transcript text,
  completed_at            timestamptz,
  unique (user_id)
);

alter table public.onboarding_progress enable row level security;
create policy "onboarding: own row" on public.onboarding_progress
  for all using (auth.uid() = user_id);

-- ── teachers ────────────────────────────────────────────────────────────
create table public.teachers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  system_prompt    text not null,
  tts_voice        text not null,
  tts_provider     text not null default 'openai' check (tts_provider in ('openai','elevenlabs')),
  avatar_image_url text not null,
  levels           text[] not null,
  correction_style text not null,
  memory_prefix    text not null
);

alter table public.teachers enable row level security;
create policy "teachers: public read" on public.teachers
  for select using (true);

-- ── sessions ────────────────────────────────────────────────────────────
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade not null,
  teacher_id       uuid references public.teachers(id) not null,
  mode             text not null default 'daily' check (mode in ('guided','scenario','free','daily')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer,
  replay_text      text,
  main_error       text
);

alter table public.sessions enable row level security;
create policy "sessions: own rows" on public.sessions
  for all using (auth.uid() = user_id);

-- ── messages ────────────────────────────────────────────────────────────
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.sessions(id) on delete cascade not null,
  role            text not null check (role in ('user','assistant')),
  text            text not null,
  audio_url       text,
  had_correction  boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;
create policy "messages: own session" on public.messages
  for all using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );

-- ── session_memory ───────────────────────────────────────────────────────
create table public.session_memory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade not null,
  summary         text not null,
  key_topics      text[] not null default '{}',
  personal_details text[] not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.session_memory enable row level security;
create policy "session_memory: own rows" on public.session_memory
  for all using (auth.uid() = user_id);

-- ── errors_log ───────────────────────────────────────────────────────────
create table public.errors_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete cascade not null,
  error_type   text not null check (error_type in ('verb_tense','vocabulary','preposition','pronunciation','other')),
  error_text   text not null,
  correct_form text not null,
  seen_count   integer not null default 1,
  last_seen_at timestamptz not null default now(),
  resolved_at  timestamptz
);

alter table public.errors_log enable row level security;
create policy "errors_log: own rows" on public.errors_log
  for all using (auth.uid() = user_id);

-- ── vocabulary ───────────────────────────────────────────────────────────
create table public.vocabulary (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade not null,
  word             text not null,
  definition       text not null,
  next_review_at   timestamptz not null default now(),
  ease_factor      numeric not null default 2.5,
  repetition_count integer not null default 0
);

alter table public.vocabulary enable row level security;
create policy "vocabulary: own rows" on public.vocabulary
  for all using (auth.uid() = user_id);

-- ── plans ────────────────────────────────────────────────────────────────
create table public.plans (
  id                 text primary key,
  name               text not null,
  price_brl          numeric not null,
  minutes_per_month  integer not null,
  features           text[] not null default '{}'
);

alter table public.plans enable row level security;
create policy "plans: public read" on public.plans
  for select using (true);

insert into public.plans (id, name, price_brl, minutes_per_month, features) values
  ('free',   'Grátis',    0,     10,  array['1 professor (Mrs. Carol)', 'A1-A2', 'Desafio diário básico']),
  ('basic',  'Básico',    39.9,  120, array['4 professores', 'Todos os níveis', 'Replay', 'Memória entre sessões', 'Dashboard completo', 'Dark mode']),
  ('pro',    'Pro',       79.9,  300, array['Tudo do Básico', 'Cenários avançados', 'Histórico completo', 'Replay por e-mail', 'Prioridade de resposta']),
  ('annual', 'Pro Anual', 599.9, 300, array['Tudo do Pro', '37% de desconto — R$ 49,99/mês']);

-- ── subscriptions ────────────────────────────────────────────────────────
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users(id) on delete cascade not null,
  plan_id            text references public.plans(id) not null,
  status             text not null check (status in ('active','canceled','past_due','trialing')),
  mp_subscription_id text,
  current_period_end timestamptz not null,
  unique (user_id)
);

alter table public.subscriptions enable row level security;
create policy "subscriptions: own row" on public.subscriptions
  for all using (auth.uid() = user_id);

-- ── usage_log ────────────────────────────────────────────────────────────
create table public.usage_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade not null,
  date            date not null default current_date,
  whisper_minutes numeric not null default 0,
  tts_chars       integer not null default 0,
  claude_tokens   integer not null default 0,
  did_credits     integer not null default 0,
  unique (user_id, date)
);

alter table public.usage_log enable row level security;
create policy "usage_log: own rows" on public.usage_log
  for all using (auth.uid() = user_id);
