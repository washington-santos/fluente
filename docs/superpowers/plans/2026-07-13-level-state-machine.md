# Level State Machine (Nivelamento Inteligente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the placement test's output into a level *recommendation* the student can accept or downgrade (never upgrade), monitor the first 5 lessons at a new level to catch a bad fit, let students manually move down a level at any time with progress preserved, and auto-return them once they've re-proven the lower level.

**Architecture:** All level-transition logic (ordering, downgrade, confirmation-window trigger, reinforcement auto-return) lives in one new pure/thin module, `lib/levels.ts`, reused by three route handlers and three UI touchpoints. `users.cefr_level` always holds the level currently being studied — including during reinforcement — so every existing reader of `cefr_level` (topic picker, lesson engine, dashboard) keeps working unmodified. A new `reinforcement_target_level` column is the only new piece of state that branches behavior.

**Tech Stack:** Next.js App Router, Supabase (Postgres + `@supabase/supabase-js`), Vitest + Testing Library, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-13-level-state-machine-design.md`

## Global Constraints

- All new/changed user-facing copy is in Portuguese (pt-BR), matching every existing string in `app/dashboard`, `app/perfil`, `app/nivelamento`.
- Every new table gets RLS enabled with an "own rows" policy, matching every other table in `supabase/migrations/`.
- Tests use Vitest (`npm run test:run`), with `// @vitest-environment node` for API routes and `// @vitest-environment jsdom` for components, matching existing test files exactly.
- No UI ever offers moving to a level *above* the current one, anywhere in this feature.
- `cefr_level` is never renamed or restructured — only new columns are added alongside it.
- Reuse `lib/mastery.ts`'s existing `checkPassed()`/`topic_assessments.passed` and `lib/topics.ts`'s existing `TOPICS_BY_LEVEL`/`getTopicsForLevel()` — no new scoring logic, no new "essential topics" concept.

---

## Task 1: Migration + type definitions

**Files:**
- Create: `supabase/migrations/20260713000002_level_state_machine.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `User.level_confirmed_at: string | null`, `User.reinforcement_target_level: CefrLevel | null`, `User.confirmation_suggestion_dismissed: boolean`, `LevelHistory` interface — consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260713000002_level_state_machine.sql

CREATE TABLE level_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_level  text CHECK (from_level IN ('A1','A2','B1','B2','C1','C2')),
  to_level    text NOT NULL CHECK (to_level IN ('A1','A2','B1','B2','C1','C2')),
  reason      text NOT NULL CHECK (reason IN (
                'placement_recommended',
                'placement_chose_lower',
                'confirmation_suggestion_accepted',
                'manual_downgrade',
                'reinforcement_auto_return'
              )),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE level_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lh_own" ON level_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS level_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinforcement_target_level text
    CHECK (reinforcement_target_level IN ('A1','A2','B1','B2','C1','C2')),
  ADD COLUMN IF NOT EXISTS confirmation_suggestion_dismissed boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or the project's normal migration-apply command — check `supabase/migrations/README` if present; otherwise apply via the Supabase MCP `apply_migration` tool with `name: level_state_machine`).
Expected: migration applies with no errors; `level_history` table exists; `users` has the three new columns.

- [ ] **Step 3: Update `types/index.ts`**

Find the `User` interface (currently ends with `demo_status: DemoStatus | null`) and add the three new fields:

```ts
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
  missions_completed_count: number
  last_session_at: string | null
  preferred_session_time: string | null
  theme: Theme
  demo_started_at: string | null
  demo_expires_at: string | null
  demo_status: DemoStatus | null
  level_confirmed_at: string | null
  reinforcement_target_level: CefrLevel | null
  confirmation_suggestion_dismissed: boolean
}
```

Add a new `LevelHistory` interface after the existing `LearningPlan` interface (end of file):

```ts
export type LevelHistoryReason =
  | 'placement_recommended'
  | 'placement_chose_lower'
  | 'confirmation_suggestion_accepted'
  | 'manual_downgrade'
  | 'reinforcement_auto_return'

export interface LevelHistory {
  id: string
  user_id: string
  from_level: CefrLevel | null
  to_level: CefrLevel
  reason: LevelHistoryReason
  created_at: string
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing `User` consumers only read fields that already existed, so this is additive).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260713000002_level_state_machine.sql types/index.ts
git commit -m "feat: add level_history table and level state columns to users"
```

---

## Task 2: `lib/levels.ts` — CEFR ordering helpers

**Files:**
- Create: `lib/levels.ts`
- Test: `__tests__/lib/levels.test.ts`

**Interfaces:**
- Consumes: `CefrLevel` from `@/types` (Task 1).
- Produces: `CEFR_ORDER: CefrLevel[]`, `levelBelow(level: CefrLevel): CefrLevel | null`, `isAtOrBelow(candidate: CefrLevel, ceiling: CefrLevel): boolean` — consumed by Tasks 3, 4, 5, 7, 9, 12, 13.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/levels.test.ts
import { describe, it, expect } from 'vitest'
import { CEFR_ORDER, levelBelow, isAtOrBelow } from '@/lib/levels'

describe('CEFR_ORDER', () => {
  it('is ordered from A1 to C2', () => {
    expect(CEFR_ORDER).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  })
})

describe('levelBelow', () => {
  it('returns the previous level for a mid-range level', () => {
    expect(levelBelow('B1')).toBe('A2')
  })

  it('returns null for A1 (nothing below the floor)', () => {
    expect(levelBelow('A1')).toBeNull()
  })

  it('returns the level below C2', () => {
    expect(levelBelow('C2')).toBe('C1')
  })
})

describe('isAtOrBelow', () => {
  it('is true when candidate equals ceiling', () => {
    expect(isAtOrBelow('B1', 'B1')).toBe(true)
  })

  it('is true when candidate is below ceiling', () => {
    expect(isAtOrBelow('A1', 'B1')).toBe(true)
  })

  it('is false when candidate is above ceiling', () => {
    expect(isAtOrBelow('B2', 'B1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: FAIL — `Cannot find module '@/lib/levels'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/levels.ts
