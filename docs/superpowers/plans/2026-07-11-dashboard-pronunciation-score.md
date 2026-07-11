# Dashboard Pronunciation Score Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the student's current pronunciation score as a persistent, always-visible card on the main dashboard (`/dashboard`), with a trend indicator once enough history exists — closing roadmap item #3 ("Pronúncia % visível").

**Architecture:** A pure calculation function `getPronunciationTrend()` added to `lib/mastery.ts` takes an array of recent `pronunciation` scores (most-recent-first) and returns the current average plus an optional up/down/flat trend. A new presentational component `PronunciationScoreCard` renders that result. `app/dashboard/page.tsx` fetches the last 10 `topic_assessments.pronunciation` rows for the user (read-only, no schema change), feeds them through `getPronunciationTrend()`, and conditionally renders the card between `StreakBadge` and the VIP/demo status block.

**Tech Stack:** Next.js 14 App Router (server component), Supabase (Postgres + RLS via `createSupabaseServer()`), Vitest + Testing Library, lucide-react icons, Tailwind CSS.

## Global Constraints

- Read-only feature: no new DB migration, no writes to `topic_assessments` or any other table.
- Follow the existing dashboard pattern of inline Supabase queries in the server component (`app/dashboard/page.tsx`) — do not introduce a new API route for this.
- Card renders `null`/nothing when there are zero pronunciation assessments — never show a "0%" or empty state.
- Trend indicator (`up`/`down`/`flat`) only renders once there are at least 10 assessment rows (5 for "current" + 5 for "previous"); otherwise omit the indicator entirely, no placeholder.
- Match existing dashboard card visual style: `rounded-xl`, `bg-surface-light-card dark:bg-surface-dark-card`, `text-content-light-secondary dark:text-content-dark-secondary` for secondary text (see `components/dashboard/ProgressMemoryCard.tsx`, `components/dashboard/StreakBadge.tsx`).
- Run `npm run test:run` after every task; all tests (existing + new) must pass before moving to the next task.

---

## File Structure

- **Modify:** `lib/mastery.ts` — add `PronunciationTrend` interface and `getPronunciationTrend()` function.
- **Test:** `__tests__/lib/mastery.test.ts` — new file, unit tests for `getPronunciationTrend()`.
- **Create:** `components/dashboard/PronunciationScoreCard.tsx` — presentational card component.
- **Test:** `__tests__/components/dashboard/PronunciationScoreCard.test.tsx` — render tests.
- **Modify:** `app/dashboard/page.tsx` — fetch recent pronunciation rows, compute trend, render the card.

---

### Task 1: `lib/mastery.ts` — `getPronunciationTrend()`

**Files:**
- Modify: `lib/mastery.ts`
- Test: `__tests__/lib/mastery.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function, no imports beyond what `lib/mastery.ts` already has).
- Produces: `export interface PronunciationTrend { currentScore: number; trend: 'up' | 'down' | 'flat' | null }` and `export function getPronunciationTrend(scores: number[]): PronunciationTrend | null` — consumed by Task 3 (`app/dashboard/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/mastery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getPronunciationTrend } from '@/lib/mastery'

