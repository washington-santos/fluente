# English Fluent — Plan 1: Foundation, Dark Mode, Schema & Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the English Fluent Next.js 14 project with TypeScript, Tailwind dark mode, complete Supabase schema for all 11 tables, and working email/password + Google OAuth authentication — giving all subsequent plans a fully wired foundation to build on.

**Architecture:** Next.js 14 App Router only (no Pages Router). Supabase handles PostgreSQL and auth. Tailwind CSS uses `darkMode: 'class'` — toggling the `dark` class on `<html>`. Theme persisted in `localStorage` for unauthenticated users; synced to `users.theme` in DB after login.

**Tech Stack:** Next.js 14, TypeScript 5, Tailwind CSS 3, @supabase/supabase-js v2, @supabase/ssr, Inter (next/font/google), Lucide React, Vitest + @testing-library/react + jsdom

## Global Constraints

- App Router only — no Pages Router, no `getServerSideProps`, no `getStaticProps`
- Repo and `package.json` name: `english-fluent`
- Env var prefix for internal vars: `EF_`; keep standard names for services (`OPENAI_`, `ANTHROPIC_`, etc.)
- All student-facing UI copy in Portuguese; teacher speech in English
- `darkMode: 'class'` in Tailwind — toggle adds/removes `dark` class on `<html>`
- Color palette (exact hex — copy verbatim):
  - Light bg `#FFFFFF` · Dark bg `#0F172A`
  - Light card `#F4F7FB` · Dark card `#1E293B`
  - Light text `#1A1A2E` · Dark text `#F1F5F9`
  - Light secondary `#6B7280` · Dark secondary `#94A3B8`
  - Primary (both modes) `#1A3C5E`
  - Interactive (both) `#2E75B6`
  - CTA (both) `#27AE60`
  - Error light `#FFF9C4` · Error dark `#3D3500`
  - Streak/achievement (both) `#F4A829`
