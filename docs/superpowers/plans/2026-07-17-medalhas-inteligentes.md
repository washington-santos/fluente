# Medalhas Inteligentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a permanent, per-user achievement system ("medalhas") covering constância (streaks, missions) and domínio (topic mastery, level-ups, pronunciation, perfect scores), surfaced immediately in the post-session report and browsable on a new `/dashboard/medalhas` gallery page.

**Architecture:** A new `user_badges` table stores permanently-earned medals (never revoked even if the underlying stat later changes). A static catalog (`lib/badges.ts`'s `BADGE_DEFINITIONS`) defines the 10 v1 medals as metadata; `checkAndAwardBadges(supabase, userId)` evaluates all 10 criteria against fresh DB state and does one idempotent batched `upsert(..., { ignoreDuplicates: true }).select()`, returning only the keys actually inserted by that call. This function is idempotent by construction (via the table's `UNIQUE (user_id, badge_key)` constraint), so it's called from both `/api/session/[id]/assess` and `/api/session/[id]/report` — the two routes that already fire in parallel at session end — without any coordination between them. Newly-awarded keys flow from both API responses into `AulaClient`'s `reportData`, rendered as a highlight in the existing `SessionReport` modal. A small shared `BadgeIcon` component maps each medal's `icon` string to a `lucide-react` component, reused by both `SessionReport` and the new gallery page.

**Tech Stack:** Next.js App Router (server components + one client component), TypeScript, Supabase, Vitest + Testing Library.

**Design spec:** `docs/superpowers/specs/2026-07-17-medalhas-inteligentes-design.md`

## Global Constraints

- Exactly 10 medals for v1 — no more, no fewer. See the catalog table in Task 1.
- Medals are permanent once earned — `user_badges` rows are never deleted or updated by application code, only inserted.
- `checkAndAwardBadges` must never throw — every failure path (a query rejecting, the upsert erroring) is caught, logged with `console.error`, and resolves to `[]`. It must never fail the `/assess` or `/report` response it's called from.
- No admin UI for managing the catalog — `BADGE_DEFINITIONS` is a static array in code.
- No push notifications or emails — the only "in the moment" surface is the existing `SessionReport` modal.
- No new test file for `app/dashboard/medalhas/page.tsx` — matches the established precedent that server-component dashboard pages in this codebase are not directly tested.
- `app/api/session/[id]/report/route.ts` currently has zero test coverage (no `__tests__/app/api/session/report.test.ts` exists) — this plan does not introduce one; the badge-granting call added there is covered indirectly by `lib/badges.test.ts`'s unit tests of `checkAndAwardBadges` itself, consistent with the route already having no test file to extend.
- No database changes beyond the one new `user_badges` table. No feature flag.

---

## Task 1: `user_badges` migration + `lib/badges.ts` (catalog + `checkAndAwardBadges`)

**Files:**
- Create: `supabase/migrations/20260717000001_user_badges.sql`
- Create: `lib/badges.ts`
- Test: `__tests__/lib/badges.test.ts`

