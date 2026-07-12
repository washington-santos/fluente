# Daily Mission (Missão do Dia) Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static, repeating 3-missions-per-level system with AI-generated per-day missions, verify completion against what the student actually said (not just message count), add a lifetime completion counter, and let students tap the mission card to start a lesson focused on it.

**Architecture:** `lib/missions.ts` exposes one function, `getOrGenerateTodaysMission(userId, supabase)`, that reads-or-generates-and-caches a `daily_missions_log` row per user per day (AI-generated via the same `getStudentContext()` + `gpt-4o-mini` JSON-mode pattern already used by `/api/lesson/generate`). `GET /api/mission` (currently dead code) and the new `POST /api/mission/start` both call it. Completion verification moves from the fire-and-forget `finalize` route into `GET /api/session/[id]/report`, which `AulaClient` already awaits synchronously before showing `SessionReport` — this closes an existing race condition for free. `MissionCard` becomes self-fetching and gains a start button; a new `MissionCounterBadge` shows the lifetime count.

**Tech Stack:** Next.js 14 App Router route handlers, Supabase (Postgres + RLS via `createSupabaseServer()`), OpenAI (`gpt-4o-mini`, JSON mode), Vitest + Testing Library.

## Global Constraints

- All new/modified DB access goes through the existing RLS-scoped `createSupabaseServer()` client (unchanged pattern).
- Every route handler returns JSON error bodies with correct HTTP status codes; never throw uncaught.
- `minUserTurns` is derived in code from the student's current CEFR level (A1→3, A2→4, B1→5, B2→6, C1→8, C2→8), fetched live on every call to `getOrGenerateTodaysMission` — not stored on the `daily_missions_log` row, so it always reflects the student's current level even if it changed since the mission was generated.
- AI calls must never throw uncaught: mission generation falls back to one static mission per CEFR level; mission-coverage verification treats any AI failure as "not covered" (student can still complete the mission in a later session that day, since the row persists).
- `daily_missions_log` completion is idempotent: verifying an already-completed mission again (e.g. a second session same day) must not re-run the AI call or double-increment `users.missions_completed_count`.
- Run `npm run test:run` after every task; all tests (existing + new) must pass before moving to the next task.
- Follow existing test conventions exactly: `vi.mock('@supabase/ssr', ...)` / `vi.mock('@/lib/supabase-server', ...)` with `vi.hoisted` mock fns for route tests, class-based `vi.mock('openai', ...)` for AI calls (see `__tests__/app/api/placement/assess.test.ts`), and the thenable `makeChain` helper already used in `__tests__/app/api/session-report.test.ts` / `__tests__/app/api/session/finalize.test.ts`.

---

## File Structure

- **Create:** `supabase/migrations/20260711000001_daily_mission_ai.sql` — schema change + reward counter + increment function.
- **Modify:** `lib/missions.ts` — replace the static mission list with `getOrGenerateTodaysMission`.
- **Modify:** `__tests__/lib/missions.test.ts` — replace `getMissionForDate` tests with `getOrGenerateTodaysMission` tests.
- **Modify:** `app/api/mission/route.ts` — `GET` now calls `getOrGenerateTodaysMission`.
- **Modify:** `__tests__/app/api/mission.test.ts` — update to the new response shape.
- **Create:** `app/api/mission/start/route.ts` — `POST`, creates a mission-focused session.
- **Create:** `__tests__/app/api/mission/start.test.ts`.
- **Modify:** `app/api/session/[id]/report/route.ts` — AI-verified completion + reward.
- **Modify:** `__tests__/app/api/session-report.test.ts` — new completion-verification test cases.
- **Modify:** `app/api/session/[id]/finalize/route.ts` — remove the mission-completion step.
- **Modify:** `__tests__/app/api/session/finalize.test.ts` — remove the now-obsolete mission test case.
- **Modify:** `components/dashboard/MissionCard.tsx` — self-fetching, adds a start button.
- **Modify:** `__tests__/components/dashboard/MissionCard.test.tsx` — new prop-less, fetch-driven tests.
- **Create:** `components/dashboard/MissionCounterBadge.tsx`.
- **Create:** `__tests__/components/dashboard/MissionCounterBadge.test.tsx`.
- **Modify:** `app/dashboard/page.tsx` — remove server-computed mission logic, wire the two components.

---

### Task 1: Migration — AI mission schema + reward counter

**Files:**
- Create: `supabase/migrations/20260711000001_daily_mission_ai.sql`