- Typography: Inter via `next/font/google` — no other fonts
- Icons: Lucide React only
- Animations: Framer Motion, max 300ms transitions
- Border radius: `rounded-xl`
- Shadows: `shadow-sm` in light; none or subtle in dark
- Working directory / project root: `C:\Users\WINDOWS10\Downloads\fluente`

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies and npm scripts |
| `tailwind.config.ts` | Dark mode class strategy + custom color palette |
| `app/globals.css` | CSS reset, base dark/light html classes |
| `app/layout.tsx` | Root layout: ThemeProvider, Inter font, html tag |
| `app/page.tsx` | Root redirect: /dashboard if authed, /login if not |
| `components/ThemeProvider.tsx` | Context: theme state, toggle, localStorage sync |
| `components/ThemeToggle.tsx` | Sun/Moon button — present on every page |
| `types/index.ts` | All TypeScript interfaces for DB rows and API payloads |
| `lib/supabase.ts` | Browser-side Supabase client (createBrowserClient) |
| `lib/supabase-server.ts` | Server-side Supabase client (createServerClient + cookies) |
| `middleware.ts` | Protect /dashboard /aula /professores /planos /perfil; refresh session |
| `supabase/migrations/20260623000001_schema.sql` | All 11 tables + RLS policies + handle_new_user trigger |
| `app/login/page.tsx` | Login: email/password form + Google OAuth |
| `app/cadastro/page.tsx` | Registration: onboarding screen 1 |
| `app/api/auth/callback/route.ts` | OAuth code exchange handler |
| `.env.local.example` | All required env vars (no values) |
| `vitest.config.ts` | Vitest + jsdom + @/* alias |
| `vitest.setup.ts` | jest-dom matchers |
| `__tests__/sanity.test.ts` | Scaffold smoke test |
| `__tests__/tailwind.test.ts` | Config verification |
| `__tests__/components/ThemeProvider.test.tsx` | ThemeProvider unit tests |
| `__tests__/components/ThemeToggle.test.tsx` | ThemeToggle unit tests |
| `__tests__/middleware.test.ts` | Redirect logic unit tests |
| `__tests__/lib/supabase.test.ts` | Client initialization tests |
| `__tests__/app/login.test.tsx` | Login page form tests |

---

### Task 1: Project Scaffold & Test Infrastructure

**Files:**
- Create: `package.json` (via CLI)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local.example`
- Create: `__tests__/sanity.test.ts`

**Interfaces:**
- Produces: `npm run dev` starts on :3000; `npm run test:run` executes Vitest

- [ ] **Step 1: Create the Next.js 14 project in the current directory**

Run in `C:\Users\WINDOWS10\Downloads\fluente` (PowerShell):
```powershell
npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
```
Expected output ends with: `Success! Created english-fluent` or similar. Files created: `app/`, `public/`, `package.json`, `tailwind.config.ts`, `tsconfig.json`, `next.config.mjs`.

- [ ] **Step 2: Install additional dependencies**

```powershell
npm install @supabase/supabase-js @supabase/ssr lucide-react framer-motion
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: No errors, `package-lock.json` updated.

- [ ] **Step 3: Write the sanity failing test**

Create `__tests__/sanity.test.ts`:
```typescript
describe('project scaffold', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 5: Create `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Add test scripts to `package.json`**

In `package.json`, inside `"scripts"`, add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 7: Run sanity test to verify it passes**

```powershell
npm run test:run
```
Expected output includes: `1 passed`.

- [ ] **Step 8: Create `.env.local.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI (Whisper + TTS)
OPENAI_API_KEY=

# Anthropic (Claude Sonnet + Haiku)
ANTHROPIC_API_KEY=

# D-ID (Avatar)
DID_API_KEY=

# Mercado Pago
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=

# Resend (Email)
RESEND_API_KEY=
```

- [ ] **Step 9: Commit**

```powershell
git init
git add .
git commit -m "feat: scaffold Next.js 14 + Vitest test infrastructure"
```

---

### Task 2: Tailwind Dark Mode + Color System

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Create: `__tests__/tailwind.test.ts`

**Interfaces:**
- Produces: `dark:` variants work; all brand colors available as Tailwind classes (e.g. `bg-brand-cta`, `text-content-dark`)

- [ ] **Step 1: Write the failing test**

Create `__tests__/tailwind.test.ts`:
```typescript
import { readFileSync } from 'fs'

describe('tailwind config', () => {
  it("uses 'class' strategy for dark mode", () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain("darkMode: 'class'")
  })

  it('defines primary brand color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#1A3C5E')
  })

  it('defines CTA color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#27AE60')
  })

  it('defines streak color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#F4A829')
  })

  it('defines dark background color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#0F172A')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npm run test:run -- __tests__/tailwind.test.ts
```
Expected: FAIL — first assertion fails because `darkMode` is not yet `'class'`.

- [ ] **Step 3: Replace `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#1A3C5E',
          interactive: '#2E75B6',
          cta: '#27AE60',
          streak: '#F4A829',
        },
        surface: {
          light: '#FFFFFF',
          'light-card': '#F4F7FB',
          dark: '#0F172A',
          'dark-card': '#1E293B',
        },
        content: {
          light: '#1A1A2E',
          'light-secondary': '#6B7280',
          dark: '#F1F5F9',
          'dark-secondary': '#94A3B8',
        },
        feedback: {
          'error-light': '#FFF9C4',
          'error-dark': '#3D3500',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 4: Replace `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    @apply bg-surface-light text-content-light;
  }
  html.dark {
    @apply bg-surface-dark text-content-dark;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
npm run test:run -- __tests__/tailwind.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add tailwind.config.ts app/globals.css __tests__/tailwind.test.ts
git commit -m "feat: tailwind dark mode class strategy + brand color palette"
```

---

### Task 3: ThemeProvider + ThemeToggle

**Files:**
- Create: `components/ThemeProvider.tsx`
- Create: `components/ThemeToggle.tsx`
- Modify: `app/layout.tsx`
- Create: `__tests__/components/ThemeProvider.test.tsx`
- Create: `__tests__/components/ThemeToggle.test.tsx`

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark', toggle: () => void }` — exported from `components/ThemeProvider.tsx`
- Produces: `<ThemeProvider initialTheme?: 'light' | 'dark'>` — wraps app; syncs class to `<html>` and persists to localStorage key `ef_theme`
- Produces: `<ThemeToggle />` — renders sun icon in dark mode, moon icon in light mode; uses `useTheme()`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/ThemeProvider.test.tsx`:
```typescript
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '@/components/ThemeProvider'

function TestConsumer() {
  const { theme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to dark theme', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('applies dark class to html element', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles to light and removes dark class', async () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    await act(async () => screen.getByText('toggle').click())
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists theme in localStorage under key ef_theme', async () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    await act(async () => screen.getByText('toggle').click())
    expect(localStorage.getItem('ef_theme')).toBe('light')
  })

  it('respects initialTheme prop', () => {
    render(<ThemeProvider initialTheme="light"><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })
})
```

Create `__tests__/components/ThemeToggle.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('renders a button with aria-label "Toggle theme"', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('shows moon icon in light mode', () => {
    render(<ThemeProvider initialTheme="light"><ThemeToggle /></ThemeProvider>)
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument()
  })

  it('shows sun icon in dark mode', () => {
    render(<ThemeProvider initialTheme="dark"><ThemeToggle /></ThemeProvider>)
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/components/
```
Expected: FAIL — "Cannot find module '@/components/ThemeProvider'".

- [ ] **Step 3: Create `components/ThemeProvider.tsx`**

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'dark')

  useEffect(() => {
    if (!initialTheme) {
      const saved = localStorage.getItem('ef_theme') as Theme | null
      if (saved) setTheme(saved)
    }
  }, [initialTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('ef_theme', theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
```

- [ ] **Step 4: Create `components/ThemeToggle.tsx`**

```typescript
'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="p-2 rounded-xl hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors duration-200"
    >
      {theme === 'dark' ? (
        <Sun size={20} className="text-content-dark-secondary" data-testid="sun-icon" />
      ) : (
        <Moon size={20} className="text-content-light-secondary" data-testid="moon-icon" />
      )}
    </button>
  )
}
```

- [ ] **Step 5: Update `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'English Fluent',
  description: 'Fale inglês fluente com um professor de IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/components/
```
Expected: 8 tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add components/ app/layout.tsx __tests__/components/
git commit -m "feat: ThemeProvider + ThemeToggle with dark/light class strategy"
```

---

### Task 4: TypeScript Types

**Files:**
- Create: `types/index.ts`

**Interfaces:**
- Produces: All DB row interfaces and API payload types consumed by every subsequent task

- [ ] **Step 1: Create `types/index.ts`**

No behavioral test needed — TypeScript compilation verifies this.

```typescript
// ── Primitive unions ────────────────────────────────────────────────────
export type Theme = 'light' | 'dark'
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type SessionMode = 'guided' | 'scenario' | 'free' | 'daily'
export type MessageRole = 'user' | 'assistant'
export type ErrorType = 'verb_tense' | 'vocabulary' | 'preposition' | 'pronunciation' | 'other'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing'
export type TtsProvider = 'openai' | 'elevenlabs'

// ── Database row types (column names match Supabase schema exactly) ────
export interface User {
  id: string
  email: string
  name: string | null
  created_at: string
  plan_id: string | null
  cefr_level: CefrLevel | null
  teacher_id: string | null
  personal_context: string[] | null
  streak_days: number
  last_session_at: string | null
  preferred_session_time: string | null
  theme: Theme
}

export interface OnboardingProgress {
  id: string
  user_id: string
  current_step: number
  written_answers: string[] | null
  conversation_transcript: string | null
  completed_at: string | null
}

export interface Teacher {
  id: string
  name: string
  system_prompt: string
  tts_voice: string
  tts_provider: TtsProvider
  avatar_image_url: string
  levels: CefrLevel[]
  correction_style: string
  memory_prefix: string
}

export interface Session {
  id: string
  user_id: string
  teacher_id: string
  mode: SessionMode
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  replay_text: string | null
  main_error: string | null
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  text: string
  audio_url: string | null
  had_correction: boolean
  created_at: string
}

export interface SessionMemory {
  id: string
  user_id: string
  summary: string
  key_topics: string[]
  personal_details: string[]
  created_at: string
}

export interface ErrorLog {
  id: string
  user_id: string
  error_type: ErrorType
  error_text: string
  correct_form: string
  seen_count: number
  last_seen_at: string
  resolved_at: string | null
}

export interface VocabularyItem {
  id: string
  user_id: string
  word: string
  definition: string
  next_review_at: string
  ease_factor: number
  repetition_count: number
}

export interface Plan {
  id: string
  name: string
  price_brl: number
  minutes_per_month: number
  features: string[]
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: SubscriptionStatus
  mp_subscription_id: string | null
  current_period_end: string
}

export interface UsageLog {
  id: string
  user_id: string
  date: string
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}

// ── API payload types ──────────────────────────────────────────────────
export interface ConversationRequest {
  audio_base64?: string
  panic_text?: string
  session_id: string
}

export interface ErrorReport {
  error_detected: boolean
  error_text?: string
  correct_form?: string
  error_type?: ErrorType
}

export interface ConversationResponse {
  text: string
  audio_url: string
  video_url: string | null
  had_correction: boolean
  error_report: ErrorReport
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add types/
git commit -m "feat: TypeScript interfaces for all DB rows and API payloads"
```

---

### Task 5: Supabase Schema Migration

**Files:**
- Create: `supabase/migrations/20260623000001_schema.sql`

**Interfaces:**
- Produces: 11 tables in local Supabase; `handle_new_user` trigger auto-inserts into `public.users` on signup; RLS enabled on all tables

- [ ] **Step 1: Install Supabase CLI (if not installed)**

```powershell
npm install -g supabase
```
Expected: `supabase --version` prints a version number.

- [ ] **Step 2: Initialize Supabase and start local stack**

```powershell
npx supabase init
npx supabase start
```
Expected: Prints local URLs and keys. Copy the `anon key` and `service_role key` into `.env.local` (create from `.env.local.example`):
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from output>
```

- [ ] **Step 3: Create `supabase/migrations/20260623000001_schema.sql`**

```sql
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
    auth.uid() = (select user_id from public.sessions where id = session_id)
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
```

- [ ] **Step 4: Apply migration to local Supabase**

```powershell
npx supabase db reset
```
Expected: Output ends with "Finished supabase db reset."

- [ ] **Step 5: Verify all tables exist**

```powershell
npx supabase db diff --use-migra
```
Expected: Empty diff (schema matches migration).

- [ ] **Step 6: Commit**

```powershell
git add supabase/
git commit -m "feat: complete Supabase schema — 11 tables with RLS + auto user trigger"
```

---

### Task 6: Supabase Client Utilities

**Files:**
- Create: `lib/supabase.ts`
- Create: `lib/supabase-server.ts`
- Create: `__tests__/lib/supabase.test.ts`

**Interfaces:**
- Produces: `createSupabaseClient(): SupabaseClient` — browser-safe; call inside client components or event handlers
- Produces: `createSupabaseServer(): SupabaseClient` — server-only; call inside Server Components, API routes, and middleware

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/supabase.test.ts`:
```typescript
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

import { createSupabaseClient } from '@/lib/supabase'

describe('createSupabaseClient', () => {
  it('returns an object with auth property', () => {
    const client = createSupabaseClient()
    expect(client).toHaveProperty('auth')
  })

  it('returns an object with from() method', () => {
    const client = createSupabaseClient()
    expect(typeof client.from).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npm run test:run -- __tests__/lib/supabase.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/supabase'".

- [ ] **Step 3: Create `lib/supabase.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create `lib/supabase-server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie writes handled by middleware
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
npm run test:run -- __tests__/lib/supabase.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/ __tests__/lib/
git commit -m "feat: Supabase browser and server client utilities"
```

---

### Task 7: Auth Middleware

**Files:**
- Create: `middleware.ts`
- Create: `__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: `createServerClient` from `@supabase/ssr`
- Produces: `middleware(request: NextRequest): Promise<NextResponse>` — exported as named export `middleware` and default matcher config

Protected paths (redirect to `/login` when no user): `/dashboard`, `/aula`, `/professores`, `/planos`, `/perfil`, `/admin`
Auth-only paths (redirect to `/dashboard` when user exists): `/login`, `/cadastro`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/middleware.test.ts`:
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'

function mockUser(user: object | null) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`)
}

describe('middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects unauthenticated request to /dashboard → /login', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects unauthenticated request to /aula → /login', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/aula'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects authenticated request to /login → /dashboard', async () => {
    mockUser({ id: 'user-123' })
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/login'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('allows unauthenticated request to / through', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/middleware.test.ts
```
Expected: FAIL — "Cannot find module '@/middleware'".

- [ ] **Step 3: Create `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/aula', '/professores', '/planos', '/perfil', '/admin']
const AUTH_ONLY = ['/login', '/cadastro']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isAuthOnly = AUTH_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/'))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/middleware.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat: auth middleware — protect dashboard/aula routes, redirect authed users from login"
```

---

### Task 8: Login & Registration Pages + OAuth Callback

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/cadastro/page.tsx`
- Modify: `app/page.tsx`
- Create: `app/api/auth/callback/route.ts`
- Create: `__tests__/app/login.test.tsx`

**Interfaces:**
- Consumes: `createSupabaseClient()` from `lib/supabase.ts`
- Consumes: `ThemeToggle` from `components/ThemeToggle.tsx`
- Consumes: `createSupabaseServer()` from `lib/supabase-server.ts` (in `app/page.tsx`)
- Produces: `/login` page with email/password form + Google OAuth button
- Produces: `/cadastro` page (onboarding screen 1) with same auth options
- Produces: `/api/auth/callback` route that exchanges OAuth code for session

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app/login.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }),
}))

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button>toggle</button>,
}))

import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  it('renders an email input', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText(/seu@email\.com/i)).toBeInTheDocument()
  })

  it('renders a password input', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText(/senha/i)).toBeInTheDocument()
  })

  it('renders the Google OAuth button', () => {
    render(<LoginPage />)
    expect(screen.getByText(/entrar com google/i)).toBeInTheDocument()
  })

  it('shows validation error when email is empty on submit', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText(/e-mail é obrigatório/i)).toBeInTheDocument()
  })

  it('shows validation error when password is empty on submit', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText(/seu@email\.com/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText(/senha é obrigatória/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/login.test.tsx
```
Expected: FAIL — "Cannot find module '@/app/login/page'".

- [ ] **Step 3: Create `app/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseClient } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) { setError('E-mail é obrigatório'); return }
    if (!password) { setError('Senha é obrigatória'); return }

    setLoading(true)
    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) { setError('E-mail ou senha incorretos'); return }

    window.location.href = '/dashboard'
  }

  async function handleGoogle() {
    const supabase = createSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark mb-8 text-center">
            English Fluent
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />

            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface-light dark:bg-surface-dark text-content-light-secondary dark:text-content-dark-secondary">
                ou
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark font-medium hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
          >
            Entrar com Google
          </button>

          <p className="mt-6 text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Não tem conta?{' '}
            <Link href="/cadastro" className="text-brand-interactive hover:underline">
              Criar conta grátis
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Create `app/cadastro/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseClient } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function CadastroPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) { setError('E-mail é obrigatório'); return }
    if (password.length < 8) { setError('A senha deve ter no mínimo 8 caracteres'); return }

    setLoading(true)
    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) { setError(error.message); return }

    window.location.href = '/cadastro/boas-vindas'
  }

  async function handleGoogle() {
    const supabase = createSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/cadastro/boas-vindas`,
      },
    })
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark mb-2 text-center">
            Criar conta
          </h1>
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary mb-8 text-sm">
            Comece a falar inglês hoje. Grátis.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />
            <input
              type="password"
              placeholder="Senha (mín. 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />

            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface-light dark:bg-surface-dark text-content-light-secondary dark:text-content-dark-secondary">
                ou
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark font-medium hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
          >
            Entrar com Google
          </button>

          <p className="mt-6 text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Já tem conta?{' '}
            <Link href="/login" className="text-brand-interactive hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Create `app/api/auth/callback/route.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 6: Update `app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'

export default async function HomePage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
```

- [ ] **Step 7: Run login tests**

```powershell
npm run test:run -- __tests__/app/login.test.tsx
```
Expected: 5 tests PASS.

- [ ] **Step 8: Run full test suite**

```powershell
npm run test:run
```
Expected: All tests PASS, 0 failures.

- [ ] **Step 9: Verify TypeScript**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 10: Verify dev server starts**

```powershell
npm run dev
```
Expected: `ready - started server on 0.0.0.0:3000`. Open http://localhost:3000 — should redirect to `/login`. Dark mode toggle visible in top-right corner. Press Ctrl+C to stop.

- [ ] **Step 11: Commit**

```powershell
git add app/ __tests__/app/
git commit -m "feat: login + cadastro pages with email/password and Google OAuth"
```

---

## Spec Coverage Check

| Briefing section | Covered in this plan |
|-----------------|----------------------|
| §2 Naming & structure | ✅ package name, env prefix, folder layout |
| §4.2 Dark mode | ✅ class strategy, ThemeProvider, ThemeToggle, localStorage |
| §4.3 Color palette | ✅ exact hex values in tailwind.config.ts |
| §4.4 Typography/icons | ✅ Inter, Lucide |
| §5 Onboarding screen 1 | ✅ /cadastro (email + password + Google OAuth) |
| §11 Stack: Next.js, Supabase | ✅ |
| §15 Database schema | ✅ all 11 tables + RLS + trigger |
| §16 Routes: /login, /cadastro | ✅ |
| §19 Env vars | ✅ .env.local.example |

**Deferred to later plans:**

| Briefing section | Plan |
|-----------------|------|
| §5 Onboarding screens 2–8 | Plan 2 |
| §6 Leveling test | Plan 2 |
| §9 Teacher system prompts | Plan 2 + 3 |
| §14 /aula AI pipeline | Plan 3 |
| §12 Avatar (D-ID + Lottie) | Plan 3 |
| §7 Session structure | Plan 3 |
| §8 Pedagogical schedule | Plan 3 |
| §10 Correction rules | Plan 3 |
| §4.1 Dashboard | Plan 4 |
| §15 session_memory + replay | Plan 4 |
| §17 Plans + Mercado Pago | Phase 2 |
| §16 Landing page | Phase 2 |

## Subsequent Plans (Phase 1 MVP)

| # | Name | Scope | Prerequisite |
|---|------|-------|-------------|
| **2** | Onboarding | Screens 2–8 · written leveling (5 MCQs) · voice leveling with Mrs. Carol · `onboarding_progress` recovery on browser close | Plan 1 |
| **3** | Core AI Engine | `/aula` end-to-end: MediaRecorder → Whisper → Claude Sonnet 4.6 → parse error JSON → save `errors_log` → OpenAI TTS → D-ID avatar (Lottie fallback) · panic button · speed control · `config/teachers.ts` with Mrs. Carol system prompt | Plan 1 + 2 |
| **4** | Memory & Dashboard | `session_memory` population after each session · Claude Haiku 30s replay generation · streak counter · basic `/dashboard` page with streak / level / minutes used / last replay | Plan 1 + 3 |
