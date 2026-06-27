# English Fluent — Plan 2: Onboarding (Screens 2–8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full onboarding flow (screens 2–8) covering name collection, goal/schedule selection, 5-question written leveling test, and one-shot voice assessment with Mrs. Carol — ending with teacher assignment and a redirect to `/dashboard`.

**Architecture:** Six new routes under `/cadastro/*`, all server-auth-protected. Progress is persisted via an API route that upserts `onboarding_progress`; on remount the hook reads the DB step and forward-redirects to the furthest incomplete screen (browser-close recovery). The written leveling is scored deterministically client-side; the voice leveling calls Whisper then Claude Haiku and returns a CEFR string. The two scores are averaged to assign the final level and teacher.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Framer Motion, @supabase/ssr, OpenAI SDK (Whisper), Anthropic SDK (Claude Haiku 4.5), Vitest + @testing-library/react

## Global Constraints

- App Router only — no Pages Router
- All student-facing copy in Portuguese; teacher speech in English
- Color palette, border radius, shadows, fonts: same as Plan 1 (see `tailwind.config.ts`)
- Icons: Lucide React only; animations: Framer Motion ≤ 300ms
- Env var prefix: `EF_` for internal; `OPENAI_`, `ANTHROPIC_` for services
- Model: Claude Haiku `claude-haiku-4-5-20251001` for the leveling API (cheap inference)
- Working directory: `C:\Users\WINDOWS10\Downloads\fluente`

---

## Screen & Step Map

| Screen | Route | DB step written on completion |
|--------|-------|-------------------------------|
| 1 (done) | `/cadastro` | — |
| 2 | `/cadastro/boas-vindas` | 1 |
| 3 | `/cadastro/objetivo` | 2 |
| 4 | `/cadastro/horario` | 3 |
| 5 | `/cadastro/nivelamento` | 4 |
| 6 | `/cadastro/conversa` | 5 |
| 7 | `/cadastro/professor` | 6 + `completed_at` |

Recovery rule: on mount each screen reads `current_step` from DB; if `current_step ≥ thisPageStep`, redirect forward to the appropriate next screen.

---

## File Map

| File | Responsibility |
|------|----------------|
| `middleware.ts` | Add `/cadastro` prefix to PROTECTED so all subpaths require auth |
| `supabase/migrations/20260624000001_teachers_seed.sql` | Add `slug` column to teachers; seed 4 teacher rows |
| `config/teachers.ts` | Static teacher config (system prompts, slug, voice) keyed by slug |
| `lib/onboarding.ts` | `MCQ_QUESTIONS`, `CORRECT_ANSWERS`, `scoreMcqs()`, `combineLevels()` |
| `types/index.ts` | Add `McqQuestion`, `OnboardingLevelResponse` interfaces |
| `components/onboarding/ProgressBar.tsx` | Animated step progress bar (Framer Motion) |
| `components/onboarding/OnboardingLayout.tsx` | Shared layout: header with ProgressBar + back link, children slot |
| `hooks/useOnboardingProgress.ts` | Load progress, forward-redirect if ahead, expose `saveStep()` |
| `app/api/onboarding/progress/route.ts` | GET: fetch row; POST: upsert step + answers |
| `app/api/onboarding/level/route.ts` | POST: audio → Whisper → Claude Haiku → `{ level, transcript }` |
| `app/cadastro/boas-vindas/page.tsx` | Screen 2: name input; saves name + step 1 |
| `app/cadastro/objetivo/page.tsx` | Screen 3: 4 goal cards; saves written_answers[0] + step 2 |
| `app/cadastro/horario/page.tsx` | Screen 4: 3 commitment cards; saves written_answers[1] + step 3 |
| `app/cadastro/nivelamento/page.tsx` | Screen 5: sequential MCQs; saves answers + step 4 |
| `app/cadastro/conversa/page.tsx` | Screen 6: MediaRecorder → API; saves transcript + step 5 |
| `app/cadastro/professor/page.tsx` | Screen 7: combine scores; assign teacher; mark complete; → dashboard |
| `__tests__/lib/onboarding.test.ts` | Unit tests for `scoreMcqs()` and `combineLevels()` |
| `__tests__/components/onboarding/ProgressBar.test.tsx` | ProgressBar render tests |
| `__tests__/middleware.test.ts` | Update existing tests; add cadastro subpath tests |
| `__tests__/app/onboarding/*.test.tsx` | Page-level tests for each screen |

---

### Task 1: Middleware Update

**Files:**
- Modify: `middleware.ts`
- Modify: `__tests__/middleware.test.ts`

**Interfaces:**
- Produces: all `/cadastro/*` paths require auth (redirect unauthenticated → `/login`)
- Preserves: `/cadastro` exact still redirects authenticated users → `/dashboard`

- [ ] **Step 1: Open `__tests__/middleware.test.ts` and add two new test cases before the final closing brace of the `describe` block**