**Interfaces:**
- Produces: `daily_missions_log.title_pt text NOT NULL`, `daily_missions_log.description_pt text NOT NULL`, `daily_missions_log.completed_at` now nullable (was `NOT NULL DEFAULT now()`); `users.missions_completed_count integer NOT NULL DEFAULT 0`; SQL function `increment_missions_completed(p_user_id uuid)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260711000001_daily_mission_ai.sql

-- Missions become AI-generated per student per day instead of a static
-- repeating list, so the generated content must be persisted the moment
-- it's generated (not just at completion) — completed_at can no longer
-- have a NOT NULL DEFAULT now() default, since a row now exists before
-- the mission is completed.
ALTER TABLE public.daily_missions_log
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT;

ALTER TABLE public.daily_missions_log
  ADD COLUMN IF NOT EXISTS title_pt text,
  ADD COLUMN IF NOT EXISTS description_pt text;

-- Backfill existing completion-only rows (from the old static-mission
-- system) so the NOT NULL constraint below can be added safely. These
-- rows are historical and never re-displayed as "today's mission" —
-- a new day always queries by today's date.
UPDATE public.daily_missions_log SET title_pt = mission_key WHERE title_pt IS NULL;
UPDATE public.daily_missions_log SET description_pt = mission_key WHERE description_pt IS NULL;

ALTER TABLE public.daily_missions_log
  ALTER COLUMN title_pt SET NOT NULL,
  ALTER COLUMN description_pt SET NOT NULL;

-- Lifetime mission-completion counter (reward), same simple-counter
-- pattern as the existing users.streak_days column.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS missions_completed_count integer NOT NULL DEFAULT 0;

-- Atomic increment, same pattern as increment_topic_progress in
-- supabase/migrations/20260708000001_pedagogy_engine.sql.
CREATE OR REPLACE FUNCTION increment_missions_completed(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users SET missions_completed_count = missions_completed_count + 1 WHERE id = p_user_id;
$$;
```

- [ ] **Step 2: Verify it's syntactically valid**

Run: `npx supabase db lint supabase/migrations/20260711000001_daily_mission_ai.sql` if the Supabase CLI is available locally; otherwise visually confirm it matches the style of `supabase/migrations/20260708000002_mastery_system.sql` (idempotent `ADD COLUMN IF NOT EXISTS`, no destructive drops of data).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260711000001_daily_mission_ai.sql
git commit -m "feat: add AI-mission schema and completion counter"
```

---

### Task 2: `lib/missions.ts` — `getOrGenerateTodaysMission`

**Files:**
- Modify: `lib/missions.ts`
- Modify: `__tests__/lib/missions.test.ts`

**Interfaces:**
- Consumes: `getStudentContext(userId: string, supabase: SupabaseClient): Promise<StudentContext>` from `@/lib/student-context` (unchanged, existing).
- Produces: `export interface DailyMission { missionKey: string; titlePt: string; descriptionPt: string; minUserTurns: number; completed: boolean }` and `export async function getOrGenerateTodaysMission(userId: string, supabase: SupabaseClient): Promise<DailyMission>` — consumed by Task 3 (`GET /api/mission`), Task 4 (`POST /api/mission/start`), and Task 5 (`report` route).
- The old `Mission` interface and `getMissionForDate` function are removed entirely — no other file in the codebase imports them after Task 6 lands (verify with a repo-wide search before deleting, per Step 3 below).

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/lib/missions.test.ts` in full:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/student-context', () => ({
  getStudentContext: vi.fn().mockResolvedValue({
    userId: 'user-1',
    name: 'Ana',
    cefrLevel: 'B1',
    personalContext: [],
    goal: 'travel',
    focusAreas: [],
    taughtTopicIds: [],
    topicsNeedingReview: [],
    frequentErrors: [],
    recentSessionSummary: null,
    biggestDifficulty: null,
    streakDays: 0,
  }),
}))

import { getOrGenerateTodaysMission } from '@/lib/missions'

// Chainable + thenable mock query builder, matching the convention already
// used in __tests__/app/api/session-report.test.ts.
const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

function makeSupabase(userRow: unknown, existingMissionRow: unknown) {
  const userChain = makeChain(userRow)
  const missionChain = makeChain(existingMissionRow)
  const from = vi.fn((table: string) => {
    if (table === 'users') return userChain
    if (table === 'daily_missions_log') return missionChain
    return makeChain(null)
  })
  return { from, missionChain }
}