import type { CefrLevel } from '@/types'

export const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function levelBelow(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx > 0 ? CEFR_ORDER[idx - 1] : null
}

export function isAtOrBelow(candidate: CefrLevel, ceiling: CefrLevel): boolean {
  return CEFR_ORDER.indexOf(candidate) <= CEFR_ORDER.indexOf(ceiling)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/levels.ts __tests__/lib/levels.test.ts
git commit -m "feat: add CEFR level ordering helpers"
```

---

## Task 3: `lib/levels.ts` — `downgradeLevel()`

**Files:**
- Modify: `lib/levels.ts`
- Test: `__tests__/lib/levels.test.ts`

**Interfaces:**
- Consumes: `levelBelow()` (Task 2).
- Produces: `LevelHistoryReason` type (re-exported, matches `types/index.ts`), `DowngradeResult { newLevel: CefrLevel; reinforcementTargetLevel: CefrLevel }`, `downgradeLevel(supabase: SupabaseClient, userId: string, currentLevel: CefrLevel, reason: 'manual_downgrade' | 'confirmation_suggestion_accepted'): Promise<DowngradeResult | null>` — consumed by Tasks 9 (downgrade route) and 12/13 (indirectly, via that route).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/levels.test.ts`:

```ts
import { downgradeLevel } from '@/lib/levels'

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  chain.update = () => chain
  chain.insert = (row: unknown) => { inserted.push(row); return Promise.resolve({ error: null }) }
  return chain
}

let inserted: unknown[]

describe('downgradeLevel', () => {
  it('returns null when there is no level below the current one', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A1', 'manual_downgrade')
    expect(result).toBeNull()
  })

  it('sets reinforcement_target_level to the current level on a first downgrade', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A2', 'manual_downgrade')
    expect(result).toEqual({ newLevel: 'A1', reinforcementTargetLevel: 'A2' })
  })

  it('preserves an existing reinforcement_target_level across repeated downgrades', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: 'B1' }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A2', 'manual_downgrade')
    expect(result).toEqual({ newLevel: 'A1', reinforcementTargetLevel: 'B1' })
  })

  it('records a level_history row with the given reason', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    await downgradeLevel(supabase, 'u1', 'B1', 'confirmation_suggestion_accepted')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'B1', to_level: 'A2', reason: 'confirmation_suggestion_accepted',
    }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: FAIL — `downgradeLevel is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `lib/levels.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type LevelHistoryReason =
  | 'placement_recommended'
  | 'placement_chose_lower'
  | 'confirmation_suggestion_accepted'
  | 'manual_downgrade'
  | 'reinforcement_auto_return'

export interface DowngradeResult {
  newLevel: CefrLevel
  reinforcementTargetLevel: CefrLevel
}

export async function downgradeLevel(
  supabase: SupabaseClient,
  userId: string,
  currentLevel: CefrLevel,
  reason: 'manual_downgrade' | 'confirmation_suggestion_accepted',
): Promise<DowngradeResult | null> {
  const target = levelBelow(currentLevel)
  if (!target) return null

  const { data: userRow } = await supabase
    .from('users')
    .select('reinforcement_target_level')
    .eq('id', userId)
    .single()

  const reinforcementTargetLevel =
    (userRow as { reinforcement_target_level?: CefrLevel | null } | null)?.reinforcement_target_level ?? currentLevel

  await supabase.from('users').update({
    cefr_level: target,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
    reinforcement_target_level: reinforcementTargetLevel,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId,
    from_level: currentLevel,
    to_level: target,
    reason,
  })

  return { newLevel: target, reinforcementTargetLevel }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/levels.ts __tests__/lib/levels.test.ts
git commit -m "feat: add downgradeLevel with reinforcement-target preservation"
```

---

## Task 4: `lib/levels.ts` — `shouldSuggestDowngrade()`

**Files:**
- Modify: `lib/levels.ts`
- Test: `__tests__/lib/levels.test.ts`

**Interfaces:**
- Produces: `shouldSuggestDowngrade(passedFlags: boolean[]): boolean` — consumed by Task 12 (dashboard).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/levels.test.ts`:

```ts
import { shouldSuggestDowngrade } from '@/lib/levels'

describe('shouldSuggestDowngrade', () => {
  it('is false with no assessments yet', () => {
    expect(shouldSuggestDowngrade([])).toBe(false)
  })

  it('is false with 2 failures out of 2 (not enough data to decide)', () => {
    expect(shouldSuggestDowngrade([false, false])).toBe(false)
  })

  it('is true as soon as 3 of the first 3 fail', () => {
    expect(shouldSuggestDowngrade([false, false, false])).toBe(true)
  })

  it('is true with 3 failures and 1 pass out of the first 4', () => {
    expect(shouldSuggestDowngrade([true, false, false, false])).toBe(true)
  })

  it('is false when only 2 of the first 5 fail', () => {
    expect(shouldSuggestDowngrade([true, true, false, true, false])).toBe(false)
  })

  it('is true with exactly 3 failures out of all 5', () => {
    expect(shouldSuggestDowngrade([true, false, true, false, false])).toBe(true)
  })

  it('throws if given more than 5 flags', () => {
    expect(() => shouldSuggestDowngrade([true, true, true, true, true, true])).toThrow(RangeError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: FAIL — `shouldSuggestDowngrade is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `lib/levels.ts`:

```ts
export function shouldSuggestDowngrade(passedFlags: boolean[]): boolean {
  if (passedFlags.length > 5) throw new RangeError('expected at most the first 5 assessments')
  const failures = passedFlags.filter((p) => !p).length
  return failures >= 3
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/levels.ts __tests__/lib/levels.test.ts
git commit -m "feat: add shouldSuggestDowngrade confirmation-window trigger"
```

---

## Task 5: `lib/levels.ts` — `checkAndApplyReinforcementReturn()`

**Files:**
- Modify: `lib/levels.ts`
- Test: `__tests__/lib/levels.test.ts`

**Interfaces:**
- Consumes: `getTopicsForLevel(cefrLevel: string | null | undefined): Topic[]` from `@/lib/topics` (existing).
- Produces: `checkAndApplyReinforcementReturn(supabase: SupabaseClient, userId: string): Promise<CefrLevel | null>` — consumed by Task 11 (assess route).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/levels.test.ts`:

```ts
import { checkAndApplyReinforcementReturn } from '@/lib/levels'

function makeReturnChain(users: unknown, progress: unknown) {
  const usersChain: Record<string, unknown> = {}
  usersChain.select = () => usersChain
  usersChain.eq = () => usersChain
  usersChain.single = () => Promise.resolve({ data: users, error: null })
  usersChain.update = () => usersChain
  usersChain.insert = (row: unknown) => { inserted.push(row); return Promise.resolve({ error: null }) }

  const progressChain: Record<string, unknown> = {}
  progressChain.select = () => progressChain
  // user_topic_progress is queried with two chained .eq() calls; the second
  // one is the terminal (thenable) call that resolves with the rows.
  let eqCalls = 0
  progressChain.eq = () => {
    eqCalls += 1
    if (eqCalls >= 2) return Promise.resolve({ data: progress, error: null })
    return progressChain
  }

  return { usersChain, progressChain }
}

describe('checkAndApplyReinforcementReturn', () => {
  it('returns null when the user is not in reinforcement mode', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'A2', reinforcement_target_level: null }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when not all reinforcement-level topics are mastered', async () => {
    inserted = []
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: 'A2' },
      [{ topic_id: 'introductions', mastery_status: 'mastered' }], // only 1 of 8 A1 topics
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('promotes back to the target level once every reinforcement-level topic is mastered', async () => {
    inserted = []
    const a1TopicIds = ['introductions', 'family', 'numbers-dates', 'colors', 'daily-routine', 'food', 'greetings', 'home']
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: 'A2' },
      a1TopicIds.map((topic_id) => ({ topic_id, mastery_status: 'mastered' })),
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBe('A2')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'A1', to_level: 'A2', reason: 'reinforcement_auto_return',
    }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: FAIL — `checkAndApplyReinforcementReturn is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `lib/levels.ts`:

```ts
import { getTopicsForLevel } from '@/lib/topics'

export async function checkAndApplyReinforcementReturn(
  supabase: SupabaseClient,
  userId: string,
): Promise<CefrLevel | null> {
  const { data: userRow } = await supabase
    .from('users')
    .select('cefr_level, reinforcement_target_level')
    .eq('id', userId)
    .single()

  const cefrLevel = (userRow as { cefr_level?: CefrLevel | null } | null)?.cefr_level
  const reinforcementTargetLevel = (userRow as { reinforcement_target_level?: CefrLevel | null } | null)
    ?.reinforcement_target_level

  if (!cefrLevel || !reinforcementTargetLevel) return null

  const topics = getTopicsForLevel(cefrLevel)
  if (topics.length === 0) return null

  const { data: progressRows } = await supabase
    .from('user_topic_progress')
    .select('topic_id, mastery_status')
    .eq('user_id', userId)
    .eq('cefr_level', cefrLevel)

  const masteredTopicIds = new Set(
    ((progressRows ?? []) as { topic_id: string; mastery_status: string }[])
      .filter((r) => r.mastery_status === 'mastered')
      .map((r) => r.topic_id),
  )

  const allMastered = topics.every((t) => masteredTopicIds.has(t.key))
  if (!allMastered) return null

  await supabase.from('users').update({
    cefr_level: reinforcementTargetLevel,
    reinforcement_target_level: null,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId,
    from_level: cefrLevel,
    to_level: reinforcementTargetLevel,
    reason: 'reinforcement_auto_return',
  })

  return reinforcementTargetLevel
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/levels.ts __tests__/lib/levels.test.ts
git commit -m "feat: add reinforcement auto-return check"
```

---

## Task 6: Stop `/api/placement/complete` from writing `cefr_level`

**Files:**
- Modify: `app/api/placement/complete/route.ts:93-96`
- Test: `__tests__/app/api/placement/complete.test.ts`

**Interfaces:**
- Produces: same response shape as before (`{ result, plan }`) — the recommendation is now finalized by Task 7's new endpoint instead.

- [ ] **Step 1: Update the test to assert `cefr_level` is NOT written here**

Replace the mocked `createSupabaseServer` in `__tests__/app/api/placement/complete.test.ts` (it currently includes a generic `update`/`eq` mock used for the `users.cefr_level` write) and add an assertion that `users` is never updated:

```ts
// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'

const mockUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: table === 'users' ? mockUpdate : vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                cefr_level: 'A2',
                speaking_pct: 55,
                listening_pct: 60,
                grammar_pct: 45,
                vocabulary_pct: 65,
                pronunciation_pct: 40,
                confidence_pct: 50,
                biggest_difficulty: 'Pronúncia do TH',
                biggest_strength: 'Vocabulário básico',
                next_objective: 'Melhorar fluência ao falar',
                focus_areas: ['pronunciation', 'speaking'],
                plan_summary_pt: 'Em 30 dias, focamos em pronúncia e conversação.',
              }),
            },
          }],
        }),
      },
    }
  },
}))

import { POST } from '@/app/api/placement/complete/route'

describe('POST /api/placement/complete', () => {
  it('returns result and plan on success without writing users.cefr_level', async () => {
    const body = {
      answers: [
        { question_id: 'l1', phase: 'listening', transcript: 'My name is João', score: 0.8 },
        { question_id: 'p1', phase: 'pronunciation', transcript: 'think three through', score: 0.5 },
      ],
      goal: 'viagem',
    }
    const req = new Request('http://localhost/api/placement/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.result.cefr_level).toBe('A2')
    expect(json.result.speaking_pct).toBe(55)
    expect(json.plan.goal).toBe('viagem')
    expect(json.plan.focus_areas).toContain('pronunciation')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/placement/complete.test.ts`
Expected: FAIL — `mockUpdate` was called (the route still writes `users.cefr_level`)

- [ ] **Step 3: Remove the `cefr_level` write**

In `app/api/placement/complete/route.ts`, delete lines 93-94:

```ts
  const { error: userErr } = await supabase.from('users').update({ cefr_level: cefr }).eq('id', user.id)
  if (userErr) console.error('[placement/complete] Failed to update users.cefr_level:', userErr.message)

```

so the function goes directly from the `Promise.all` block to the `return NextResponse.json(...)` line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/placement/complete.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/placement/complete/route.ts __tests__/app/api/placement/complete.test.ts
git commit -m "refactor: placement/complete no longer writes cefr_level directly"
```

---

## Task 7: New `/api/placement/confirm-level` endpoint

**Files:**
- Create: `app/api/placement/confirm-level/route.ts`
- Test: `__tests__/app/api/placement/confirm-level.test.ts`

**Interfaces:**
- Consumes: `isAtOrBelow()` (Task 2).
- Produces: `POST` handler returning `{ level: CefrLevel }` on success — consumed by Task 8 (`PlacementDiagnosticReport`).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/api/placement/confirm-level.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }))
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'users') return { update: mockUpdate }
      if (table === 'level_history') return { insert: mockInsert }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from '@/app/api/placement/confirm-level/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/placement/confirm-level', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/placement/confirm-level', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ chosen_level: 'A2', recommended_level: 'A2' }))
    expect(res.status).toBe(401)
  })

  it('accepts the recommended level and records placement_recommended', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'B1', recommended_level: 'B1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('B1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cefr_level: 'B1' }))
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', from_level: null, to_level: 'B1', reason: 'placement_recommended',
    }))
  })

  it('accepts a level below the recommendation and records placement_chose_lower', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'A2', recommended_level: 'B1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('A2')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'placement_chose_lower' }))
  })

  it('rejects a chosen level above the recommendation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'B2', recommended_level: 'B1' }))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid CEFR code', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'Z9', recommended_level: 'B1' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/placement/confirm-level.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// app/api/placement/confirm-level/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { CEFR_ORDER, isAtOrBelow } from '@/lib/levels'
import type { CefrLevel } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chosen_level, recommended_level } = await request.json() as {
    chosen_level: string
    recommended_level: string
  }

  if (!CEFR_ORDER.includes(chosen_level as CefrLevel) || !CEFR_ORDER.includes(recommended_level as CefrLevel)) {
    return NextResponse.json({ error: 'Invalid CEFR level' }, { status: 400 })
  }

  const chosen = chosen_level as CefrLevel
  const recommended = recommended_level as CefrLevel

  if (!isAtOrBelow(chosen, recommended)) {
    return NextResponse.json({ error: 'Chosen level cannot exceed the recommendation' }, { status: 400 })
  }

  await supabase.from('users').update({
    cefr_level: chosen,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
    reinforcement_target_level: null,
  }).eq('id', user.id)

  await supabase.from('level_history').insert({
    user_id: user.id,
    from_level: null,
    to_level: chosen,
    reason: chosen === recommended ? 'placement_recommended' : 'placement_chose_lower',
  })

  return NextResponse.json({ level: chosen })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/placement/confirm-level.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/placement/confirm-level/route.ts __tests__/app/api/placement/confirm-level.test.ts
git commit -m "feat: add /api/placement/confirm-level endpoint"
```

---

## Task 8: `PlacementDiagnosticReport` — recommend-and-choose UI

**Files:**
- Modify: `components/placement/PlacementDiagnosticReport.tsx`
- Modify: `__tests__/components/placement/PlacementDiagnosticReport.test.tsx`

**Interfaces:**
- Consumes: `CEFR_ORDER` from `@/lib/levels` (Task 2), `POST /api/placement/confirm-level` (Task 7).
- Produces: same `onContinue: () => void` prop contract, now called only after the level choice is confirmed server-side.

- [ ] **Step 1: Rewrite the test file**

```tsx
// __tests__/components/placement/PlacementDiagnosticReport.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PlacementDiagnosticReport } from '@/components/placement/PlacementDiagnosticReport'
import type { PlacementResult, LearningPlan } from '@/types'

const mockResult: PlacementResult = {
  id: 'r1', user_id: 'u1',
  cefr_level: 'B1',
  speaking_pct: 68, listening_pct: 75, grammar_pct: 55,
  vocabulary_pct: 72, pronunciation_pct: 48, confidence_pct: 60,
  biggest_difficulty: 'Pronúncia do TH',
  biggest_strength: 'Vocabulário básico',
  next_objective: 'Melhorar fluência ao falar sobre rotinas',
  completed_at: '2026-07-06T00:00:00Z',
}

const mockPlan: LearningPlan = {
  id: 'p1', user_id: 'u1',
  goal: 'viagem',
  focus_areas: ['pronunciation', 'speaking'],
  plan_summary_pt: 'Em 30 dias, focamos em pronúncia e conversação para viagem.',
  cefr_at_creation: 'B1',
  created_at: '2026-07-06T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ level: 'B1' }) })
})

describe('PlacementDiagnosticReport', () => {
  it('shows overall CEFR level prominently', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('B1')).toBeInTheDocument()
  })

  it('shows all 5 skill percentages', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('68%')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
  })

  it('shows difficulty and strength', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('Pronúncia do TH')).toBeInTheDocument()
    expect(screen.getByText('Vocabulário básico')).toBeInTheDocument()
  })

  it('shows plan summary', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('Em 30 dias, focamos em pronúncia e conversação para viagem.')).toBeInTheDocument()
  })

  it('shows the estimated level headline', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText(/Seu nível estimado é/i)).toBeInTheDocument()
  })

  it('confirms the recommended level and calls onContinue', async () => {
    const onContinue = vi.fn()
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /começar no b1/i }))
    await waitFor(() => expect(onContinue).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/placement/confirm-level', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ chosen_level: 'B1', recommended_level: 'B1' }),
    }))
  })

  it('reveals lower-level options and never offers B1 or above', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    fireEvent.click(screen.getByText(/prefiro começar mais fácil/i))
    expect(screen.getByRole('button', { name: /começar no a1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /começar no a2/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /começar no b2/i })).not.toBeInTheDocument()
  })

  it('confirms a chosen lower level and calls onContinue', async () => {
    const onContinue = vi.fn()
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByText(/prefiro começar mais fácil/i))
    fireEvent.click(screen.getByRole('button', { name: /começar no a1/i }))
    await waitFor(() => expect(onContinue).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/placement/confirm-level', expect.objectContaining({
      body: JSON.stringify({ chosen_level: 'A1', recommended_level: 'B1' }),
    }))
  })

  it('does not offer the "começar mais fácil" option at A1', () => {
    render(<PlacementDiagnosticReport result={{ ...mockResult, cefr_level: 'A1' }} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.queryByText(/prefiro começar mais fácil/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/placement/PlacementDiagnosticReport.test.tsx`
Expected: FAIL — no "Seu nível estimado é" text, no `/começar no b1/i` button (current button says "Começar as aulas →")

- [ ] **Step 3: Rewrite the component**

```tsx
// components/placement/PlacementDiagnosticReport.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CEFR_ORDER } from '@/lib/levels'
import type { PlacementResult, LearningPlan, CefrLevel } from '@/types'

interface PlacementDiagnosticReportProps {
  result: PlacementResult
  plan: LearningPlan
  onContinue: () => void
}

const SKILL_LABELS: Array<{ key: keyof PlacementResult; label: string; emoji: string }> = [
  { key: 'speaking_pct',      label: 'Fala',        emoji: '🗣️' },
  { key: 'listening_pct',     label: 'Compreensão', emoji: '👂' },
  { key: 'grammar_pct',       label: 'Gramática',   emoji: '✏️' },
  { key: 'vocabulary_pct',    label: 'Vocabulário', emoji: '📚' },
  { key: 'pronunciation_pct', label: 'Pronúncia',   emoji: '🎤' },
]

function SkillBar({ pct, label, emoji }: { pct: number; label: string; emoji: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-light-secondary dark:text-content-dark-secondary">
          {emoji} {label}
        </span>
        <span className="font-bold text-content-light dark:text-content-dark">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-light-card dark:bg-surface-dark-card overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-brand-interactive"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
        />
      </div>
    </div>
  )
}

export function PlacementDiagnosticReport({ result, plan, onContinue }: PlacementDiagnosticReportProps) {
  const [showLower, setShowLower] = useState(false)
  const [confirming, setConfirming] = useState<CefrLevel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recommendedIdx = CEFR_ORDER.indexOf(result.cefr_level)
  const lowerLevels = CEFR_ORDER.slice(0, recommendedIdx)

  async function handleChoose(level: CefrLevel) {
    setConfirming(level)
    setError(null)
    try {
      const res = await fetch('/api/placement/confirm-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosen_level: level, recommended_level: result.cefr_level }),
      })
      if (!res.ok) {
        setError('Não foi possível salvar seu nível. Tente novamente.')
        setConfirming(null)
        return
      }
      onContinue()
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setConfirming(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 p-6"
    >
      <div className="text-center">
        <p className="text-4xl" aria-hidden>🎯</p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-3">
          Seu diagnóstico
        </h2>
        <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-interactive">
          <span className="text-2xl font-bold text-content-dark">{result.cefr_level}</span>
          <span className="text-sm text-content-dark opacity-80">nível geral</span>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-3">
        {SKILL_LABELS.map(({ key, label, emoji }) => (
          <SkillBar
            key={key}
            pct={result[key] as number}
            label={label}
            emoji={emoji}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Maior dificuldade
          </p>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {result.biggest_difficulty}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Maior facilidade
          </p>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {result.biggest_strength}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
          Seu plano personalizado
        </p>
        <p className="text-sm text-content-light dark:text-content-dark">{plan.plan_summary_pt}</p>
        <p className="text-xs text-brand-interactive mt-2 font-medium">
          Próximo objetivo: {result.next_objective}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Seu nível estimado é <span className="font-bold text-content-light dark:text-content-dark">{result.cefr_level}</span>.
        </p>

        <button
          onClick={() => handleChoose(result.cefr_level)}
          disabled={confirming !== null}
          className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-60"
          aria-label={`Começar no ${result.cefr_level}`}
        >
          {confirming === result.cefr_level ? 'Salvando...' : `Começar no ${result.cefr_level} →`}
        </button>

        {lowerLevels.length > 0 && !showLower && (
          <button
            onClick={() => setShowLower(true)}
            className="text-xs text-content-light-secondary dark:text-content-dark-secondary underline hover:opacity-70 transition-opacity self-center"
          >
            Prefiro começar mais fácil
          </button>
        )}

        {showLower && (
          <div className="flex flex-col gap-2">
            {lowerLevels.map((level) => (
              <button
                key={level}
                onClick={() => handleChoose(level)}
                disabled={confirming !== null}
                className="w-full py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark hover:border-brand-interactive transition-colors disabled:opacity-60"
                aria-label={`Começar no ${level}`}
              >
                {confirming === level ? 'Salvando...' : `Começar no ${level}`}
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500 text-center">{error}</p>}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/placement/PlacementDiagnosticReport.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add components/placement/PlacementDiagnosticReport.tsx __tests__/components/placement/PlacementDiagnosticReport.test.tsx
git commit -m "feat: let students accept the recommended level or choose lower"
```

---

## Task 9: `/api/level/downgrade` endpoint

**Files:**
- Create: `app/api/level/downgrade/route.ts`
- Test: `__tests__/app/api/level/downgrade.test.ts`

**Interfaces:**
- Consumes: `downgradeLevel()` (Task 3).
- Produces: `POST` handler returning `{ level: CefrLevel, reinforcement_target_level: CefrLevel }` — consumed by Tasks 12 and 13.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/api/level/downgrade.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}))

import { POST } from '@/app/api/level/downgrade/route'

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  chain.update = () => chain
  chain.insert = vi.fn().mockResolvedValue({ error: null })
  return chain
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/level/downgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/level/downgrade', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid reason', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ reason: 'placement_recommended' }))
    expect(res.status).toBe(400)
  })

  it('downgrades the user and returns the new level', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const usersChain = makeChain({ cefr_level: 'A2', reinforcement_target_level: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return usersChain
      if (table === 'level_history') return makeChain(null)
      throw new Error(`unexpected table ${table}`)
    })
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ level: 'A1', reinforcement_target_level: 'A2' })
  })

  it('returns 400 when already at the floor level A1', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const usersChain = makeChain({ cefr_level: 'A1', reinforcement_target_level: null })
    mockFrom.mockImplementation((table: string) => (table === 'users' ? usersChain : makeChain(null)))
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/level/downgrade.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// app/api/level/downgrade/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { downgradeLevel } from '@/lib/levels'
import type { CefrLevel } from '@/types'

const ALLOWED_REASONS = new Set(['manual_downgrade', 'confirmation_suggestion_accepted'])

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await request.json() as { reason: string }
  if (!ALLOWED_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const { data: userRow } = await supabase.from('users').select('cefr_level').eq('id', user.id).single()
  const currentLevel = (userRow as { cefr_level?: CefrLevel | null } | null)?.cefr_level
  if (!currentLevel) return NextResponse.json({ error: 'No current level set' }, { status: 400 })

  const result = await downgradeLevel(
    supabase,
    user.id,
    currentLevel,
    reason as 'manual_downgrade' | 'confirmation_suggestion_accepted',
  )
  if (!result) return NextResponse.json({ error: 'No lower level available' }, { status: 400 })

  return NextResponse.json({ level: result.newLevel, reinforcement_target_level: result.reinforcementTargetLevel })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/level/downgrade.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/level/downgrade/route.ts __tests__/app/api/level/downgrade.test.ts
git commit -m "feat: add /api/level/downgrade endpoint"
```

---

## Task 10: `/api/level/dismiss-suggestion` endpoint

**Files:**
- Create: `app/api/level/dismiss-suggestion/route.ts`
- Test: `__tests__/app/api/level/dismiss-suggestion.test.ts`

**Interfaces:**
- Produces: `POST` handler returning `{ ok: true }` — consumed by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/api/level/dismiss-suggestion.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  }),
}))

import { POST } from '@/app/api/level/dismiss-suggestion/route'

describe('POST /api/level/dismiss-suggestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(new Request('http://localhost/api/level/dismiss-suggestion', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('marks the suggestion dismissed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(new Request('http://localhost/api/level/dismiss-suggestion', { method: 'POST' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(mockUpdate).toHaveBeenCalledWith({ confirmation_suggestion_dismissed: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/level/dismiss-suggestion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// app/api/level/dismiss-suggestion/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('users').update({ confirmation_suggestion_dismissed: true }).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/level/dismiss-suggestion.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/level/dismiss-suggestion/route.ts __tests__/app/api/level/dismiss-suggestion.test.ts
git commit -m "feat: add /api/level/dismiss-suggestion endpoint"
```

---

## Task 11: Hook reinforcement auto-return into lesson assessment

**Files:**
- Modify: `app/api/session/[id]/assess/route.ts:1-13,145-176`
- Test: `__tests__/app/api/session/assess.test.ts`

**Interfaces:**
- Consumes: `checkAndApplyReinforcementReturn()` (Task 5).

- [ ] **Step 1: Add a failing test**

Append to `__tests__/app/api/session/assess.test.ts`, and add the mock for `@/lib/levels` near the top (after the existing `vi.mock('openai', ...)` block):

```ts
const mockCheckReinforcementReturn = vi.hoisted(() => vi.fn().mockResolvedValue(null))
vi.mock('@/lib/levels', () => ({
  checkAndApplyReinforcementReturn: mockCheckReinforcementReturn,
}))
```

Add a new test at the end of the `describe` block:

```ts
  it('checks for reinforcement auto-return after recording the assessment', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'travel', lesson_topic_id: 'travel' })
    const userChain = makeChain({ name: 'Maria', cefr_level: 'A1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'I went to Portugal last year.' },
      { role: 'assistant', text: 'That sounds amazing! Tell me more.' },
      { role: 'user', text: 'I visited Lisbon and Porto.' },
    ])
    const progressChain = makeChain(null)
    const assessmentsInsertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return assessmentsInsertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78,
            grammar: 72, confidence: 80, fluency: 74,
            feedback_pt: 'Você foi muito bem!', highlight_pt: 'Ótimo vocabulário.',
          }),
        },
      }],
    })

    await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )

    expect(mockCheckReinforcementReturn).toHaveBeenCalledWith(expect.anything(), 'u1')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: FAIL — `mockCheckReinforcementReturn` was not called

- [ ] **Step 3: Wire the call into the route**

In `app/api/session/[id]/assess/route.ts`, add the import alongside the existing `@/lib/mastery` import:

```ts
import { checkAndApplyReinforcementReturn } from '@/lib/levels'
```

Then, immediately after the existing `Promise.all([...])` block that inserts `topic_assessments` and upserts `user_topic_progress` (right after the `if (progressErr) ...` line, before `return NextResponse.json(...)`), add:

```ts
  await checkAndApplyReinforcementReturn(supabase, user.id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/session/\[id\]/assess/route.ts __tests__/app/api/session/assess.test.ts
git commit -m "feat: check reinforcement auto-return after each lesson assessment"
```

---

## Task 12: Dashboard confirmation-suggestion card

**Files:**
- Create: `components/dashboard/LevelSuggestionCard.tsx`
- Test: `__tests__/components/dashboard/LevelSuggestionCard.test.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `shouldSuggestDowngrade()`, `levelBelow()` (Tasks 2, 4); `POST /api/level/downgrade`, `POST /api/level/dismiss-suggestion` (Tasks 9, 10).
- Produces: `LevelSuggestionCard({ currentLevel: CefrLevel; lowerLevel: CefrLevel })`.

- [ ] **Step 1: Write the failing component test**

```tsx
// __tests__/components/dashboard/LevelSuggestionCard.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { LevelSuggestionCard } from '@/components/dashboard/LevelSuggestionCard'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('LevelSuggestionCard', () => {
  it('shows the suggestion message with both levels', () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    expect(screen.getByText(/A2.*desafiador/i)).toBeInTheDocument()
  })

  it('accepting calls the downgrade endpoint and refreshes', async () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    fireEvent.click(screen.getByRole('button', { name: /revisar a1/i }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/level/downgrade', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'confirmation_suggestion_accepted' }),
    }))
  })

  it('dismissing calls the dismiss endpoint and hides the card', async () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    fireEvent.click(screen.getByRole('button', { name: /continuar no a2/i }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/level/dismiss-suggestion', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.queryByText(/A2.*desafiador/i)).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/dashboard/LevelSuggestionCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// components/dashboard/LevelSuggestionCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CefrLevel } from '@/types'

interface Props {
  currentLevel: CefrLevel
  lowerLevel: CefrLevel
}

export function LevelSuggestionCard({ currentLevel, lowerLevel }: Props) {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState<'accept' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading('accept')
    setError(null)
    try {
      const res = await fetch('/api/level/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'confirmation_suggestion_accepted' }),
      })
      if (!res.ok) { setError('Não foi possível revisar o nível. Tente novamente.'); return }
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleDismiss() {
    setLoading('dismiss')
    setError(null)
    try {
      const res = await fetch('/api/level/dismiss-suggestion', { method: 'POST' })
      if (!res.ok) { setError('Não foi possível salvar. Tente novamente.'); return }
      setHidden(true)
    } finally {
      setLoading(null)
    }
  }

  if (hidden) return null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-brand-interactive/30 flex flex-col gap-3">
      <p className="text-sm font-semibold text-content-light dark:text-content-dark">
        Notamos que o {currentLevel} está sendo desafiador. Quer revisar o {lowerLevel} antes de continuar?
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={loading !== null}
          className="flex-1 py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading === 'accept' ? 'Revisando...' : `Revisar ${lowerLevel}`}
        </button>
        <button
          onClick={handleDismiss}
          disabled={loading !== null}
          className="flex-1 py-2.5 rounded-lg border border-surface-light-card dark:border-surface-dark-card text-sm text-content-light dark:text-content-dark hover:opacity-70 transition-opacity disabled:opacity-60"
        >
          {loading === 'dismiss' ? 'Salvando...' : `Continuar no ${currentLevel}`}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/dashboard/LevelSuggestionCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into the dashboard**

In `app/dashboard/page.tsx`, add imports near the top:

```ts
import { LevelSuggestionCard } from '@/components/dashboard/LevelSuggestionCard'
import { levelBelow, shouldSuggestDowngrade } from '@/lib/levels'
```

After the existing block that computes `completedLessons` (right before the `return (` that starts the JSX), add:

```ts
  let suggestDowngrade = false
  let lowerLevel: ReturnType<typeof levelBelow> = null
  if (u.cefr_level && !u.confirmation_suggestion_dismissed) {
    lowerLevel = levelBelow(u.cefr_level)
    if (lowerLevel) {
      const { data: windowAssessments } = await supabase
        .from('topic_assessments')
        .select('passed')
        .eq('user_id', authUser.id)
        .gte('created_at', u.level_confirmed_at ?? new Date(0).toISOString())
        .order('created_at', { ascending: true })
        .limit(5)
      const passedFlags = (windowAssessments ?? []).map((r: { passed: boolean }) => r.passed)
      suggestDowngrade = shouldSuggestDowngrade(passedFlags)
    }
  }
```

Then, in the JSX, add the card right after the `<MissionCounterBadge ... />` line and before `{vipUser && <VipBadge ... />}`:

```tsx
        {suggestDowngrade && lowerLevel && (
          <LevelSuggestionCard currentLevel={u.cefr_level!} lowerLevel={lowerLevel} />
        )}
```

- [ ] **Step 6: Manually verify the dashboard still renders**

Run: `npm run dev`, sign in as a test user with `cefr_level` set, visit `/dashboard`.
Expected: page loads with no console errors; card does not appear (no `topic_assessments` rows yet, or `confirmation_suggestion_dismissed`/`level_confirmed_at` not set up for this window).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/LevelSuggestionCard.tsx __tests__/components/dashboard/LevelSuggestionCard.test.tsx app/dashboard/page.tsx
git commit -m "feat: surface the confirmation-window downgrade suggestion on the dashboard"
```

---

## Task 13: Profile "Nível" card — manual downgrade + reinforcement display

**Files:**
- Create: `components/perfil/LevelCard.tsx`
- Test: `__tests__/components/perfil/LevelCard.test.tsx`
- Modify: `app/perfil/page.tsx:11-17,73-82`

**Interfaces:**
- Consumes: `levelBelow()` (Task 2); `POST /api/level/downgrade` (Task 9).
- Produces: `LevelCard({ cefrLevel: CefrLevel; reinforcementTargetLevel: CefrLevel | null })`.

- [ ] **Step 1: Write the failing component test**

```tsx
// __tests__/components/perfil/LevelCard.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { LevelCard } from '@/components/perfil/LevelCard'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('LevelCard', () => {
  it('shows the current level when not in reinforcement mode', () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    expect(screen.getByText(/B1 – Intermediário/)).toBeInTheDocument()
    expect(screen.queryByText(/Reforçando/i)).not.toBeInTheDocument()
  })

  it('shows the target level and reinforcement line while reinforcing', () => {
    render(<LevelCard cefrLevel="A1" reinforcementTargetLevel="A2" />)
    expect(screen.getByText(/A2 – Básico/)).toBeInTheDocument()
    expect(screen.getByText(/Reforçando conteúdos do A1/i)).toBeInTheDocument()
  })

  it('hides the downgrade option at A1 with no reinforcement in progress', () => {
    render(<LevelCard cefrLevel="A1" reinforcementTargetLevel={null} />)
    expect(screen.queryByText(/estudar um nível abaixo/i)).not.toBeInTheDocument()
  })

  it('opens a confirmation before downgrading, and calls the endpoint on confirm', async () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    fireEvent.click(screen.getByText(/estudar um nível abaixo/i))
    expect(screen.getByText(/progresso será mantido/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirmar a2/i }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/level/downgrade', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'manual_downgrade' }),
    }))
  })

  it('cancels the confirmation without calling the endpoint', () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    fireEvent.click(screen.getByText(/estudar um nível abaixo/i))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByText(/progresso será mantido/i)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/perfil/LevelCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// components/perfil/LevelCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { levelBelow } from '@/lib/levels'
import type { CefrLevel } from '@/types'

const LEVEL_LABELS: Record<CefrLevel, string> = {
  A1: 'A1 – Iniciante',
  A2: 'A2 – Básico',
  B1: 'B1 – Intermediário',
  B2: 'B2 – Intermediário avançado',
  C1: 'C1 – Avançado',
  C2: 'C2 – Proficiente',
}

interface Props {
  cefrLevel: CefrLevel
  reinforcementTargetLevel: CefrLevel | null
}

export function LevelCard({ cefrLevel, reinforcementTargetLevel }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayLevel = reinforcementTargetLevel ?? cefrLevel
  const lower = levelBelow(cefrLevel)

  async function handleConfirmDowngrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/level/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_downgrade' }),
      })
      if (!res.ok) { setError('Não foi possível mudar de nível. Tente novamente.'); return }
      setConfirming(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-2">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">Seu nível atual</p>
      <p className="font-semibold text-content-light dark:text-content-dark">{LEVEL_LABELS[displayLevel]}</p>

      {reinforcementTargetLevel && (
        <p className="text-xs text-brand-interactive">
          Modo de estudo: Reforçando conteúdos do {cefrLevel}
        </p>
      )}

      {lower && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="mt-2 text-xs text-content-light-secondary dark:text-content-dark-secondary underline hover:opacity-70 transition-opacity self-start"
        >
          Estudar um nível abaixo
        </button>
      )}

      {lower && confirming && (
        <div className="mt-2 p-3 rounded-lg bg-surface-light dark:bg-surface-dark flex flex-col gap-2">
          <p className="text-xs text-content-light dark:text-content-dark">
            Seu progresso será mantido — você vai reforçar o {lower} antes de voltar ao {cefrLevel}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmDowngrade}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-brand-cta text-content-dark font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? 'Salvando...' : `Confirmar ${lower}`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-surface-light-card dark:border-surface-dark-card text-xs text-content-light dark:text-content-dark hover:opacity-70 transition-opacity"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/perfil/LevelCard.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire into the profile page**

In `app/perfil/page.tsx`, change the `users` select (currently `'name, cefr_level, streak_days, created_at'`) to include the new column:

```ts
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level, streak_days, created_at, reinforcement_target_level')
    .eq('id', user.id)
    .single()
```

Add the import near the top (the component lives in `components/perfil/LevelCard.tsx`, not colocated with the page, so it's imported via the `@/` alias rather than a relative path):

```ts
import { LevelCard } from '@/components/perfil/LevelCard'
```

Delete the existing `LEVEL_LABELS` constant and the "Level info" block (lines with `{/* Level info */}` through its closing `</div>`):

```tsx
        {/* Level info */}
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">Seu nível atual</p>
          <p className="font-semibold text-content-light dark:text-content-dark">
            {LEVEL_LABELS[userData.cefr_level ?? ''] ?? userData.cefr_level ?? '—'}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
            Membro desde {memberSince}
          </p>
        </div>
```

Replace it with:

```tsx
        {/* Level */}
        {userData.cefr_level && (
          <LevelCard
            cefrLevel={userData.cefr_level}
            reinforcementTargetLevel={userData.reinforcement_target_level ?? null}
          />
        )}
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary -mt-4">
          Membro desde {memberSince}
        </p>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — `userData.cefr_level` and `userData.reinforcement_target_level` both come from the Supabase `select()` above and match `CefrLevel | null`.

- [ ] **Step 7: Manually verify the profile page**

Run: `npm run dev`, sign in, visit `/perfil`.
Expected: "Seu nível atual" card renders with the level, a working "Estudar um nível abaixo" button that shows a confirm/cancel step, and (for a test user with `reinforcement_target_level` set directly in the DB) the "Modo de estudo: Reforçando..." line appears.

- [ ] **Step 8: Commit**

```bash
git add components/perfil/LevelCard.tsx __tests__/components/perfil/LevelCard.test.tsx app/perfil/page.tsx
git commit -m "feat: add manual level downgrade and reinforcement-mode display to profile"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Manual end-to-end pass per the design spec's Testing section: take the placement test, choose a lower level, deliberately fail lessons to trigger the dashboard suggestion, accept it, confirm the profile shows "Reforçando conteúdos do X", complete all topics of the lower level, confirm auto-return and that the 5-lesson window reopens at the recovered level.