**Interfaces:**
- Produces: `BadgeKey` (union type), `BadgeDefinition` interface, `BADGE_DEFINITIONS: BadgeDefinition[]`, `checkAndAwardBadges(supabase: SupabaseClient, userId: string): Promise<BadgeKey[]>` — consumed by Task 3 (`/assess` and `/report` routes), Task 4 (`SessionReport`), Task 6 (`/dashboard/medalhas`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260717000001_user_badges.sql
-- Permanent per-user achievement records ("medalhas"). Never updated or
-- deleted by app code — a badge is a historical fact, not a live gauge.
CREATE TABLE IF NOT EXISTS user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key  text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges_self" ON user_badges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

This migration is applied to the live Supabase project as part of the plan's Final Check section below — it is not applied automatically by any task.

- [ ] **Step 2: Write the failing tests**

```typescript
// __tests__/lib/badges.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAndAwardBadges, BADGE_DEFINITIONS } from '@/lib/badges'

// Thenable chain: every method returns the chain itself so calls can be
// chained in any order, and awaiting the chain at any point resolves to
// the fixed `result` — mirrors how the real supabase-js query builder
// resolves without a dedicated terminal method for count/head queries.
function makeChain(result: { data?: unknown; count?: number | null; error?: unknown } = {}) {
  const resolved = { data: null, count: null, error: null, ...result }
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolved)),
    upsert: vi.fn(() => chain),
    then: (onFulfilled: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(onFulfilled),
  }
  return chain
}

describe('BADGE_DEFINITIONS', () => {
  it('has exactly 10 medals', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(10)
  })
})

describe('checkAndAwardBadges', () => {
  let mockFrom: ReturnType<typeof vi.fn>
  let chains: Record<string, ReturnType<typeof makeChain>>

  beforeEach(() => {
    chains = {
      sessions: makeChain({ count: 0 }),
      users: makeChain({ data: { streak_days: 0, missions_completed_count: 0 } }),
      user_topic_progress: makeChain({ count: 0 }),
      level_history: makeChain({ count: 0 }),
      topic_assessments: makeChain({ data: [] }),
      user_badges: makeChain({ data: [] }),
    }
    mockFrom = vi.fn((table: string) => chains[table] ?? makeChain({}))
  })

  const supabase = () => ({ from: mockFrom }) as never

  it('returns an empty array when no criteria are met, and never touches user_badges', async () => {
    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalledWith('user_badges')
  })

  it('awards primeira_conversa when the user has at least one session with duration_seconds > 0', async () => {
    chains.sessions = makeChain({ count: 1 })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))
    chains.user_badges = makeChain({ data: [{ badge_key: 'primeira_conversa' }] })

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['primeira_conversa'])
    expect(chains.user_badges.upsert).toHaveBeenCalledWith(
      [{ user_id: 'u1', badge_key: 'primeira_conversa' }],
      { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
    )
  })

  it('awards both sequencia_3 and sequencia_7 (but not sequencia_30) when streak_days is 10', async () => {
    chains.users = makeChain({ data: { streak_days: 10, missions_completed_count: 0 } })
    chains.user_badges = makeChain({ data: [{ badge_key: 'sequencia_3' }, { badge_key: 'sequencia_7' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result.sort()).toEqual(['sequencia_3', 'sequencia_7'])
  })

  it('awards primeiro_topico_dominado but not cinco_topicos_dominados when 2 topics are mastered', async () => {
    chains.user_topic_progress = makeChain({ count: 2 })
    chains.user_badges = makeChain({ data: [{ badge_key: 'primeiro_topico_dominado' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['primeiro_topico_dominado'])
  })

  it('awards subiu_de_nivel when level_history has an auto_promotion row', async () => {
    chains.level_history = makeChain({ count: 1 })
    chains.user_badges = makeChain({ data: [{ badge_key: 'subiu_de_nivel' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['subiu_de_nivel'])
  })

  it('awards pronuncia_afiada and perfeccionista independently based on topic_assessments rows', async () => {
    chains.topic_assessments = makeChain({
      data: [
        { pronunciation: 92, final_score: 70 },
        { pronunciation: 60, final_score: 60 },
      ],
    })
    chains.user_badges = makeChain({ data: [{ badge_key: 'pronuncia_afiada' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['pronuncia_afiada'])
  })

  it('awards dez_missoes when missions_completed_count is at least 10', async () => {
    chains.users = makeChain({ data: { streak_days: 0, missions_completed_count: 10 } })
    chains.user_badges = makeChain({ data: [{ badge_key: 'dez_missoes' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['dez_missoes'])
  })

  it('is idempotent: a badge already earned is not returned again even if its criterion is still met', async () => {
    chains.sessions = makeChain({ count: 1 })
    // Simulates ignoreDuplicates: the row conflicted, so RETURNING is empty.
    chains.user_badges = makeChain({ data: [] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
  })

  it('resolves to [] and logs, rather than throwing, when a query promise rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return { select: () => ({ eq: () => ({ gt: () => Promise.reject(new Error('network error')) }) }) }
      }
      return chains[table] ?? makeChain({})
    })

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('resolves to [] and logs when the user_badges upsert itself errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    chains.sessions = makeChain({ count: 1 })
    chains.user_badges = makeChain({ data: null, error: { message: 'insert failed' } })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/badges.test.ts`
Expected: FAIL — `@/lib/badges` module not found

- [ ] **Step 4: Write the implementation**

```typescript
// lib/badges.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type BadgeKey =
  | 'primeira_conversa'
  | 'sequencia_3'
  | 'sequencia_7'
  | 'sequencia_30'
  | 'primeiro_topico_dominado'
  | 'cinco_topicos_dominados'
  | 'subiu_de_nivel'
  | 'pronuncia_afiada'
  | 'perfeccionista'
  | 'dez_missoes'

export interface BadgeDefinition {
  key: BadgeKey
  title_pt: string
  description_pt: string
  icon: string // lucide-react icon name, looked up by components/dashboard/BadgeIcon.tsx
  category: 'constancia' | 'dominio'
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: 'primeira_conversa', title_pt: 'Primeira conversa', description_pt: 'Complete sua primeira sessão de prática.', icon: 'MessageCircle', category: 'constancia' },
  { key: 'sequencia_3', title_pt: 'Sequência de 3 dias', description_pt: 'Pratique 3 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'sequencia_7', title_pt: 'Sequência de 7 dias', description_pt: 'Pratique 7 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'sequencia_30', title_pt: 'Sequência de 30 dias', description_pt: 'Pratique 30 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'primeiro_topico_dominado', title_pt: 'Primeiro tópico dominado', description_pt: 'Domine seu primeiro tópico.', icon: 'BookOpen', category: 'dominio' },
  { key: 'cinco_topicos_dominados', title_pt: '5 tópicos dominados', description_pt: 'Domine 5 tópicos.', icon: 'Trophy', category: 'dominio' },
  { key: 'subiu_de_nivel', title_pt: 'Subiu de nível', description_pt: 'Avance para um novo nível CEFR.', icon: 'ArrowUpCircle', category: 'dominio' },
  { key: 'pronuncia_afiada', title_pt: 'Pronúncia afiada', description_pt: 'Alcance 90%+ em pronúncia em uma avaliação.', icon: 'Mic', category: 'dominio' },
  { key: 'perfeccionista', title_pt: 'Perfeccionista', description_pt: 'Alcance 95%+ de nota final em uma avaliação.', icon: 'Sparkles', category: 'dominio' },
  { key: 'dez_missoes', title_pt: '10 missões cumpridas', description_pt: 'Complete 10 missões do dia.', icon: 'CheckCircle2', category: 'constancia' },
]

export async function checkAndAwardBadges(
  supabase: SupabaseClient,
  userId: string,
): Promise<BadgeKey[]> {
  try {
    const [
      { count: sessionCount },
      { data: userRow },
      { count: masteredCount },
      { count: levelUpCount },
      { data: assessmentRows },
    ] = await Promise.all([
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('duration_seconds', 0),
      supabase.from('users').select('streak_days, missions_completed_count').eq('id', userId).single(),
      supabase.from('user_topic_progress').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('mastery_status', 'mastered'),
      supabase.from('level_history').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('reason', 'auto_promotion'),
      supabase.from('topic_assessments').select('pronunciation, final_score').eq('user_id', userId),
    ])

    const streakDays = (userRow as { streak_days?: number } | null)?.streak_days ?? 0
    const missionsCompleted = (userRow as { missions_completed_count?: number } | null)?.missions_completed_count ?? 0
    const rows = (assessmentRows ?? []) as Array<{ pronunciation: number; final_score: number }>

    const metCriteria: BadgeKey[] = []
    if ((sessionCount ?? 0) >= 1) metCriteria.push('primeira_conversa')
    if (streakDays >= 3) metCriteria.push('sequencia_3')
    if (streakDays >= 7) metCriteria.push('sequencia_7')
    if (streakDays >= 30) metCriteria.push('sequencia_30')
    if ((masteredCount ?? 0) >= 1) metCriteria.push('primeiro_topico_dominado')
    if ((masteredCount ?? 0) >= 5) metCriteria.push('cinco_topicos_dominados')
    if ((levelUpCount ?? 0) >= 1) metCriteria.push('subiu_de_nivel')
    if (rows.some(r => r.pronunciation >= 90)) metCriteria.push('pronuncia_afiada')
    if (rows.some(r => r.final_score >= 95)) metCriteria.push('perfeccionista')
    if (missionsCompleted >= 10) metCriteria.push('dez_missoes')

    if (metCriteria.length === 0) return []

    const { data: inserted, error } = await supabase
      .from('user_badges')
      .upsert(
        metCriteria.map(key => ({ user_id: userId, badge_key: key })),
        { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
      )
      .select('badge_key')

    if (error) {
      console.error('user_badges upsert failed:', error.message)
      return []
    }

    return ((inserted ?? []) as Array<{ badge_key: BadgeKey }>).map(row => row.badge_key)
  } catch (err) {
    console.error('checkAndAwardBadges failed:', err)
    return []
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/badges.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260717000001_user_badges.sql lib/badges.ts __tests__/lib/badges.test.ts
git commit -m "feat: add user_badges table and checkAndAwardBadges, an idempotent badge-granting evaluator"
```

---

## Task 2: `BadgeIcon` — shared icon lookup component

**Files:**
- Create: `components/dashboard/BadgeIcon.tsx`
- Test: `__tests__/components/dashboard/BadgeIcon.test.tsx`

**Interfaces:**
- Consumes: `BadgeDefinition['icon']` string values from Task 1's `BADGE_DEFINITIONS` (`'MessageCircle' | 'Flame' | 'BookOpen' | 'Trophy' | 'ArrowUpCircle' | 'Mic' | 'Sparkles' | 'CheckCircle2'`).
- Produces: `BadgeIcon` component, `{ icon: string; size?: number; className?: string }` — consumed by Task 4 (`SessionReport`) and Task 6 (`/dashboard/medalhas`).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/dashboard/BadgeIcon.test.tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BadgeIcon } from '@/components/dashboard/BadgeIcon'