describe('getOrGenerateTodaysMission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing row for today without calling the AI', async () => {
    const { from } = makeSupabase(
      { cefr_level: 'B1' },
      { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result).toEqual({
      missionKey: 'b1-movie',
      titlePt: 'Recomendação cultural',
      descriptionPt: 'Recomende um filme.',
      minUserTurns: 5,
      completed: false,
    })
    expect(mockChatCreate).not.toHaveBeenCalled()
  })

  it('marks completed:true when the existing row has completed_at set', async () => {
    const { from } = makeSupabase(
      { cefr_level: 'A1' },
      { mission_key: 'a1-intro', title_pt: 'Apresentação', description_pt: 'Apresente-se.', completed_at: '2026-07-11T09:00:00Z' },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result.completed).toBe(true)
    expect(result.minUserTurns).toBe(3)
  })

  it('generates and persists a new mission via AI when none exists for today', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"mission_key":"b1-hobby","title_pt":"Seu hobby favorito","description_pt":"Fale sobre um hobby que você pratica."}' } }],
    })
    const { from, missionChain } = makeSupabase({ cefr_level: 'B1' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result).toEqual({
      missionKey: 'b1-hobby',
      titlePt: 'Seu hobby favorito',
      descriptionPt: 'Fale sobre um hobby que você pratica.',
      minUserTurns: 5,
      completed: false,
    })
    expect(missionChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        mission_key: 'b1-hobby',
        title_pt: 'Seu hobby favorito',
        description_pt: 'Fale sobre um hobby que você pratica.',
      }),
    )
  })

  it('falls back to a static per-level mission and still persists a row when the AI call throws', async () => {
    mockChatCreate.mockRejectedValue(new Error('network down'))
    const { from, missionChain } = makeSupabase({ cefr_level: 'C1' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result.missionKey).toBe('c1-interview')
    expect(result.completed).toBe(false)
    expect(result.minUserTurns).toBe(8)
    expect(missionChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', mission_key: 'c1-interview' }),
    )
  })

  it('falls back to a static per-level mission when the AI returns unparseable JSON', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] })
    const { from } = makeSupabase({ cefr_level: 'A2' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result.missionKey).toBe('a2-weekend')
    expect(result.minUserTurns).toBe(4)
  })

  it('defaults to A1 turns when cefr_level is missing', async () => {
    const { from } = makeSupabase(
      { cefr_level: null },
      { mission_key: 'a1-intro', title_pt: 'Apresentação', description_pt: 'Apresente-se.', completed_at: null },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result.minUserTurns).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/lib/missions.test.ts`
Expected: FAIL — `getOrGenerateTodaysMission` is not exported (old file only exports `getMissionForDate`)

- [ ] **Step 3: Check for other consumers of the old API before removing it**

Run: `grep -rn "getMissionForDate\|from '@/lib/missions'" --include="*.ts" --include="*.tsx" app lib components hooks`
Expected at this point in the plan: matches in `app/api/mission/route.ts`, `app/api/session/[id]/finalize/route.ts`, `app/dashboard/page.tsx`, and their test files — all of which Tasks 3, 6, and 9 update later in this plan. Confirm there are no other callers; if you find one this plan doesn't already cover, stop and report it rather than silently leaving it broken.

- [ ] **Step 4: Replace `lib/missions.ts`**

```typescript
// lib/missions.ts
import type { CefrLevel } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'

export interface DailyMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
  completed: boolean
}

const MIN_USER_TURNS_BY_LEVEL: Record<CefrLevel, number> = {
  A1: 3,
  A2: 4,
  B1: 5,
  B2: 6,
  C1: 8,
  C2: 8,
}

interface FallbackMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
}

const FALLBACK_MISSIONS: Record<CefrLevel, FallbackMission> = {
  A1: { missionKey: 'a1-intro', titlePt: 'Apresentação completa', descriptionPt: 'Apresente-se em inglês: nome, de onde você é e quantos anos tem.' },
  A2: { missionKey: 'a2-weekend', titlePt: 'Fim de semana passado', descriptionPt: 'Conte o que você fez no último fim de semana usando o passado simples.' },
  B1: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme, série ou livro em inglês e explique por quê você gosta.' },
  B2: { missionKey: 'b2-debate', titlePt: 'Debate: redes sociais', descriptionPt: 'Dê sua opinião argumentada sobre o impacto das redes sociais na saúde mental.' },
  C1: { missionKey: 'c1-interview', titlePt: 'Entrevista simulada', descriptionPt: 'Conduza uma simulação de entrevista de emprego em inglês com naturalidade e linguagem formal.' },
  C2: { missionKey: 'c2-story', titlePt: 'Narrativa nativa', descriptionPt: 'Conte uma história com estrutura narrativa completa usando expressões idiomáticas naturalmente.' },
}