describe('getPronunciationTrend', () => {
  it('returns null when there are no scores', () => {
    expect(getPronunciationTrend([])).toBeNull()
  })

  it('averages 1-4 scores with no trend', () => {
    const result = getPronunciationTrend([80, 60])
    expect(result).toEqual({ currentScore: 70, trend: null })
  })

  it('averages the 5 most recent scores with no trend when fewer than 10 total', () => {
    // 7 scores total: recent 5 = [90,80,70,60,50] avg 70; previous only has 2 (<5) -> no trend
    const scores = [90, 80, 70, 60, 50, 40, 30]
    const result = getPronunciationTrend(scores)
    expect(result).toEqual({ currentScore: 70, trend: null })
  })

  it('has no trend at exactly 9 total scores (previous period incomplete)', () => {
    const recent = [80, 80, 80, 80, 80] // avg 80
    const previous = [60, 60, 60, 60] // only 4, <5
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 80, trend: null })
  })

  it('computes an up trend when current average exceeds previous', () => {
    const recent = [90, 90, 90, 90, 90] // avg 90
    const previous = [50, 50, 50, 50, 50] // avg 50
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 90, trend: 'up' })
  })

  it('computes a down trend when current average is below previous', () => {
    const recent = [50, 50, 50, 50, 50]
    const previous = [90, 90, 90, 90, 90]
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 50, trend: 'down' })
  })

  it('computes a flat trend when current average equals previous', () => {
    const recent = [70, 70, 70, 70, 70]
    const previous = [70, 70, 70, 70, 70]
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 70, trend: 'flat' })
  })

  it('only considers the 10 most recent scores for the trend', () => {
    const recent = [100, 100, 100, 100, 100] // avg 100
    const previous = [0, 0, 0, 0, 0] // avg 0
    const older = [100, 100, 100] // must be ignored — beyond the 10 most recent
    const result = getPronunciationTrend([...recent, ...previous, ...older])
    expect(result).toEqual({ currentScore: 100, trend: 'down' })
  })

  it('rounds the current score to the nearest integer', () => {
    const result = getPronunciationTrend([70, 71, 70])
    // avg = 70.333... -> rounds to 70
    expect(result).toEqual({ currentScore: 70, trend: null })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/lib/mastery.test.ts`
Expected: FAIL with "getPronunciationTrend is not exported" (or similar — the function doesn't exist yet)

- [ ] **Step 3: Implement `getPronunciationTrend`**

In `lib/mastery.ts`, add at the end of the file (after `getMasteryLabel`):

```typescript
export interface PronunciationTrend {
  currentScore: number
  trend: 'up' | 'down' | 'flat' | null
}

export function getPronunciationTrend(scores: number[]): PronunciationTrend | null {
  if (scores.length === 0) return null

  const recent = scores.slice(0, 5)
  const currentScore = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)

  const previous = scores.slice(5, 10)
  if (previous.length < 5) return { currentScore, trend: null }

  const previousScore = Math.round(previous.reduce((a, b) => a + b, 0) / previous.length)
  const delta = currentScore - previousScore
  const trend: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { currentScore, trend }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/lib/mastery.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/mastery.ts __tests__/lib/mastery.test.ts
git commit -m "feat: add getPronunciationTrend for dashboard pronunciation card"
```

---

### Task 2: `components/dashboard/PronunciationScoreCard.tsx`

**Files:**
- Create: `components/dashboard/PronunciationScoreCard.tsx`
- Test: `__tests__/components/dashboard/PronunciationScoreCard.test.tsx`

**Interfaces:**
- Consumes: `PronunciationTrend['trend']` shape (`'up' | 'down' | 'flat' | null`) from Task 1 — passed in as props, not imported.
- Produces: `export function PronunciationScoreCard({ currentScore, trend }: { currentScore: number; trend: 'up' | 'down' | 'flat' | null }): JSX.Element` — consumed by Task 3 (`app/dashboard/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/dashboard/PronunciationScoreCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PronunciationScoreCard } from '@/components/dashboard/PronunciationScoreCard'

describe('PronunciationScoreCard', () => {
  it('shows the current score and label', () => {
    render(<PronunciationScoreCard currentScore={72} trend={null} />)
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(screen.getByText(/pronúncia/i)).toBeInTheDocument()
  })

  it('shows no trend icon when trend is null', () => {
    render(<PronunciationScoreCard currentScore={72} trend={null} />)
    expect(screen.queryByTestId('trend-up')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trend-down')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trend-flat')).not.toBeInTheDocument()
  })

  it('shows an up trend icon when trend is up', () => {
    render(<PronunciationScoreCard currentScore={80} trend="up" />)
    expect(screen.getByTestId('trend-up')).toBeInTheDocument()
  })

  it('shows a down trend icon when trend is down', () => {
    render(<PronunciationScoreCard currentScore={60} trend="down" />)
    expect(screen.getByTestId('trend-down')).toBeInTheDocument()
  })

  it('shows a flat trend icon when trend is flat', () => {
    render(<PronunciationScoreCard currentScore={70} trend="flat" />)
    expect(screen.getByTestId('trend-flat')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/components/dashboard/PronunciationScoreCard.test.tsx`
Expected: FAIL with "Cannot find module '@/components/dashboard/PronunciationScoreCard'"

- [ ] **Step 3: Implement the component**

Create `components/dashboard/PronunciationScoreCard.tsx`:

```typescript
import { Mic, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  currentScore: number
  trend: 'up' | 'down' | 'flat' | null
}

const TREND_CONFIG = {
  up: { Icon: TrendingUp, color: 'text-green-500' },
  down: { Icon: TrendingDown, color: 'text-red-400' },
  flat: { Icon: Minus, color: 'text-content-light-secondary dark:text-content-dark-secondary' },
} as const

export function PronunciationScoreCard({ currentScore, trend }: Props) {
  const trendInfo = trend ? TREND_CONFIG[trend] : null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex items-center gap-3">
      <Mic size={20} className="text-amber-500 shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Pronúncia
        </p>
        <div className="flex items-center gap-1.5">
          <p className="text-2xl font-bold text-content-light dark:text-content-dark">{currentScore}%</p>
          {trendInfo && (
            <trendInfo.Icon size={16} className={trendInfo.color} data-testid={`trend-${trend}`} />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/components/dashboard/PronunciationScoreCard.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/PronunciationScoreCard.tsx __tests__/components/dashboard/PronunciationScoreCard.test.tsx
git commit -m "feat: add PronunciationScoreCard component"
```

---

### Task 3: Wire the card into `app/dashboard/page.tsx`

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getPronunciationTrend(scores: number[]): PronunciationTrend | null` from Task 1 (`@/lib/mastery`); `PronunciationScoreCard` from Task 2 (`@/components/dashboard/PronunciationScoreCard`).
- Produces: nothing new — this is the final integration task.

- [ ] **Step 1: Add the imports**

In `app/dashboard/page.tsx`, the current imports include (near the top of the file):

```typescript
import { StreakBadge } from '@/components/dashboard/StreakBadge'
import { SessionCard } from '@/components/dashboard/SessionCard'
```

Add two new imports directly below the `StreakBadge` import:

```typescript
import { StreakBadge } from '@/components/dashboard/StreakBadge'
import { PronunciationScoreCard } from '@/components/dashboard/PronunciationScoreCard'
import { SessionCard } from '@/components/dashboard/SessionCard'
```

And add `getPronunciationTrend` to imports from `@/lib/mastery`. The file does not currently import from `@/lib/mastery` at all, so add a new import line near the other `@/lib/*` imports (next to `import { getMissionForDate } from '@/lib/missions'`):

```typescript
import { getMissionForDate } from '@/lib/missions'
import { getPronunciationTrend } from '@/lib/mastery'
```

- [ ] **Step 2: Fetch the recent pronunciation rows**

Find this existing block in `app/dashboard/page.tsx`:

```typescript
  // Load due vocabulary cards count
  const { data: dueVocab } = await supabase
    .from('vocab_log')
    .select('id')
    .eq('user_id', authUser.id)
    .lte('next_review_at', new Date().toISOString())
    .limit(1)
```

Add immediately after it:

```typescript
  // Load recent pronunciation scores for the dashboard trend card
  const { data: pronunciationRows } = await supabase
    .from('topic_assessments')
    .select('pronunciation')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const pronunciationTrend = getPronunciationTrend(
    (pronunciationRows ?? []).map((r: { pronunciation: number }) => r.pronunciation),
  )
```

- [ ] **Step 3: Render the card**

Find this existing JSX in `app/dashboard/page.tsx`:

```typescript
        {/* Streak */}
        <StreakBadge streakDays={u.streak_days ?? 0} />

        {vipUser && <VipBadge plan={vipUser.plan} />}
```

Replace with:

```typescript
        {/* Streak */}
        <StreakBadge streakDays={u.streak_days ?? 0} />

        {pronunciationTrend && (
          <PronunciationScoreCard
            currentScore={pronunciationTrend.currentScore}
            trend={pronunciationTrend.trend}
          />
        )}

        {vipUser && <VipBadge plan={vipUser.plan} />}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this change (pre-existing unrelated errors, if any, are out of scope for this plan).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm run test:run`
Expected: PASS (all existing tests plus the 14 new ones from Tasks 1–2)

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: show pronunciation score card on dashboard"
```

---

## Verification Summary

After Task 3, a student with 10+ assessed sessions sees a "Pronúncia XX% [↑/↓/→]" card on `/dashboard` right below their streak; a student with 1–9 assessed sessions sees the same card without the trend icon; a student with 0 assessed sessions sees no card at all — matching the edge-case table in `docs/superpowers/specs/2026-07-11-dashboard-pronunciation-score-design.md`.