describe('BadgeIcon', () => {
  it('renders the matching lucide icon for a known name', () => {
    const { container } = render(<BadgeIcon icon="Flame" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('falls back to a default icon (still an svg) for an unknown name', () => {
    const { container } = render(<BadgeIcon icon="NotARealIcon" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/dashboard/BadgeIcon.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// components/dashboard/BadgeIcon.tsx
import { MessageCircle, Flame, BookOpen, Trophy, ArrowUpCircle, Mic, Sparkles, CheckCircle2, Award, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  MessageCircle, Flame, BookOpen, Trophy, ArrowUpCircle, Mic, Sparkles, CheckCircle2,
}

interface BadgeIconProps {
  icon: string
  size?: number
  className?: string
}

export function BadgeIcon({ icon, size = 20, className }: BadgeIconProps) {
  const Icon = ICONS[icon] ?? Award
  return <Icon size={size} className={className} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/dashboard/BadgeIcon.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/BadgeIcon.tsx __tests__/components/dashboard/BadgeIcon.test.tsx
git commit -m "feat: add BadgeIcon, a shared lucide-icon lookup for badge_key metadata"
```

---

## Task 3: Wire `checkAndAwardBadges` into the two session-end routes

**Files:**
- Modify: `app/api/session/[id]/assess/route.ts`
- Modify: `app/api/session/[id]/report/route.ts`
- Modify: `__tests__/app/api/session/assess.test.ts`

**Interfaces:**
- Consumes: `checkAndAwardBadges` (Task 1).
- Produces: both routes' JSON responses gain `newly_awarded_badges: BadgeKey[]` — consumed by Task 5 (`AulaClient.tsx`).

- [ ] **Step 1: Add the failing test case to `assess.test.ts`**

Open `__tests__/app/api/session/assess.test.ts`. Add this import alongside the existing `@/lib/levels` mock (near the top of the file, after the existing `vi.mock('@/lib/levels', ...)` block):

```typescript
const mockCheckAndAwardBadges = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('@/lib/badges', () => ({
  checkAndAwardBadges: mockCheckAndAwardBadges,
}))
```

Then add this test case at the end of the file's `describe('POST /api/session/[id]/assess', ...)` block (find the closing `})` of that describe and insert before it):

```typescript
  it('includes newly_awarded_badges from checkAndAwardBadges in the response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAndAwardBadges.mockResolvedValueOnce(['primeira_conversa'])

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'b1-hobby', lesson_topic_id: 'b1-hobby' })
    const userChain = makeChain({ name: 'Ana', cefr_level: 'B1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'How are you' }, { role: 'assistant', text: 'Good' },
      { role: 'user', text: 'Great' },
    ])
    const progressChain = makeChain(null)
    const insertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return insertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78, grammar: 72, confidence: 80, fluency: 74,
        feedback_pt: 'Muito bem!', highlight_pt: 'Ótimo!',
      }) } }],
    })

    const res = await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )
    const body = await res.json()

    expect(mockCheckAndAwardBadges).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(body.newly_awarded_badges).toEqual(['primeira_conversa'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: FAIL — `newly_awarded_badges` is `undefined` in the response body

- [ ] **Step 3: Wire the call into `assess/route.ts`**

Add the import at the top of `app/api/session/[id]/assess/route.ts`, alongside the existing `@/lib/levels` import:

```typescript
import { checkAndApplyReinforcementReturn, checkAndApplyLevelPromotion } from '@/lib/levels'
import { checkAndAwardBadges } from '@/lib/badges'
```

Then, right after the existing `const promotedTo = await checkAndApplyLevelPromotion(supabase, user.id)` line, add:

```typescript
  const newlyAwardedBadges = await checkAndAwardBadges(supabase, user.id)
```

And add the field to the final `NextResponse.json({...})` call, alongside the existing `level_promotion` field:

```typescript
    level_promotion: promotedTo ? { from: cefrLevel, to: promotedTo } : null,
    newly_awarded_badges: newlyAwardedBadges,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: PASS (all pre-existing tests plus the new one)

- [ ] **Step 5: Wire the call into `report/route.ts`**

Add the import at the top of `app/api/session/[id]/report/route.ts`:

```typescript
import { checkAndAwardBadges } from '@/lib/badges'
```

Right before the final `return NextResponse.json({...})`, add:

```typescript
  const newlyAwardedBadges = await checkAndAwardBadges(supabase, user.id)
```

And add the field to the returned object, alongside the existing `missionTitle` field:

```typescript
  return NextResponse.json({
    userMessages,
    corrections,
    pronunciationHints,
    durationSeconds: session.duration_seconds ?? 0,
    missionCompleted,
    missionTitle: mission.titlePt,
    newlyAwardedBadges,
  })
```

Note the field is named `newlyAwardedBadges` (camelCase) here, matching this route's existing camelCase response convention (`missionCompleted`, `missionTitle`, `durationSeconds`) — unlike `assess/route.ts`, which uses `snake_case` throughout its response (`final_score`, `level_promotion`). Task 5 reads both field names accordingly.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Run the full suite**

Run: `npm run test:run`
Expected: PASS — no regressions. `report/route.ts` has no dedicated test file (per Global Constraints), so this step is a regression check for that file's change, not a check for new passing tests on it.

- [ ] **Step 8: Commit**

```bash
git add app/api/session/[id]/assess/route.ts app/api/session/[id]/report/route.ts __tests__/app/api/session/assess.test.ts
git commit -m "feat: grant badges at the end of both session-end routes"
```

---

## Task 4: `SessionReport` — newly-awarded-badges highlight

**Files:**
- Modify: `components/aula/SessionReport.tsx`
- Modify: `__tests__/components/aula/SessionReport.test.tsx`

**Interfaces:**
- Consumes: `BadgeKey`, `BADGE_DEFINITIONS` (Task 1), `BadgeIcon` (Task 2).
- Produces: `SessionReport` gains a new prop `newlyAwardedBadges?: BadgeKey[]` — consumed by Task 5 (`AulaClient.tsx`).

- [ ] **Step 1: Write the failing test**

`__tests__/components/aula/SessionReport.test.tsx` already has a shared `defaultProps` object at the top of the file (used by every existing test case as `<SessionReport {...defaultProps} .../>`). Add these two test cases at the end of the file's `describe('SessionReport', ...)` block, right after the existing `'does not show the level promotion banner when levelPromotion is absent'` case:

```tsx
  it('shows a highlight for each newly awarded badge', () => {
    render(
      <SessionReport
        {...defaultProps}
        newlyAwardedBadges={['primeira_conversa', 'sequencia_3']}
      />,
    )
    expect(screen.getByText('Primeira conversa')).toBeInTheDocument()
    expect(screen.getByText('Sequência de 3 dias')).toBeInTheDocument()
  })

  it('renders no badge highlight section when newlyAwardedBadges is empty or omitted', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.queryByText(/nova medalha/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/aula/SessionReport.test.tsx`
Expected: FAIL — badge titles not found in the rendered output

- [ ] **Step 3: Add the prop and rendering**

In `components/aula/SessionReport.tsx`, add the import:

```typescript
import { BADGE_DEFINITIONS, type BadgeKey } from '@/lib/badges'
import { BadgeIcon } from '@/components/dashboard/BadgeIcon'
```

Add `newlyAwardedBadges` to the `SessionReportProps` interface:

```typescript
interface SessionReportProps {
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
  assessment?: AssessmentData | null
  levelPromotion?: { from: CefrLevel; to: CefrLevel } | null
  newlyAwardedBadges?: BadgeKey[]
  onClose: () => void
}
```

Add it to the destructured props in the `SessionReport` function signature:

```typescript
export function SessionReport({
  userMessages,
  corrections,
  pronunciationHints,
  durationSeconds,
  missionCompleted,
  missionTitle,
  assessment,
  levelPromotion,
  newlyAwardedBadges,
  onClose,
}: SessionReportProps) {
```

Add the rendering block right after the existing `levelPromotion` banner block (after its closing `)}` , before the `<div className="flex items-center justify-between">` that renders "Resumo da aula"):

```tsx
        {newlyAwardedBadges && newlyAwardedBadges.length > 0 && (
          <div className="rounded-xl p-4 bg-gradient-to-r from-amber-400 to-amber-500 flex flex-col gap-2">
            <p className="text-sm font-black text-white text-center">🏅 Nova medalha!</p>
            {newlyAwardedBadges.map(key => {
              const badge = BADGE_DEFINITIONS.find(b => b.key === key)
              if (!badge) return null
              return (
                <div key={key} className="flex items-center gap-2 justify-center">
                  <BadgeIcon icon={badge.icon} size={18} className="text-white" />
                  <span className="text-sm font-semibold text-white">{badge.title_pt}</span>
                </div>
              )
            })}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/aula/SessionReport.test.tsx`
Expected: PASS (all pre-existing tests plus the 2 new ones)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/aula/SessionReport.tsx __tests__/components/aula/SessionReport.test.tsx
git commit -m "feat: show a highlight banner for newly awarded badges in the session report"
```

---

## Task 5: `AulaClient` — merge badges from both responses into the report

**Files:**
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `newly_awarded_badges` (from `/assess`, Task 3), `newlyAwardedBadges` (from `/report`, Task 3), `BadgeKey` (Task 1), `SessionReport`'s new `newlyAwardedBadges` prop (Task 4).

- [ ] **Step 1: Write the failing test**

Open `__tests__/app/aula/AulaClient.test.tsx`. Find the existing test `'shows the level promotion banner when the assess response includes level_promotion'` (around line 241) and use it as the template — copy its full `vi.mocked(useSession).mockReturnValue({...})` setup and `global.fetch` mock shape. Add this new test case right after it:

```tsx
  it('shows the new-badge highlight when the assess response includes newly_awarded_badges', async () => {
    const endSessionMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: endSessionMock,
      retryAudio: vi.fn(),
    })

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/assess')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scores: { speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78, grammar: 72, confidence: 80, fluency: 74 },
            final_score: 75,
            passed: true,
            failed_competencies: [],
            feedback_pt: 'Muito bem!',
            highlight_pt: 'Ótimo!',
            attempt_count: 1,
            newly_awarded_badges: ['primeira_conversa'],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          userMessages: 3,
          corrections: 1,
          pronunciationHints: 0,
          durationSeconds: 120,
          missionCompleted: false,
          missionTitle: 'Apresentação completa',
          newlyAwardedBadges: [],
        }),
      })
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    const endButton = screen.getByText(/encerrar aula/i)
    await act(async () => { fireEvent.click(endButton) })
    await waitFor(() => expect(screen.getByText('Primeira conversa')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/aula/AulaClient.test.tsx`
Expected: FAIL — "Primeira conversa" not found in the rendered output

- [ ] **Step 3: Wire the merge in `AulaClient.tsx`**

Add the `BadgeKey` import near the top of the file, alongside the existing type imports:

```typescript
import type { BadgeKey } from '@/lib/badges'
```

Add `newlyAwardedBadges` to the `reportData` state type (find the `useState<{...} | null>(null)` block around line 57 and add the field alongside `levelPromotion`):

```typescript
    levelPromotion?: { from: CefrLevel; to: CefrLevel } | null
    newlyAwardedBadges?: BadgeKey[]
  } | null>(null)
```

In `handleEnd()`, find where `levelPromotion` is derived from the assess response (around line 258-266) and extend it to also merge badges from both responses:

```typescript
        if (reportRes.status === 'fulfilled' && reportRes.value.ok) {
          const data = await reportRes.value.json()
          let assessment = null
          let levelPromotion = null
          let newlyAwardedBadges: BadgeKey[] = data.newlyAwardedBadges ?? []
          if (assessRes.status === 'fulfilled' && assessRes.value.ok) {
            const a = await assessRes.value.json()
            if (!a.too_short && !a.error) assessment = a
            levelPromotion = a.level_promotion ?? null
            newlyAwardedBadges = [...newlyAwardedBadges, ...(a.newly_awarded_badges ?? [])]
          }
          setReportData({ ...data, assessment, levelPromotion, newlyAwardedBadges })
          setShowReport(true)
          return
        }
```

Finally, pass the new prop to **both** `<SessionReport ...>` render sites (the intro-screen early return around line 372, and the main render around line 581) — add this line to each, alongside the existing `levelPromotion={reportData.levelPromotion}` line:

```tsx
            newlyAwardedBadges={reportData.newlyAwardedBadges}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/aula/AulaClient.test.tsx`
Expected: PASS (all pre-existing tests plus the new one)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full suite**

Run: `npm run test:run`
Expected: PASS — no regressions across the whole suite.

- [ ] **Step 7: Commit**

```bash
git add app/aula/AulaClient.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: surface newly awarded badges from both session-end responses in the report"
```

---

## Task 6: `/dashboard/medalhas` gallery page + dashboard nav card

**Files:**
- Create: `app/dashboard/medalhas/page.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `BADGE_DEFINITIONS`, `BadgeKey` (Task 1), `BadgeIcon` (Task 2).

- [ ] **Step 1: Create the gallery page**

```tsx
// app/dashboard/medalhas/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BadgeIcon } from '@/components/dashboard/BadgeIcon'
import { BADGE_DEFINITIONS, type BadgeKey } from '@/lib/badges'

const CATEGORY_LABELS_PT: Record<'constancia' | 'dominio', string> = {
  constancia: 'Constância',
  dominio: 'Domínio',
}

export default async function MedalhasPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('user_badges')
    .select('badge_key, earned_at')
    .eq('user_id', user.id)

  const earnedMap = new Map(
    ((rows ?? []) as Array<{ badge_key: BadgeKey; earned_at: string }>).map(r => [r.badge_key, r.earned_at]),
  )

  const categories: Array<'constancia' | 'dominio'> = ['constancia', 'dominio']

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full gap-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Suas medalhas</h1>

        {categories.map(category => (
          <div key={category} className="flex flex-col gap-2">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              {CATEGORY_LABELS_PT[category]}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {BADGE_DEFINITIONS.filter(b => b.category === category).map(badge => {
                const earnedAt = earnedMap.get(badge.key)
                const earned = Boolean(earnedAt)
                return (
                  <div
                    key={badge.key}
                    className={`flex flex-col items-center gap-1 p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center ${
                      earned ? '' : 'opacity-40 grayscale'
                    }`}
                  >
                    <BadgeIcon icon={badge.icon} size={28} className="text-brand-cta" />
                    <p className="text-xs font-semibold text-content-light dark:text-content-dark">{badge.title_pt}</p>
                    <p className="text-[10px] text-content-light-secondary dark:text-content-dark-secondary">
                      {earned
                        ? new Date(earnedAt as string).toLocaleDateString('pt-BR')
                        : badge.description_pt}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Add the nav card to the main dashboard**

In `app/dashboard/page.tsx`, add a new `<Link>` immediately after the existing "Sua evolução" nav card block:

```tsx
        <Link
          href="/dashboard/evolucao"
          className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
        >
          <div>
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">Sua evolução</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              Veja como suas competências mudaram ao longo do tempo
            </p>
          </div>
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
        </Link>

        <Link
          href="/dashboard/medalhas"
          className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
        >
          <div>
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">Suas medalhas</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              Conquistas desbloqueadas pela sua constância e evolução
            </p>
          </div>
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
        </Link>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full suite**

Run: `npm run test:run`
Expected: PASS — every test file from Tasks 1-5 plus the full pre-existing suite, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/medalhas/page.tsx app/dashboard/page.tsx
git commit -m "feat: add the medalhas gallery page and its dashboard nav card"
```

---

## Final Check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Apply the migration to the live Supabase project (`iifsamuemsrlpzafegat`) via `apply_migration` — this does not happen automatically on merge, per this project's known DB-migration drift pattern.
- [ ] Manual pass: with an account close to a threshold (e.g. `streak_days = 6`), complete a session to cross the threshold. Confirm the medal highlight appears in the post-session report, and that visiting `/dashboard/medalhas` afterward shows it as earned with today's date. Complete a second session and confirm the same medal does not re-appear as "new."
- [ ] After merging, run `vercel --prod` to deploy — this also does not happen automatically, per the same drift pattern.