function todayBrazil(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface GeneratedMission {
  mission_key?: string
  title_pt?: string
  description_pt?: string
}

async function generateMission(level: CefrLevel, userId: string, supabase: SupabaseClient): Promise<FallbackMission> {
  try {
    const context = await getStudentContext(userId, supabase)
    const contextLines: string[] = []
    if (context.goal) contextLines.push(`Goal: ${context.goal}`)
    if (context.frequentErrors.length > 0) contextLines.push(`Frequent mistakes: ${context.frequentErrors.join(', ')}`)
    if (context.topicsNeedingReview.length > 0) contextLines.push(`Topics needing review: ${context.topicsNeedingReview.join(', ')}`)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Create one short daily speaking mission for a Brazilian English student.

STUDENT:
- CEFR Level: ${level}
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}

Return ONLY valid JSON:
{"mission_key":"kebab-case-slug","title_pt":"título curto em português (máx 5 palavras)","description_pt":"uma frase no imperativo em português dizendo o que o aluno deve falar, ex: 'Fale sobre...'"}`,
      }],
    })

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as GeneratedMission
    if (!parsed.mission_key || !parsed.title_pt || !parsed.description_pt) {
      throw new Error('Incomplete mission from AI')
    }
    return { missionKey: parsed.mission_key, titlePt: parsed.title_pt, descriptionPt: parsed.description_pt }
  } catch {
    return FALLBACK_MISSIONS[level] ?? FALLBACK_MISSIONS.A1
  }
}

export async function getOrGenerateTodaysMission(
  userId: string,
  supabase: SupabaseClient,
): Promise<DailyMission> {
  const date = todayBrazil()

  const [{ data: userRow }, { data: existing }] = await Promise.all([
    supabase.from('users').select('cefr_level').eq('id', userId).single(),
    supabase
      .from('daily_missions_log')
      .select('mission_key, title_pt, description_pt, completed_at')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ])

  const level = ((userRow as { cefr_level?: CefrLevel } | null)?.cefr_level ?? 'A1') as CefrLevel
  const minUserTurns = MIN_USER_TURNS_BY_LEVEL[level] ?? 3

  if (existing) {
    const row = existing as { mission_key: string; title_pt: string; description_pt: string; completed_at: string | null }
    return {
      missionKey: row.mission_key,
      titlePt: row.title_pt,
      descriptionPt: row.description_pt,
      minUserTurns,
      completed: !!row.completed_at,
    }
  }

  const generated = await generateMission(level, userId, supabase)

  await supabase.from('daily_missions_log').insert({
    user_id: userId,
    date,
    mission_key: generated.missionKey,
    title_pt: generated.titlePt,
    description_pt: generated.descriptionPt,
  })

  return { ...generated, minUserTurns, completed: false }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/lib/missions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/missions.ts __tests__/lib/missions.test.ts
git commit -m "feat: generate daily missions with AI, cached per user per day"
```

---

### Task 3: `GET /api/mission` — repurpose the dead route

**Files:**
- Modify: `app/api/mission/route.ts`
- Modify: `__tests__/app/api/mission.test.ts`

**Interfaces:**
- Consumes: `getOrGenerateTodaysMission(userId: string, supabase: SupabaseClient): Promise<DailyMission>` from Task 2.
- Produces: `GET` returning `{ mission: DailyMission }` — consumed by Task 7 (`MissionCard`).

- [ ] **Step 1: Update the test file**

Replace `__tests__/app/api/mission.test.ts` in full:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetOrGenerate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/missions', () => ({ getOrGenerateTodaysMission: mockGetOrGenerate }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { GET } from '@/app/api/mission/route'

describe('GET /api/mission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the mission for the authenticated user', async () => {
    mockGetOrGenerate.mockResolvedValue({
      missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.',
      minUserTurns: 5, completed: false,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.mission.missionKey).toBe('b1-movie')
    expect(body.mission.completed).toBe(false)
    expect(mockGetOrGenerate).toHaveBeenCalledWith('user-1', expect.anything())
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/app/api/mission.test.ts`
Expected: FAIL — response shape doesn't match (old route returns `{ mission, today, completed, completed_at }` computed from `getMissionForDate`)

- [ ] **Step 3: Rewrite the route**

```typescript
// app/api/mission/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getOrGenerateTodaysMission } from '@/lib/missions'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mission = await getOrGenerateTodaysMission(user.id, supabase)

  return NextResponse.json({ mission })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/mission.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mission/route.ts __tests__/app/api/mission.test.ts
git commit -m "feat: wire GET /api/mission to AI-generated daily missions"
```

---

### Task 4: `POST /api/mission/start` — begin a mission-focused lesson

**Files:**
- Create: `app/api/mission/start/route.ts`
- Test: `__tests__/app/api/mission/start.test.ts`

**Interfaces:**
- Consumes: `getOrGenerateTodaysMission` from Task 2.
- Produces: `POST` returning `{ session_id: string }` — consumed by Task 7 (`MissionCard`'s start button).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app/api/mission/start.test.ts`:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetOrGenerate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/missions', () => ({ getOrGenerateTodaysMission: mockGetOrGenerate }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { POST } from '@/app/api/mission/start/route'

const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

describe('POST /api/mission/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no teacher assigned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ teacher_id: null, cefr_level: 'B1' })
      return makeChain(null)
    })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('closes a dangling open session, creates a new one with the mission in lesson_plan_json, and returns its id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetOrGenerate.mockResolvedValue({
      missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.',
      minUserTurns: 5, completed: false,
    })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'B1' })
    const closeDanglingChain = makeChain(null)
    closeDanglingChain.update = vi.fn().mockReturnValue(closeDanglingChain)
    const insertChain = makeChain({ id: 'session-99' })
    insertChain.insert = vi.fn().mockReturnValue(insertChain)

    let sessionsCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return userChain
      if (table === 'sessions') {
        sessionsCallCount++
        return sessionsCallCount === 1 ? closeDanglingChain : insertChain
      }
      return makeChain(null)
    })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.session_id).toBe('session-99')
    expect(closeDanglingChain.update).toHaveBeenCalledWith(expect.objectContaining({ ended_at: expect.any(String) }))
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        teacher_id: 'teacher-1',
        topic: 'b1-movie',
        lesson_topic_id: 'b1-movie',
        lesson_plan_json: expect.objectContaining({
          title_pt: 'Recomendação cultural',
          objective_pt: 'Recomende um filme.',
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/app/api/mission/start.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/mission/start/route'`

- [ ] **Step 3: Implement the route**

```typescript
// app/api/mission/start/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getOrGenerateTodaysMission } from '@/lib/missions'

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('teacher_id, cefr_level')
    .eq('id', user.id)
    .single()

  if (!userData?.teacher_id) return NextResponse.json({ error: 'No teacher assigned' }, { status: 400 })

  const mission = await getOrGenerateTodaysMission(user.id, supabase)

  // Close dangling open sessions so GET /api/session finds the new one
  // (same pattern as app/api/lesson/generate/route.ts)
  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: userData.teacher_id,
      mode: 'daily',
      topic: mission.missionKey,
      lesson_topic_id: mission.missionKey,
      lesson_plan_json: {
        title_pt: mission.titlePt,
        objective_pt: mission.descriptionPt,
        teacher_greeting: `Today's mission: ${mission.descriptionPt}. Let's work on that together!`,
        lesson_instructions: `Guide the student toward accomplishing this mission during the conversation: "${mission.descriptionPt}". Don't announce the mission mechanically — weave it naturally into the conversation.`,
        vocabulary_focus: [],
      },
    })
    .select('id')
    .single()

  if (error || !newSession) return NextResponse.json({ error: error?.message ?? 'Session creation failed' }, { status: 500 })

  return NextResponse.json({ session_id: newSession.id })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/mission/start.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mission/start/route.ts __tests__/app/api/mission/start.test.ts