The full file after the addition (replace the existing file content):

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

  it('redirects unauthenticated request to /cadastro/objetivo → /login', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/cadastro/objetivo'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows authenticated request to /cadastro/objetivo through', async () => {
    mockUser({ id: 'user-123' })
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/cadastro/objetivo'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated request to /cadastro exactly → /dashboard', async () => {
    mockUser({ id: 'user-123' })
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/cadastro'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })
})
```

- [ ] **Step 2: Run to verify the two new tests fail**

```powershell
npm run test:run -- __tests__/middleware.test.ts
```
Expected: 2 new tests FAIL (objetivo tests), 5 existing tests PASS.

- [ ] **Step 3: Update `middleware.ts`**

Replace the PROTECTED and AUTH_ONLY constants (lines 3-6) with:

```typescript
const PROTECTED = ['/dashboard', '/aula', '/professores', '/planos', '/perfil', '/admin', '/cadastro']
const AUTH_ONLY = ['/login', '/cadastro']
const NO_NEXT_REDIRECT = new Set(['/cadastro/boas-vindas'])
```

The key change: `/cadastro` added to PROTECTED. Because the prefix check is `pathname.startsWith(p + '/')`, the string `/cadastro` in PROTECTED now covers `/cadastro/boas-vindas`, `/cadastro/objetivo`, etc. The exact `/cadastro` path is also in AUTH_ONLY, so authenticated users still redirect to `/dashboard` for `/cadastro` exact.

Also remove `/cadastro/boas-vindas` from PROTECTED — it's now covered by the `/cadastro` prefix.

Full `middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/aula', '/professores', '/planos', '/perfil', '/admin', '/cadastro']
const AUTH_ONLY = ['/login', '/cadastro']
const NO_NEXT_REDIRECT = new Set(['/cadastro/boas-vindas'])

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
  const { pathname, search } = request.nextUrl

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const isAuthOnly = AUTH_ONLY.includes(pathname)

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    if (!NO_NEXT_REDIRECT.has(pathname)) loginUrl.searchParams.set('next', pathname + search)
    return NextResponse.redirect(loginUrl)
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

- [ ] **Step 4: Run all middleware tests**

```powershell
npm run test:run -- __tests__/middleware.test.ts
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat: protect all /cadastro/* onboarding routes — require auth on any subpath"
```

---

### Task 2: Teachers DB Migration + Static Config

**Files:**
- Create: `supabase/migrations/20260624000001_teachers_seed.sql`
- Create: `config/teachers.ts`

**Interfaces:**
- Produces: `teachers` table populated with 4 rows; each row has `slug text unique not null`
- Produces: `TEACHERS` constant keyed by slug; `getTeacherForLevel(level: CefrLevel): string` returning slug

- [ ] **Step 1: Create `supabase/migrations/20260624000001_teachers_seed.sql`**

```sql
-- Add slug column to teachers for deterministic lookups
alter table public.teachers add column if not exists slug text unique not null default '';

-- Seed the 4 teacher personas
insert into public.teachers (slug, name, system_prompt, tts_voice, tts_provider, avatar_image_url, levels, correction_style, memory_prefix)
values
(
  'mrs-carol',
  'Mrs. Carol',
  'You are Mrs. Carol, a warm, patient, and encouraging American English teacher from Boston. You specialize in A1–A2 beginners. Keep sentences short and clear. Celebrate small victories. When you detect a grammar or vocabulary mistake, correct it gently by using the right form naturally in your next sentence — never halt the conversation to lecture. Always remember personal details the student shares and reference them naturally.',
  'alloy',
  'openai',
  '/avatars/mrs-carol.png',
  array['A1','A2'],
  'gentle',
  'Mrs. Carol remembers:'
),
(
  'mr-jake',
  'Mr. Jake',
  'You are Mr. Jake, a laid-back and engaging English teacher from California. You work with B1–B2 intermediate students. Use natural speech patterns, idioms, and phrasal verbs. Push students toward more complex sentences. Correct mistakes smoothly within the flow — slip the correct form into your reply without stopping the conversation. Reference what the student has told you in past sessions.',
  'echo',
  'openai',
  '/avatars/mr-jake.png',
  array['B1','B2'],
  'conversational',
  'Mr. Jake notes:'
),
(
  'dr-reynolds',
  'Dr. Reynolds',
  'You are Dr. Reynolds, a distinguished British English professor who teaches advanced B2–C1 students. Engage in substantive discussions on complex topics. Introduce advanced vocabulary and idiomatic expressions naturally. Provide precise corrections with brief explanations when they add value. Hold the student to a high standard while remaining encouraging.',
  'onyx',
  'openai',
  '/avatars/dr-reynolds.png',
  array['B2','C1'],
  'precise',
  'Dr. Reynolds observes:'
),
(
  'sofia',
  'Sofia',
  'You are Sofia, an energetic and enthusiastic English teacher who makes learning fun. You work with B1–C1 students and use storytelling, roleplay, and creative scenarios. Turn mistakes into positive learning moments. Reference what the student enjoys and weave it into conversations.',
  'nova',
  'openai',
  '/avatars/sofia.png',
  array['B1','C1'],
  'energetic',
  'Sofia keeps in mind:'
);
```

- [ ] **Step 2: Apply migration to local Supabase**

```powershell
npx supabase db reset
```
Expected: "Finished supabase db reset." with no errors.

- [ ] **Step 3: Create `config/teachers.ts`**

```typescript
import type { CefrLevel } from '@/types'

export interface TeacherConfig {
  slug: string
  name: string
  levels: CefrLevel[]
  tts_voice: string
  onboarding_prompt: string
}

export const TEACHERS: Record<string, TeacherConfig> = {
  'mrs-carol': {
    slug: 'mrs-carol',
    name: 'Mrs. Carol',
    levels: ['A1', 'A2'],
    tts_voice: 'alloy',
    onboarding_prompt:
      "Hi! I'm Mrs. Carol, your English teacher. Tell me a little about yourself in English — your job, your hobbies, or anything you'd like to share. Take about 45 seconds. Don't worry about mistakes — just speak naturally!",
  },
  'mr-jake': {
    slug: 'mr-jake',
    name: 'Mr. Jake',
    levels: ['B1', 'B2'],
    tts_voice: 'echo',
    onboarding_prompt:
      "Hey! I'm Mr. Jake. Tell me about yourself — where you're from, what you do, what you're into. Just talk naturally for about 45 seconds. I'm here to listen!",
  },
  'dr-reynolds': {
    slug: 'dr-reynolds',
    name: 'Dr. Reynolds',
    levels: ['B2', 'C1'],
    tts_voice: 'onyx',
    onboarding_prompt:
      "Good day. I'm Dr. Reynolds. Please tell me about yourself — your professional background, your interests, and your reasons for learning English. Take approximately 45 seconds.",
  },
  sofia: {
    slug: 'sofia',
    name: 'Sofia',
    levels: ['B1', 'C1'],
    tts_voice: 'nova',
    onboarding_prompt:
      "Hey there! I'm Sofia! Tell me all about yourself — what you love doing, where you work, your passions. Just go for it, about 45 seconds!",
  },
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function getTeacherForLevel(level: CefrLevel): string {
  const idx = LEVEL_ORDER.indexOf(level)
  if (idx <= 1) return 'mrs-carol'
  if (idx <= 3) return 'mr-jake'
  return 'dr-reynolds'
}
```

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260624000001_teachers_seed.sql config/teachers.ts
git commit -m "feat: teachers DB migration with slug column + static teacher config"
```

---

### Task 3: Onboarding Scoring Library + New Types

**Files:**
- Modify: `types/index.ts`
- Create: `lib/onboarding.ts`
- Create: `__tests__/lib/onboarding.test.ts`

**Interfaces:**
- Produces: `MCQ_QUESTIONS: McqQuestion[]` — 5 questions in order
- Produces: `scoreMcqs(answers: string[]): CefrLevel` — maps 0-5 correct answers to A1-C1
- Produces: `combineLevels(a: CefrLevel, b: CefrLevel): CefrLevel` — averages two levels
- Produces: `stepToRoute(step: number): string` — maps DB step number to a `/cadastro/*` route

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/onboarding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreMcqs, combineLevels, stepToRoute } from '@/lib/onboarding'

describe('scoreMcqs', () => {
  it('returns A1 for 0 correct', () => {
    expect(scoreMcqs(['wrong', 'wrong', 'wrong', 'wrong', 'wrong'])).toBe('A1')
  })

  it('returns A1 for 1 correct', () => {
    expect(scoreMcqs(['What', 'wrong', 'wrong', 'wrong', 'wrong'])).toBe('A1')
  })

  it('returns A2 for 2 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'wrong', 'wrong', 'wrong'])).toBe('A2')
  })

  it('returns B1 for 3 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'wrong', 'wrong'])).toBe('B1')
  })

  it('returns B2 for 4 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'was completed', 'wrong'])).toBe('B2')
  })

  it('returns C1 for 5 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'was completed', 'would have done'])).toBe('C1')
  })
})

describe('combineLevels', () => {
  it('returns same level when both agree', () => {
    expect(combineLevels('B1', 'B1')).toBe('B1')
  })

  it('averages two adjacent levels — A2 + B1 = B1', () => {
    expect(combineLevels('A2', 'B1')).toBe('B1')
  })

  it('averages two levels two apart — A1 + B1 = A2', () => {
    expect(combineLevels('A1', 'B1')).toBe('A2')
  })

  it('is symmetric', () => {
    expect(combineLevels('B2', 'C1')).toBe(combineLevels('C1', 'B2'))
  })
})

describe('stepToRoute', () => {
  it('step 0 → /cadastro/boas-vindas', () => {
    expect(stepToRoute(0)).toBe('/cadastro/boas-vindas')
  })

  it('step 1 → /cadastro/objetivo', () => {
    expect(stepToRoute(1)).toBe('/cadastro/objetivo')
  })

  it('step 2 → /cadastro/horario', () => {
    expect(stepToRoute(2)).toBe('/cadastro/horario')
  })

  it('step 3 → /cadastro/nivelamento', () => {
    expect(stepToRoute(3)).toBe('/cadastro/nivelamento')
  })

  it('step 4 → /cadastro/conversa', () => {
    expect(stepToRoute(4)).toBe('/cadastro/conversa')
  })

  it('step 5 → /cadastro/professor', () => {
    expect(stepToRoute(5)).toBe('/cadastro/professor')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/lib/onboarding.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/onboarding'".

- [ ] **Step 3: Add new types to `types/index.ts`**

Append these two interfaces at the end of `types/index.ts` (after `ConversationResponse`):

```typescript
export interface McqQuestion {
  id: string
  text: string
  options: string[]
  correct: string
}

export interface OnboardingLevelResponse {
  level: CefrLevel
  transcript: string
}
```

- [ ] **Step 4: Create `lib/onboarding.ts`**

```typescript
import type { CefrLevel, McqQuestion } from '@/types'

export const MCQ_QUESTIONS: McqQuestion[] = [
  {
    id: 'q1',
    text: 'Complete the sentence: "_____ is your name?"',
    options: ['What', 'Which', 'Who', 'How'],
    correct: 'What',
  },
  {
    id: 'q2',
    text: 'Complete the sentence: "She _____ to work every day."',
    options: ['go', 'goes', 'going', 'went'],
    correct: 'goes',
  },
  {
    id: 'q3',
    text: 'Complete the sentence: "By the time we arrived, the movie _____."',
    options: ['already started', 'has already started', 'had already started', 'already was starting'],
    correct: 'had already started',
  },
  {
    id: 'q4',
    text: 'Choose the correct passive form: "The project _____ by the team last year."',
    options: ['was completed', 'has completed', 'completed itself', 'is been completed'],
    correct: 'was completed',
  },
  {
    id: 'q5',
    text: 'Complete the conditional: "Had she told me sooner, I _____ something about it."',
    options: ['would do', 'will have done', 'would have done', 'would be doing'],
    correct: 'would have done',
  },
]

const CORRECT_ANSWERS = MCQ_QUESTIONS.map((q) => q.correct)

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function scoreMcqs(answers: string[]): CefrLevel {
  const correct = answers.filter((a, i) => a === CORRECT_ANSWERS[i]).length
  if (correct <= 1) return 'A1'
  if (correct === 2) return 'A2'
  if (correct === 3) return 'B1'
  if (correct === 4) return 'B2'
  return 'C1'
}

export function combineLevels(a: CefrLevel, b: CefrLevel): CefrLevel {
  const idxA = LEVEL_ORDER.indexOf(a)
  const idxB = LEVEL_ORDER.indexOf(b)
  return LEVEL_ORDER[Math.round((idxA + idxB) / 2)]
}

export function stepToRoute(step: number): string {
  if (step >= 5) return '/cadastro/professor'
  if (step >= 4) return '/cadastro/conversa'
  if (step >= 3) return '/cadastro/nivelamento'
  if (step >= 2) return '/cadastro/horario'
  if (step >= 1) return '/cadastro/objetivo'
  return '/cadastro/boas-vindas'
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/lib/onboarding.test.ts
```
Expected: 14 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/onboarding.ts types/index.ts __tests__/lib/onboarding.test.ts
git commit -m "feat: onboarding scoring lib — MCQ questions, scoreMcqs, combineLevels, stepToRoute"
```

---

### Task 4: Shared Onboarding Components

**Files:**
- Create: `components/onboarding/ProgressBar.tsx`
- Create: `components/onboarding/OnboardingLayout.tsx`
- Create: `__tests__/components/onboarding/ProgressBar.test.tsx`

**Interfaces:**
- Produces: `<ProgressBar currentStep={number} totalSteps={number} />` — animated filled bar
- Produces: `<OnboardingLayout currentStep={number} totalSteps={7} title={string}>` — wraps each screen

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/onboarding/ProgressBar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/onboarding/ProgressBar'

describe('ProgressBar', () => {
  it('renders a progressbar role', () => {
    render(<ProgressBar currentStep={2} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('sets aria-valuenow to the current step', () => {
    render(<ProgressBar currentStep={3} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('sets aria-valuemax to total steps', () => {
    render(<ProgressBar currentStep={3} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7')
  })

  it('shows step label text', () => {
    render(<ProgressBar currentStep={2} totalSteps={7} />)
    expect(screen.getByText('2 de 7')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/components/onboarding/ProgressBar.test.tsx
```
Expected: FAIL — "Cannot find module '@/components/onboarding/ProgressBar'".

- [ ] **Step 3: Create `components/onboarding/ProgressBar.tsx`**

```typescript
'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  currentStep: number
  totalSteps: number
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const pct = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="w-full space-y-1">
      <div
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        className="h-2 w-full rounded-full bg-surface-light-card dark:bg-surface-dark-card overflow-hidden"
      >
        <motion.div
          className="h-full bg-brand-cta rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-right">
        {currentStep} de {totalSteps}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/components/onboarding/ProgressBar.test.tsx
```
Expected: 4 tests PASS.

- [ ] **Step 5: Create `components/onboarding/OnboardingLayout.tsx`**

No additional tests needed — it's a thin layout wrapper.

```typescript
import { ThemeToggle } from '@/components/ThemeToggle'
import { ProgressBar } from '@/components/onboarding/ProgressBar'

interface OnboardingLayoutProps {
  currentStep: number
  totalSteps?: number
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function OnboardingLayout({
  currentStep,
  totalSteps = 7,
  title,
  subtitle,
  children,
}: OnboardingLayoutProps) {
  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4">
        <div className="flex-1">
          <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        </div>
        <div className="ml-4">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark mb-2 text-center">
            {title}
          </h1>
          {subtitle && (
            <p className="text-center text-content-light-secondary dark:text-content-dark-secondary text-sm mb-8">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```powershell
git add components/onboarding/ __tests__/components/onboarding/
git commit -m "feat: ProgressBar + OnboardingLayout shared components"
```

---

### Task 5: Progress API + Hook

**Files:**
- Create: `app/api/onboarding/progress/route.ts`
- Create: `hooks/useOnboardingProgress.ts`
- Create: `__tests__/hooks/useOnboardingProgress.test.tsx`

**Interfaces:**
- `GET /api/onboarding/progress` → `{ progress: OnboardingProgress | null }`
- `POST /api/onboarding/progress` body `{ step: number, written_answers?: string[], conversation_transcript?: string }` → `{ ok: true }`
- `useOnboardingProgress(pageStep: number)` → `{ progress, loading, saveStep }`
  - On mount: if `progress.completed_at` → router.push('/dashboard'); if `progress.current_step >= pageStep + 1` → router.push(stepToRoute(progress.current_step))
  - `saveStep(step, extra?)` calls POST then navigates to next route

- [ ] **Step 1: Create `app/api/onboarding/progress/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: progress } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ progress })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    step: number
    written_answers?: string[]
    conversation_transcript?: string
    completed?: boolean
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    current_step: body.step,
  }
  if (body.written_answers !== undefined) payload.written_answers = body.written_answers
  if (body.conversation_transcript !== undefined) payload.conversation_transcript = body.conversation_transcript
  if (body.completed) payload.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from('onboarding_progress')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write failing tests for the hook**

Create `__tests__/hooks/useOnboardingProgress.test.tsx`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

global.fetch = vi.fn()

function mockFetch(progress: object | null) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ progress }),
  } as Response)
}

import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

describe('useOnboardingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads progress on mount', async () => {
    mockFetch({ current_step: 1, completed_at: null })
    const { result } = renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.progress?.current_step).toBe(1)
  })

  it('redirects to /dashboard when completed_at is set', async () => {
    mockFetch({ current_step: 6, completed_at: '2026-01-01T00:00:00Z' })
    renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'))
  })

  it('forward-redirects when DB step is ahead of page step', async () => {
    mockFetch({ current_step: 3, completed_at: null })
    renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/cadastro/nivelamento'))
  })

  it('does not redirect when DB step matches page step', async () => {
    mockFetch({ current_step: 2, completed_at: null })
    renderHook(() => useOnboardingProgress(2))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(pushMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify they fail**

```powershell
npm run test:run -- __tests__/hooks/useOnboardingProgress.test.tsx
```
Expected: FAIL — "Cannot find module '@/hooks/useOnboardingProgress'".

- [ ] **Step 4: Create `hooks/useOnboardingProgress.ts`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingProgress } from '@/types'
import { stepToRoute } from '@/lib/onboarding'

export function useOnboardingProgress(pageStep: number) {
  const router = useRouter()
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/onboarding/progress')
      .then((r) => r.json())
      .then(({ progress: p }: { progress: OnboardingProgress | null }) => {
        setProgress(p)
        if (!p) return
        if (p.completed_at) { router.push('/dashboard'); return }
        if (p.current_step >= pageStep + 1) {
          router.push(stepToRoute(p.current_step))
        }
      })
      .finally(() => setLoading(false))
  }, [pageStep, router])

  async function saveStep(
    step: number,
    extra?: { written_answers?: string[]; conversation_transcript?: string; completed?: boolean }
  ) {
    await fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...extra }),
    })
    router.push(step >= 6 ? '/dashboard' : stepToRoute(step))
  }

  return { progress, loading, saveStep }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/hooks/useOnboardingProgress.test.tsx
```
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/api/onboarding/ hooks/ __tests__/hooks/
git commit -m "feat: onboarding progress API route + useOnboardingProgress hook with recovery redirect"
```

---

### Task 6: Leveling API (Whisper + Claude Haiku)

**Files:**
- Create: `app/api/onboarding/level/route.ts`
- Create: `__tests__/app/api/onboarding/level.test.ts`

**Interfaces:**
- `POST /api/onboarding/level` — multipart form with field `audio: Blob`
- Returns: `OnboardingLevelResponse` = `{ level: CefrLevel, transcript: string }`

- [ ] **Step 1: Install Anthropic + OpenAI SDKs if not already installed**

```powershell
npm list openai @anthropic-ai/sdk 2>$null
```
If either is missing:
```powershell
npm install openai @anthropic-ai/sdk
```
Expected: packages listed in `node_modules`.

- [ ] **Step 2: Write failing tests**

Create `__tests__/app/api/onboarding/level.test.ts`:

```typescript
import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: 'Hello, I work as a software engineer.' }),
      },
    },
  })),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'B1' }],
      }),
    },
  })),
}))

import { POST } from '@/app/api/onboarding/level/route'

function makeFormRequest(mimeType = 'audio/webm') {
  const blob = new Blob(['fake-audio'], { type: mimeType })
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  return new Request('http://localhost/api/onboarding/level', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/onboarding/level', () => {
  it('returns level and transcript', async () => {
    const res = await POST(makeFormRequest())
    const body = await res.json()
    expect(body.level).toBe('B1')
    expect(body.transcript).toBe('Hello, I work as a software engineer.')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/api/onboarding/level.test.ts
```
Expected: FAIL — "Cannot find module '@/app/api/onboarding/level/route'".

- [ ] **Step 4: Create `app/api/onboarding/level/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { CefrLevel, OnboardingLevelResponse } from '@/types'

const VALID_LEVELS = new Set<string>(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const audio = formData.get('audio') as Blob | null
  if (!audio) return NextResponse.json({ error: 'No audio field' }, { status: 400 })

  const buffer = Buffer.from(await audio.arrayBuffer())
  const file = new File([buffer], 'recording.webm', { type: audio.type || 'audio/webm' })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
  })
  const transcript = transcription.text.trim()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system:
      'You are an English level assessor. Given a speech transcript, output ONLY one CEFR code: A1, A2, B1, B2, C1, or C2. Nothing else.',
    messages: [{ role: 'user', content: `Transcript: "${transcript}"` }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text.trim().toUpperCase()
  const level: CefrLevel = VALID_LEVELS.has(raw) ? (raw as CefrLevel) : 'A2'

  const body: OnboardingLevelResponse = { level, transcript }
  return NextResponse.json(body)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/api/onboarding/level.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/api/onboarding/level/ __tests__/app/api/onboarding/
git commit -m "feat: leveling API — audio → Whisper transcription → Claude Haiku CEFR classification"
```

---

### Task 7: Screen 2 — Boas-vindas (Name Input)

**Files:**
- Create: `app/cadastro/boas-vindas/page.tsx`
- Create: `__tests__/app/onboarding/boas-vindas.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingProgress(1)` — loads + recovers; `saveStep` POSTs step=1 + navigates to `/cadastro/objetivo`
- On submit: PATCH `/api/onboarding/progress` step=1; also calls Supabase to update `users.name`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/onboarding/boas-vindas.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ progress: null }),
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }),
}))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import BoasVindasPage from '@/app/cadastro/boas-vindas/page'

describe('BoasVindasPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a name input', () => {
    render(<BoasVindasPage />)
    expect(screen.getByPlaceholderText(/seu nome/i)).toBeInTheDocument()
  })

  it('shows error when submitting empty name', async () => {
    render(<BoasVindasPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument()
  })

  it('calls fetch with step=1 on valid submit', async () => {
    render(<BoasVindasPage />)
    fireEvent.change(screen.getByPlaceholderText(/seu nome/i), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/boas-vindas.test.tsx
```
Expected: FAIL — "Cannot find module '@/app/cadastro/boas-vindas/page'".

- [ ] **Step 3: Create `app/cadastro/boas-vindas/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

export default function BoasVindasPage() {
  const { saveStep, loading } = useOnboardingProgress(1)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setError(null)
    setSubmitting(true)

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({ name: name.trim() }).eq('id', user.id)
    }

    await saveStep(1)
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={1} title="Qual é o seu nome?" subtitle="Vamos te chamar pelo nome!">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
        />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </button>
      </form>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/onboarding/boas-vindas.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/cadastro/boas-vindas/ __tests__/app/onboarding/boas-vindas.test.tsx
git commit -m "feat: onboarding screen 2 — name input, saves to users.name + step 1"
```

---

### Task 8: Screen 3 — Objetivo (Learning Goal)

**Files:**
- Create: `app/cadastro/objetivo/page.tsx`
- Create: `__tests__/app/onboarding/objetivo.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingProgress(2)`
- On select + continue: `saveStep(2, { written_answers: [goal] })`
- Goal options: `'trabalho'`, `'viagem'`, `'estudos'`, `'pessoal'`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/onboarding/objetivo.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ progress: null }) })
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import ObjetivoPage from '@/app/cadastro/objetivo/page'

describe('ObjetivoPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 4 goal options', () => {
    render(<ObjetivoPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('shows error when continuing without selection', async () => {
    render(<ObjetivoPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/selecione um objetivo/i)).toBeInTheDocument()
  })

  it('calls POST with written_answers on valid selection + continue', async () => {
    render(<ObjetivoPage />)
    fireEvent.click(screen.getByText(/trabalho/i))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/objetivo.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create `app/cadastro/objetivo/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Briefcase, Plane, BookOpen, Heart } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

const GOALS = [
  { value: 'trabalho', label: 'Trabalho', icon: Briefcase, desc: 'Reuniões, e-mails, entrevistas' },
  { value: 'viagem', label: 'Viagem', icon: Plane, desc: 'Turismo e aventuras pelo mundo' },
  { value: 'estudos', label: 'Estudos', icon: BookOpen, desc: 'Faculdade, intercâmbio, certificados' },
  { value: 'pessoal', label: 'Pessoal', icon: Heart, desc: 'Filmes, música e cultura' },
]

export default function ObjetivoPage() {
  const { saveStep, loading } = useOnboardingProgress(2)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleContinue() {
    if (!selected) { setError('Selecione um objetivo'); return }
    setError(null)
    setSubmitting(true)
    await saveStep(2, { written_answers: [selected] })
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={2} title="Qual é o seu objetivo?" subtitle="Isso nos ajuda a personalizar suas aulas.">
      <div className="space-y-3 mb-6">
        {GOALS.map(({ value, label, icon: Icon, desc }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
              selected === value
                ? 'border-brand-interactive bg-brand-interactive/10 text-brand-interactive'
                : 'border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{desc}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        onClick={handleContinue}
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {submitting ? 'Salvando...' : 'Continuar'}
      </button>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/onboarding/objetivo.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/cadastro/objetivo/ __tests__/app/onboarding/objetivo.test.tsx
git commit -m "feat: onboarding screen 3 — learning goal selection"
```

---

### Task 9: Screen 4 — Horário (Daily Commitment)

**Files:**
- Create: `app/cadastro/horario/page.tsx`
- Create: `__tests__/app/onboarding/horario.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingProgress(3)`
- On select + continue: `saveStep(3, { written_answers: [goal, commitment] })` — merges with written_answers[0] already in DB by reading `progress.written_answers`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/onboarding/horario.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ progress: { current_step: 2, written_answers: ['trabalho'], completed_at: null } }),
})
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import HorarioPage from '@/app/cadastro/horario/page'

describe('HorarioPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 3 commitment options', () => {
    render(<HorarioPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3)
  })

  it('shows error when continuing without selection', async () => {
    render(<HorarioPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/selecione uma opção/i)).toBeInTheDocument()
  })

  it('calls POST on valid selection + continue', async () => {
    render(<HorarioPage />)
    fireEvent.click(screen.getByText(/10 minutos/i))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/horario.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create `app/cadastro/horario/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

const COMMITMENTS = [
  { value: '10min', label: '10 minutos por dia', desc: 'Ritmo leve — ótimo para começar' },
  { value: '20min', label: '20 minutos por dia', desc: 'Progresso consistente' },
  { value: '30min', label: '30 minutos por dia', desc: 'Evolução acelerada' },
]

export default function HorarioPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(3)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleContinue() {
    if (!selected) { setError('Selecione uma opção'); return }
    setError(null)
    setSubmitting(true)
    const prev = progress?.written_answers ?? []
    await saveStep(3, { written_answers: [...prev, selected] })
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={3} title="Quanto tempo por dia?" subtitle="Você pode ajustar isso depois.">
      <div className="space-y-3 mb-6">
        {COMMITMENTS.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
              selected === value
                ? 'border-brand-interactive bg-brand-interactive/10 text-brand-interactive'
                : 'border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card'
            }`}
          >
            <Clock size={20} className="shrink-0" />
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{desc}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        onClick={handleContinue}
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {submitting ? 'Salvando...' : 'Continuar'}
      </button>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/onboarding/horario.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/cadastro/horario/ __tests__/app/onboarding/horario.test.tsx
git commit -m "feat: onboarding screen 4 — daily commitment selection"
```

---

### Task 10: Screen 5 — Nivelamento (Written MCQ Test)

**Files:**
- Create: `app/cadastro/nivelamento/page.tsx`
- Create: `__tests__/app/onboarding/nivelamento.test.tsx`

**Interfaces:**
- Consumes: `MCQ_QUESTIONS` from `lib/onboarding.ts`, `useOnboardingProgress(4)`
- Shows one question at a time with 4 options; tracks answers in local state
- On all 5 answered: call `scoreMcqs()`, `saveStep(4, { written_answers: [...prev, JSON.stringify(answers), mcqLevel] })`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/onboarding/nivelamento.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    progress: { current_step: 3, written_answers: ['trabalho', '20min'], completed_at: null },
  }),
})
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import NivelamentoPage from '@/app/cadastro/nivelamento/page'

describe('NivelamentoPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the first MCQ question', async () => {
    render(<NivelamentoPage />)
    await waitFor(() =>
      expect(screen.getByText(/_____ is your name/i)).toBeInTheDocument()
    )
  })

  it('advances to next question when an option is selected', async () => {
    render(<NivelamentoPage />)
    await waitFor(() => screen.getByText(/_____ is your name/i))
    fireEvent.click(screen.getByText('What'))
    await waitFor(() =>
      expect(screen.getByText(/she _____ to work/i)).toBeInTheDocument()
    )
  })

  it('calls POST after answering all 5 questions', async () => {
    render(<NivelamentoPage />)
    const allAnswers = ['What', 'goes', 'had already started', 'was completed', 'would have done']
    for (const ans of allAnswers) {
      await waitFor(() => screen.getByText(ans))
      fireEvent.click(screen.getByText(ans))
    }
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/nivelamento.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create `app/cadastro/nivelamento/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { MCQ_QUESTIONS, scoreMcqs } from '@/lib/onboarding'

export default function NivelamentoPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(4)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleOption(option: string) {
    const newAnswers = [...answers, option]
    setAnswers(newAnswers)

    if (newAnswers.length < MCQ_QUESTIONS.length) {
      setQuestionIndex((i) => i + 1)
      return
    }

    setSubmitting(true)
    const mcqLevel = scoreMcqs(newAnswers)
    const prev = progress?.written_answers ?? []
    await saveStep(4, {
      written_answers: [...prev, JSON.stringify(newAnswers), mcqLevel],
    })
    setSubmitting(false)
  }

  if (loading || submitting) {
    return (
      <OnboardingLayout currentStep={4} title="Avaliando seu inglês...">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-cta border-t-transparent rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    )
  }

  const question = MCQ_QUESTIONS[questionIndex]

  return (
    <OnboardingLayout
      currentStep={4}
      title="Teste rápido"
      subtitle={`Questão ${questionIndex + 1} de ${MCQ_QUESTIONS.length}`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={questionIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          <p className="text-base font-medium text-content-light dark:text-content-dark mb-6">
            {question.text}
          </p>
          {question.options.map((option) => (
            <button
              key={option}
              onClick={() => handleOption(option)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-left text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card hover:border-brand-interactive transition-colors"
            >
              {option}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/onboarding/nivelamento.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/cadastro/nivelamento/ __tests__/app/onboarding/nivelamento.test.tsx
git commit -m "feat: onboarding screen 5 — sequential MCQ leveling test with animated transitions"
```

---

### Task 11: Screen 6 — Conversa (Voice Recording)

**Files:**
- Create: `app/cadastro/conversa/page.tsx`
- Create: `__tests__/app/onboarding/conversa.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingProgress(5)`, `TEACHERS['mrs-carol'].onboarding_prompt`
- On record stop: POST FormData `{ audio: Blob }` to `/api/onboarding/level`
- On API response: `saveStep(5, { conversation_transcript: transcript })`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/onboarding/conversa.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url === '/api/onboarding/progress') {
    return Promise.resolve({
      ok: true,
      json: async () => ({ progress: { current_step: 4, written_answers: ['trabalho', '20min', '[]', 'B1'], completed_at: null } }),
    })
  }
  return Promise.resolve({ ok: true, json: async () => ({ level: 'B1', transcript: 'I work as an engineer.' }) })
})

vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import ConversaPage from '@/app/cadastro/conversa/page'

describe('ConversaPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Mrs. Carol prompt text', async () => {
    render(<ConversaPage />)
    await waitFor(() =>
      expect(screen.getByText(/mrs\. carol/i)).toBeInTheDocument()
    )
  })

  it('renders a record button', async () => {
    render(<ConversaPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /gravar|iniciar/i })).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/conversa.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create `app/cadastro/conversa/page.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { TEACHERS } from '@/config/teachers'
import type { OnboardingLevelResponse } from '@/types'

type RecordState = 'idle' | 'recording' | 'processing'

export default function ConversaPage() {
  const { saveStep, loading } = useOnboardingProgress(5)
  const [state, setState] = useState<RecordState>('idle')
  const [countdown, setCountdown] = useState(45)
  const [error, setError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        processRecording(recorder.mimeType)
      }
      recorder.start()
      mediaRef.current = recorder
      setState('recording')
      setCountdown(45)
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { stopRecording(); return 0 }
          return c - 1
        })
      }, 1000)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    mediaRef.current?.stop()
    setState('processing')
  }

  async function processRecording(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')

    try {
      const res = await fetch('/api/onboarding/level', { method: 'POST', body: form })
      if (!res.ok) throw new Error('API error')
      const { transcript } = (await res.json()) as OnboardingLevelResponse
      await saveStep(5, { conversation_transcript: transcript })
    } catch {
      setError('Erro ao processar o áudio. Tente novamente.')
      setState('idle')
    }
  }

  if (loading) return null

  const teacher = TEACHERS['mrs-carol']

  return (
    <OnboardingLayout currentStep={5} title="Fale um pouco em inglês" subtitle="Não precisa ser perfeito!">
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-brand-interactive mb-2">Mrs. Carol diz:</p>
          <p className="text-sm text-content-light dark:text-content-dark italic">
            "{teacher.onboarding_prompt}"
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {state === 'recording' && (
            <p className="text-3xl font-bold text-brand-cta tabular-nums">{countdown}s</p>
          )}

          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
              aria-label="Iniciar gravação"
            >
              <Mic size={20} /> Gravar resposta
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500 text-white font-semibold hover:opacity-90 transition-opacity"
              aria-label="Parar gravação"
            >
              <MicOff size={20} /> Parar gravação
            </button>
          )}

          {state === 'processing' && (
            <div className="flex items-center gap-2 text-content-light-secondary dark:text-content-dark-secondary">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analisando sua fala...</span>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/onboarding/conversa.test.tsx
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/cadastro/conversa/ __tests__/app/onboarding/conversa.test.tsx
git commit -m "feat: onboarding screen 6 — voice recording with 45s countdown, sends to leveling API"
```

---

### Task 12: Screen 7 — Professor (Level Result + Teacher Assignment)

**Files:**
- Create: `app/cadastro/professor/page.tsx`
- Create: `__tests__/app/onboarding/professor.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingProgress(6)`, `combineLevels()`, `getTeacherForLevel()`, `TEACHERS`
- On mount: read `progress.written_answers[3]` (MCQ level) + calls `/api/onboarding/level` is NOT called again — the voice level was already stored in step 5; instead, this screen derives final level from the DB-stored MCQ level + calls a separate endpoint to get the voice result
  - Actually: the voice transcript is stored at `progress.conversation_transcript`; we need to classify it — but the voice level was NOT stored separately. Solution: store voice level in `written_answers[4]` from the conversa screen.

**Note:** Update Task 11 (`conversa/page.tsx`) to also pass the voice level in `written_answers`. In `processRecording`, change:
```typescript
await saveStep(5, { conversation_transcript: transcript })
```
to read the existing `progress.written_answers` and append the voice level:
```typescript
await saveStep(5, {
  conversation_transcript: transcript,
  written_answers: [...(existingAnswers), level],
})
```
Since `useOnboardingProgress` exposes `progress`, update `conversa/page.tsx` to destructure `progress` from the hook and use `progress?.written_answers ?? []` when calling `saveStep`.

- [ ] **Step 1: Update `app/cadastro/conversa/page.tsx` to store voice level**

In `conversa/page.tsx`, change:
1. Destructure `progress` from `useOnboardingProgress`: `const { progress, saveStep, loading } = useOnboardingProgress(5)`
2. In `processRecording`, replace the `saveStep` call:

```typescript
const { transcript, level } = (await res.json()) as OnboardingLevelResponse
const prevAnswers = progress?.written_answers ?? []
await saveStep(5, {
  conversation_transcript: transcript,
  written_answers: [...prevAnswers, level],
})
```

- [ ] **Step 2: Write failing tests for professor page**

Create `__tests__/app/onboarding/professor.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    progress: {
      current_step: 5,
      written_answers: ['trabalho', '20min', '["What","goes","had already started","wrong","wrong"]', 'B1', 'B1'],
      conversation_transcript: 'I work as an engineer.',
      completed_at: null,
    },
  }),
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'teacher-uuid' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import ProfessorPage from '@/app/cadastro/professor/page'

describe('ProfessorPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a CEFR level badge after loading', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getByText(/B1/)).toBeInTheDocument()
    )
  })

  it('renders the assigned teacher name', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getByText(/Mr\. Jake/i)).toBeInTheDocument()
    )
  })

  it('renders a confirm button', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /começar/i })).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 3: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/onboarding/professor.test.tsx
```
Expected: FAIL.

- [ ] **Step 4: Create `app/cadastro/professor/page.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { combineLevels, scoreMcqs } from '@/lib/onboarding'
import { getTeacherForLevel, TEACHERS } from '@/config/teachers'
import type { CefrLevel } from '@/types'

const LEVEL_LABELS: Record<CefrLevel, string> = {
  A1: 'Iniciante',
  A2: 'Básico',
  B1: 'Intermediário',
  B2: 'Intermediário avançado',
  C1: 'Avançado',
  C2: 'Fluente',
}

export default function ProfessorPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(6)
  const [finalLevel, setFinalLevel] = useState<CefrLevel | null>(null)
  const [teacherSlug, setTeacherSlug] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!progress) return
    const answers = progress.written_answers ?? []
    const mcqLevel = (answers[3] as CefrLevel | undefined) ?? 'A1'
    const voiceLevel = (answers[4] as CefrLevel | undefined) ?? mcqLevel
    const combined = combineLevels(mcqLevel, voiceLevel)
    setFinalLevel(combined)
    setTeacherSlug(getTeacherForLevel(combined))
  }, [progress])

  async function handleConfirm() {
    if (!finalLevel || !teacherSlug) return
    setSubmitting(true)

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('slug', teacherSlug)
        .single()

      await supabase
        .from('users')
        .update({ cefr_level: finalLevel, teacher_id: teacher?.id ?? null })
        .eq('id', user.id)
    }

    await saveStep(6, { completed: true } as any)
    setSubmitting(false)
  }

  if (loading || !finalLevel || !teacherSlug) {
    return (
      <OnboardingLayout currentStep={6} title="Calculando seu nível...">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-cta border-t-transparent rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    )
  }

  const teacher = TEACHERS[teacherSlug]

  return (
    <OnboardingLayout currentStep={6} title="Seu perfil está pronto!">
      <div className="space-y-6">
        <div className="text-center py-4">
          <span className="inline-block px-4 py-1 rounded-full bg-brand-cta/20 text-brand-cta font-bold text-lg mb-1">
            {finalLevel}
          </span>
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            {LEVEL_LABELS[finalLevel]}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Seu professor
          </p>
          <p className="font-bold text-content-light dark:text-content-dark">{teacher.name}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {teacher.levels.join(' · ')}
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Começar a aprender'}
        </button>
      </div>
    </OnboardingLayout>
  )
}
```

- [ ] **Step 5: Update `hooks/useOnboardingProgress.ts` to support `completed: true` in POST body**

The POST route already handles `body.completed` — no hook change needed. But `saveStep` must forward the `completed` flag. Update `saveStep` signature to accept it:

```typescript
async function saveStep(
  step: number,
  extra?: {
    written_answers?: string[]
    conversation_transcript?: string
    completed?: boolean
  }
) {
  await fetch('/api/onboarding/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...extra }),
  })
  router.push(extra?.completed ? '/dashboard' : stepToRoute(step))
}
```

The existing hook file already has this signature — no change needed if it was written exactly as in Task 5. Verify by reading `hooks/useOnboardingProgress.ts`.

- [ ] **Step 6: Run professor tests**

```powershell
npm run test:run -- __tests__/app/onboarding/professor.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 7: Run full test suite**

```powershell
npm run test:run
```
Expected: All tests PASS, 0 failures.

- [ ] **Step 8: TypeScript check**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 9: Commit**

```powershell
git add app/cadastro/professor/ app/cadastro/conversa/page.tsx __tests__/app/onboarding/professor.test.tsx
git commit -m "feat: onboarding screen 7 — level result + teacher assignment, marks onboarding complete"
```

---

## Spec Coverage Check

| Briefing section | Covered in this plan |
|-----------------|----------------------|
| §5 Onboarding screens 2–8 | ✅ screens 2–7 (boas-vindas, objetivo, horario, nivelamento, conversa, professor) |
| §6 Written leveling test (5 MCQs) | ✅ `MCQ_QUESTIONS` in `lib/onboarding.ts`, shown sequentially |
| §6 Voice leveling | ✅ MediaRecorder → Whisper → Claude Haiku → CEFR |
| §6 Level assignment | ✅ `combineLevels()` averages MCQ + voice scores |
| §9 Teacher personas (4) | ✅ seeded in DB migration + static config in `config/teachers.ts` |
| §9 Teacher system prompts | ✅ full prompts in migration SQL |
| Onboarding recovery on browser close | ✅ `useOnboardingProgress` hook forward-redirects on mount |
| CEFR → teacher mapping | ✅ `getTeacherForLevel()` in `config/teachers.ts` |

**Deferred to Plan 3:**
- Full /aula session (MediaRecorder → TTS → D-ID avatar)
- Correction JSON parsing and `errors_log` writes
- Panic button, speed control

## Subsequent Plans

| # | Name | Prerequisite |
|---|------|-------------|
| **3** | Core AI Engine `/aula` | Plan 1 + 2 |
| **4** | Memory & Dashboard | Plan 1 + 3 |