git commit -m "feat: add POST /api/mission/start to begin a mission-focused lesson"
```

---

### Task 5: `GET /api/session/[id]/report` — AI-verified completion + reward

**Files:**
- Modify: `app/api/session/[id]/report/route.ts`
- Modify: `__tests__/app/api/session-report.test.ts`

**Interfaces:**
- Consumes: `getOrGenerateTodaysMission` from Task 2.
- Produces: `GET` response keeps its existing shape (`userMessages`, `corrections`, `pronunciationHints`, `durationSeconds`, `missionCompleted`, `missionTitle`) — no changes needed in `components/aula/SessionReport.tsx`, which already consumes exactly this shape.

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/app/api/session-report.test.ts` in full:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockChatCreate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

import { GET } from '@/app/api/session/[id]/report/route'

const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.catch = (fn: any) => Promise.resolve({ data, error }).catch(fn)
  chain.finally = (fn: any) => Promise.resolve({ data, error }).finally(fn)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

function mockTables(opts: {
  sessionData?: unknown
  userData?: unknown
  missionData?: unknown
  messages?: unknown[]
}) {
  const sessionChain = makeChain(opts.sessionData ?? { id: 'sess-1', user_id: 'user-1', duration_seconds: 300, started_at: '2026-07-11T10:00:00Z' })
  const userChain = makeChain(opts.userData ?? { cefr_level: 'B1' })
  const missionChain = makeChain(opts.missionData ?? null)
  const messagesChain = makeChain(opts.messages ?? [])

  mockFrom.mockImplementation((table: string) => {
    if (table === 'sessions') return sessionChain
    if (table === 'users') return userChain
    if (table === 'daily_missions_log') return missionChain
    if (table === 'messages') return messagesChain
    return makeChain(null)
  })

  return { sessionChain, userChain, missionChain, messagesChain }
}

describe('GET /api/session/[id]/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when session not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeChain(null))
    const res = await GET(new Request('http://localhost/api/session/nonexistent/report'), { params: { id: 'nonexistent' } })
    expect(res.status).toBe(404)
  })

  it('returns correct message counts', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'Hi', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Hi!', had_correction: true, pronunciation_hint: 'Buzz the th sound.' },
        { role: 'user', text: 'OK', had_correction: false, pronunciation_hint: null },
      ],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.userMessages).toBe(2)
    expect(body.corrections).toBe(1)
    expect(body.pronunciationHints).toBe(1)
    expect(body.durationSeconds).toBe(300)
    expect(body.missionTitle).toBe('Recomendação cultural')
  })

  it('does not call the AI when there are too few user turns', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' }, // minUserTurns = 5
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'Hi', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Hello!', had_correction: false, pronunciation_hint: null },
      ],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(false)
    expect(mockChatCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not mark completed when the AI says the mission was not covered', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { missionChain } = mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'I like pizza', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Nice, tell me more', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Yes very much', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'What else do you like?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'I like pasta too', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Cool', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Yes', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Anything else?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'OK bye', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI verdict below is what
    // actually decides the outcome — not the floor.
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: '{"covered":false}' } }] })

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(mockChatCreate).toHaveBeenCalled()
    expect(body.missionCompleted).toBe(false)
    expect(missionChain.update).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('marks completed and increments the counter when the AI confirms coverage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { missionChain } = mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'I recommend Inception', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Great choice, why?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'I like it because of the plot twists', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'What else stood out?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'It is very smart and well made', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Anything you disliked?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Not really, I loved it', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Would you recommend it to a friend?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Definitely, everyone should watch it', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI verdict below is what
    // actually decides the outcome — not the floor.
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: '{"covered":true}' } }] })

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(true)
    expect(missionChain.update).toHaveBeenCalledWith(expect.objectContaining({ completed_at: expect.any(String) }))
    expect(mockRpc).toHaveBeenCalledWith('increment_missions_completed', { p_user_id: 'user-1' })
  })

  it('reports an already-completed mission without calling the AI again', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: '2026-07-11T09:00:00Z' },
      messages: [],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(true)
    expect(mockChatCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('treats an AI failure during verification as not covered, without throwing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'a', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'b', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'c', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'd', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'e', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'f', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'g', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'h', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'i', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI call below is actually
    // attempted (and fails) rather than being skipped by the floor.
    mockChatCreate.mockRejectedValue(new Error('rate limited'))

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mockChatCreate).toHaveBeenCalled()
    expect(body.missionCompleted).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/app/api/session-report.test.ts`
Expected: FAIL — route still uses `getMissionForDate` and the old turn-count-only check; response/mocks don't line up

- [ ] **Step 3: Rewrite the route**

```typescript
// app/api/session/[id]/report/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getOrGenerateTodaysMission } from '@/lib/missions'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, duration_seconds, started_at')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: messages }, mission] = await Promise.all([
    supabase
      .from('messages')
      .select('role, text, had_correction, pronunciation_hint')
      .eq('session_id', sessionId),
    getOrGenerateTodaysMission(user.id, supabase),
  ])

  const msgs: Array<{ role: string; text: string; had_correction: boolean; pronunciation_hint: string | null }> = messages ?? []
  const userMessages = msgs.filter((m) => m.role === 'user').length
  const corrections = msgs.filter((m) => m.had_correction).length
  const pronunciationHints = msgs.filter((m) => m.pronunciation_hint).length

  let missionCompleted = mission.completed

  if (!missionCompleted && userMessages >= mission.minUserTurns) {
    const transcript = msgs.filter((m) => m.role === 'user').map((m) => m.text).join(' ')

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 20,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: `Mission: "${mission.descriptionPt}"\n\nStudent said (in this conversation): "${transcript}"\n\nDid the student's conversation address this mission? Respond ONLY valid JSON: {"covered": true or false}`,
        }],
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { covered?: boolean }

      if (parsed.covered === true) {
        missionCompleted = true
        const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

        const { error: missionError } = await supabase
          .from('daily_missions_log')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('date', today)
        if (missionError) console.error('Mission completion update failed:', missionError.message)

        const { error: rpcError } = await supabase.rpc('increment_missions_completed', { p_user_id: user.id })
        if (rpcError) console.error('Mission counter increment failed:', rpcError.message)
      }
    } catch (err) {
      console.error('Mission verification failed:', err)
    }
  }

  return NextResponse.json({
    userMessages,
    corrections,
    pronunciationHints,
    durationSeconds: session.duration_seconds ?? 0,
    missionCompleted,
    missionTitle: mission.titlePt,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/session-report.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/session/\[id\]/report/route.ts __tests__/app/api/session-report.test.ts
git commit -m "feat: verify mission completion with AI in session report, add reward counter"
```

---

### Task 6: `POST /api/session/[id]/finalize` — remove the mission step

**Files:**
- Modify: `app/api/session/[id]/finalize/route.ts`
- Modify: `__tests__/app/api/session/finalize.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes responsibility that Task 5 already replaced.

- [ ] **Step 1: Update the test file**

In `__tests__/app/api/session/finalize.test.ts`, delete the entire `it('marks mission complete when user sent enough turns', ...)` test block (lines 42-90 today). Keep the `'returns 401 when unauthenticated'` and `'generates memory, upserts errors, updates streak, returns ok:true'` tests unchanged.

- [ ] **Step 2: Run tests to verify the remaining ones still pass, and the deleted one is gone**

Run: `npm run test:run -- __tests__/app/api/session/finalize.test.ts`
Expected: PASS (2 tests) — confirms the two kept tests don't depend on the mission block before you remove it from the route.

- [ ] **Step 3: Remove the mission step from the route**

In `app/api/session/[id]/finalize/route.ts`, delete the import:

```typescript
import { getMissionForDate } from '@/lib/missions'
```

And delete the entire step 3 block:

```typescript
  // 3 — Mark daily mission complete if user sent enough turns
  const userMsgCount = msgs.filter((m) => m.role === 'user').length
  const todayBrazil = new Date(Date.now() + brazilOffset).toISOString().slice(0, 10)
  const mission = getMissionForDate(userData?.cefr_level, todayBrazil)

  if (userMsgCount >= mission.minUserTurns) {
    const { error: missionError } = await supabase
      .from('daily_missions_log')
      .upsert(
        { user_id: user.id, date: todayBrazil, mission_key: mission.key },
        { onConflict: 'user_id,date', ignoreDuplicates: true },
      )
    if (missionError) console.error('Mission completion failed:', missionError.message)
  }
```

The function now ends right after the streak-update block (`return NextResponse.json({ ok: true })` stays as the final line).

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm run test:run -- __tests__/app/api/session/finalize.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/session/\[id\]/finalize/route.ts __tests__/app/api/session/finalize.test.ts
git commit -m "refactor: remove mission-completion step from finalize (moved to report)"
```

---

### Task 7: `MissionCard.tsx` — self-fetching, with a start button

**Files:**
- Modify: `components/dashboard/MissionCard.tsx`
- Modify: `__tests__/components/dashboard/MissionCard.test.tsx`

**Interfaces:**
- Consumes: `GET /api/mission` (Task 3, returns `{ mission: DailyMission }`) and `POST /api/mission/start` (Task 4, returns `{ session_id: string }`) via `fetch`. `useRouter` from `next/navigation`.
- Produces: `export function MissionCard(): JSX.Element` — no props. Consumed by Task 9 (`app/dashboard/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/components/dashboard/MissionCard.test.tsx` in full:

```typescript
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MissionCard } from '@/components/dashboard/MissionCard'

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

describe('MissionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the mission title and description once loaded, not completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByText('Recomendação cultural')).toBeInTheDocument())
    expect(screen.getByText('Recomende um filme.')).toBeInTheDocument()
    expect(screen.queryByText(/missão concluída/i)).not.toBeInTheDocument()
  })

  it('shows a start button when not completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
  })

  it('shows completed styling and no start button when completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: true } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByText(/missão concluída/i)).toBeInTheDocument())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('starts a mission-focused lesson and navigates to /aula on button click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-99' }),
      })
    const user = userEvent.setup()
    render(<MissionCard />)
    const button = await screen.findByRole('button')
    await user.click(button)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/aula'))
    expect(mockFetch).toHaveBeenCalledWith('/api/mission/start', { method: 'POST' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/components/dashboard/MissionCard.test.tsx`
Expected: FAIL — current `MissionCard` requires `titlePt`/`descriptionPt`/`completed` props and does not fetch or render a button

- [ ] **Step 3: Rewrite the component**

```typescript
// components/dashboard/MissionCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

interface DailyMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
  completed: boolean
}

export function MissionCard() {
  const router = useRouter()
  const [mission, setMission] = useState<DailyMission | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/mission')
      .then((res) => res.json())
      .then((data: { mission: DailyMission }) => {
        if (mounted) setMission(data.mission)
      })
      .catch(() => {
        if (mounted) setError('Não foi possível carregar a missão.')
      })
    return () => { mounted = false }
  }, [])

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/mission/start', { method: 'POST' })
      if (!res.ok) {
        setError('Erro ao iniciar aula. Tente novamente.')
        return
      }
      router.push('/aula')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setStarting(false)
    }
  }

  if (!mission) {
    return <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card h-20 animate-pulse" />
  }

  const completed = mission.completed

  return (
    <div className={`p-4 rounded-xl flex flex-col gap-3 ${
      completed
        ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900'
        : 'bg-surface-light-card dark:bg-surface-dark-card'
    }`}>
      <div className="flex items-start gap-3">
        <CheckCircle
          size={20}
          className={`mt-0.5 flex-shrink-0 ${
            completed ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary opacity-30'
          }`}
        />
        <div>
          <p className={`text-sm font-semibold ${
            completed ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
          }`}>
            {completed ? 'Missão concluída — ' : ''}{mission.titlePt}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            {mission.descriptionPt}
          </p>
        </div>
      </div>

      {!completed && (
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {starting ? 'Preparando...' : 'Começar aula focada →'}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/components/dashboard/MissionCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/MissionCard.tsx __tests__/components/dashboard/MissionCard.test.tsx
git commit -m "feat: make MissionCard self-fetching with a start-lesson button"
```

---

### Task 8: `MissionCounterBadge.tsx` — lifetime completion counter

**Files:**
- Create: `components/dashboard/MissionCounterBadge.tsx`
- Test: `__tests__/components/dashboard/MissionCounterBadge.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function MissionCounterBadge({ count }: { count: number }): JSX.Element | null` — consumed by Task 9 (`app/dashboard/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/dashboard/MissionCounterBadge.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MissionCounterBadge } from '@/components/dashboard/MissionCounterBadge'

describe('MissionCounterBadge', () => {
  it('shows the completion count', () => {
    render(<MissionCounterBadge count={12} />)
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/missões cumpridas/i)).toBeInTheDocument()
  })

  it('renders nothing when count is zero', () => {
    const { container } = render(<MissionCounterBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/components/dashboard/MissionCounterBadge.test.tsx`
Expected: FAIL — `Cannot find module '@/components/dashboard/MissionCounterBadge'`

- [ ] **Step 3: Implement the component**

```typescript
// components/dashboard/MissionCounterBadge.tsx
interface Props {
  count: number
}

export function MissionCounterBadge({ count }: Props) {
  if (count === 0) return null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex items-center gap-3">
      <span className="text-xl shrink-0">🎯</span>
      <p className="text-sm text-content-light dark:text-content-dark">
        <span className="font-bold">{count}</span> {count === 1 ? 'missão cumprida' : 'missões cumpridas'}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/components/dashboard/MissionCounterBadge.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/MissionCounterBadge.tsx __tests__/components/dashboard/MissionCounterBadge.test.tsx
git commit -m "feat: add MissionCounterBadge showing lifetime mission completions"
```

---

### Task 9: Wire both components into `app/dashboard/page.tsx`

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `MissionCard` from Task 7 (no props), `MissionCounterBadge` from Task 8 (`{ count: number }`).
- Produces: nothing new — final integration task.

- [ ] **Step 1: Remove the old mission import and query**

Delete this import line:

```typescript
import { getMissionForDate } from '@/lib/missions'
```

Delete this block (the `daily_missions_log` query added for the old system):

```typescript
  // Load today's mission status
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: missionLog } = await supabase
    .from('daily_missions_log')
    .select('completed_at')
    .eq('user_id', authUser.id)
    .eq('date', today)
    .maybeSingle()
```

Delete this computation:

```typescript
  const mission = getMissionForDate(u.cefr_level, today)
  const missionCompleted = !!missionLog?.completed_at
```

(`u` is defined a few lines above this block — leave `const u = userData as User` in place, only these two lines that follow it are removed here.)

- [ ] **Step 2: Render the two components**

Find this existing JSX:

```typescript
        {pronunciationTrend && (
          <PronunciationScoreCard
            currentScore={pronunciationTrend.currentScore}
            trend={pronunciationTrend.trend}
          />
        )}

        {vipUser && <VipBadge plan={vipUser.plan} />}
```

Replace with:

```typescript
        {pronunciationTrend && (
          <PronunciationScoreCard
            currentScore={pronunciationTrend.currentScore}
            trend={pronunciationTrend.trend}
          />
        )}

        <MissionCounterBadge count={u.missions_completed_count ?? 0} />

        {vipUser && <VipBadge plan={vipUser.plan} />}
```

Then find the old `MissionCard` usage:

```typescript
        {/* Daily Mission */}
        <MissionCard
          titlePt={mission.titlePt}
          descriptionPt={mission.descriptionPt}
          completed={missionCompleted}
        />
```

Replace with:

```typescript
        {/* Daily Mission */}
        <MissionCard />
```

- [ ] **Step 3: Add the `MissionCounterBadge` import**

Add it next to the existing `MissionCard` import:

```typescript
import { MissionCard } from '@/components/dashboard/MissionCard'
import { MissionCounterBadge } from '@/components/dashboard/MissionCounterBadge'
```

- [ ] **Step 4: Add the new column to the `User` type**

`types/index.ts` defines `User` starting at line 14 with one field per `users` column, e.g. `streak_days: number` at line 23. Add the new column from Task 1's migration right after it:

```typescript
  streak_days: number
  missions_completed_count: number
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this change.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm run test:run`
Expected: PASS (all existing tests plus the new ones from Tasks 2, 3, 4, 5, 7, 8)

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx types/index.ts
git commit -m "feat: wire self-fetching mission card and completion counter into dashboard"
```

---

## Verification Summary

After Task 9: a student opens the dashboard and sees today's AI-generated mission (persisted for the whole day, same for every reader), taps "Começar aula focada →" to start a lesson where the teacher genuinely works toward that mission's topic, and — only once the conversation actually covered it (AI-verified at session end, not just message count) — sees it marked complete and the lifetime counter increment. `finalize` no longer touches missions at all; `report` is the single place completion is decided, matching the existing await chain in `AulaClient.handleEnd()` with no new latency.
