# Progress Evolution Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a dedicated `/dashboard/evolucao` page showing a trend chart of their overall score across recent sessions plus all 7 competencies ranked strongest-to-weakest, linked from a new dashboard nav card — and fix a pre-existing bug where the dashboard's pronunciation card silently fails to render due to a wrong column name.

**Architecture:** A new pure function `rankCompetencies()` in `lib/mastery.ts` (shared by the existing `/licoes` page and the new evolution page) averages competency scores across a set of assessments and sorts them. A new hand-rolled SVG component `ScoreTrendChart` renders the trend line — no new charting dependency. `app/dashboard/page.tsx` gets its `topic_assessments` query's wrong `created_at` column fixed to `assessed_at`, plus a new nav card. `app/licoes/page.tsx` gets refactored to use the shared `rankCompetencies()` instead of its own inline duplicate. `app/dashboard/evolucao/page.tsx` is a new server component (no client-side fetch, matching `/dashboard/page.tsx`'s own pattern, since this page has no interactivity).

**Tech Stack:** Next.js App Router (server components), TypeScript, Supabase, Vitest + Testing Library.

**Design spec:** `docs/superpowers/specs/2026-07-16-progress-evolution-page-design.md`

## Global Constraints

- No new charting library — the trend chart is a hand-rolled SVG polyline.
- No CEFR level timeline, no date-range picker, no per-topic breakdown (all explicit non-goals in the spec).
- Fixed window: last 10 `topic_assessments` rows, matching `getPronunciationTrend`'s existing window size.
- `getPronunciationTrend` is reused as-is (no rename, no duplication) for the overall-score trend.
- `getPronunciationTrend` needs its input **most-recent-first**; `ScoreTrendChart` needs its input **oldest-first** — these are two different orderings of the same fetched rows, never the same array reused for both.
- No changes to `app/api/session/[id]/assess/route.ts` or how `topic_assessments` rows are produced — this is a read-only reporting feature.
- No new test file for the two page components themselves (`app/dashboard/evolucao/page.tsx`, and no new test for the `app/licoes/page.tsx`/`app/dashboard/page.tsx` edits) — matches the already-established precedent that server-component dashboard pages in this codebase aren't directly tested; correctness is covered by the underlying pure-function and component tests plus a manual pass.
- No database changes. No feature flag.

---

## Task 1: `rankCompetencies()` — shared competency ranking

**Files:**
- Modify: `lib/mastery.ts`
- Modify: `__tests__/lib/mastery.test.ts`

**Interfaces:**
- Produces: `rankCompetencies(assessments: Array<Partial<CompetencyScores>>): Array<{ key: keyof CompetencyScores; avg: number }>` — consumed by Task 3 (`app/licoes/page.tsx`'s refactor) and Task 4 (the new evolution page).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/mastery.test.ts`. First update the import line at the top of the file:

```ts
import { getPronunciationTrend, rankCompetencies } from '@/lib/mastery'
```

Then append this new `describe` block at the end of the file:

```ts
describe('rankCompetencies', () => {
  it('returns an empty array when there are no assessments', () => {
    expect(rankCompetencies([])).toEqual([])
  })

  it('ranks a single assessment by its own values, strongest first', () => {
    const result = rankCompetencies([
      { speaking: 90, listening: 50, pronunciation: 70, vocabulary: 60, grammar: 80, confidence: 40, fluency: 30 },
    ])
    expect(result[0]).toEqual({ key: 'speaking', avg: 90 })
    expect(result[result.length - 1]).toEqual({ key: 'fluency', avg: 30 })
    expect(result).toHaveLength(7)
  })

  it('averages multiple assessments per competency and sorts descending', () => {
    const result = rankCompetencies([
      { speaking: 80, listening: 60, pronunciation: 40, vocabulary: 40, grammar: 40, confidence: 40, fluency: 40 },
      { speaking: 60, listening: 60, pronunciation: 40, vocabulary: 40, grammar: 40, confidence: 40, fluency: 40 },
    ])
    // speaking avg = 70, listening avg = 60, the rest are all 40
    expect(result[0]).toEqual({ key: 'speaking', avg: 70 })
    expect(result[1]).toEqual({ key: 'listening', avg: 60 })
    expect(result.slice(2).every(r => r.avg === 40)).toBe(true)
  })

  it('treats a missing competency field on an assessment as 0 for that assessment', () => {
    const result = rankCompetencies([
      { speaking: 100 },
      { speaking: 100, listening: 100 },
    ])
    const speaking = result.find(r => r.key === 'speaking')!
    const listening = result.find(r => r.key === 'listening')!
    expect(speaking.avg).toBe(100)
    expect(listening.avg).toBe(50) // (0 + 100) / 2 — first row's missing listening counts as 0
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/mastery.test.ts`
Expected: FAIL — `rankCompetencies` is not exported yet

- [ ] **Step 3: Write the implementation**

In `lib/mastery.ts`, add this function after `getPronunciationTrend` (which is the last export in the file today):

```ts
export function rankCompetencies(
  assessments: Array<Partial<CompetencyScores>>,
): Array<{ key: keyof CompetencyScores; avg: number }> {
  if (assessments.length === 0) return []
  const keys = Object.keys(COMPETENCY_LABELS_PT) as (keyof CompetencyScores)[]
  const avgs = keys.map(k => ({
    key: k,
    avg: assessments.reduce((sum, a) => sum + (a[k] ?? 0), 0) / assessments.length,
  }))
  avgs.sort((a, b) => b.avg - a.avg)
  return avgs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/mastery.test.ts`
Expected: PASS (all pre-existing `getPronunciationTrend` tests plus the 4 new `rankCompetencies` tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/mastery.ts __tests__/lib/mastery.test.ts
git commit -m "feat: add rankCompetencies, a shared strongest-to-weakest competency ranker"
```

---

## Task 2: `ScoreTrendChart` — hand-rolled SVG trend chart

**Files:**
- Create: `components/dashboard/ScoreTrendChart.tsx`
- Test: `__tests__/components/dashboard/ScoreTrendChart.test.tsx`

**Interfaces:**
- Produces: `ScoreTrendChart` component, `{ scores: number[] }` (scores in chronological/oldest-first order) — consumed by Task 4 (the new evolution page).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/dashboard/ScoreTrendChart.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ScoreTrendChart } from '@/components/dashboard/ScoreTrendChart'

describe('ScoreTrendChart', () => {
  it('renders nothing when there are fewer than 2 scores', () => {
    const { container: empty } = render(<ScoreTrendChart scores={[]} />)
    expect(empty.querySelector('svg')).not.toBeInTheDocument()

    const { container: single } = render(<ScoreTrendChart scores={[70]} />)
    expect(single.querySelector('svg')).not.toBeInTheDocument()
  })

  it('renders an accessible svg with one circle per score', () => {
    render(<ScoreTrendChart scores={[60, 70, 80, 90]} />)
    const svg = screen.getByRole('img', { name: /evolução/i })
    expect(svg).toBeInTheDocument()
    expect(svg.querySelectorAll('circle')).toHaveLength(4)
  })

  it('renders a single polyline connecting the points', () => {
    render(<ScoreTrendChart scores={[60, 70, 80]} />)
    const svg = screen.getByRole('img', { name: /evolução/i })
    expect(svg.querySelectorAll('polyline')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/dashboard/ScoreTrendChart.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// components/dashboard/ScoreTrendChart.tsx
interface ScoreTrendChartProps {
  scores: number[]
}

export function ScoreTrendChart({ scores }: ScoreTrendChartProps) {
  if (scores.length < 2) return null

  const width = 300
  const height = 100
  const padding = 10
  const max = 100

  const points = scores.map((s, i) => {
    const x = padding + (i / (scores.length - 1)) * (width - padding * 2)
    const clamped = Math.max(0, Math.min(100, s))
    const y = height - padding - (clamped / max) * (height - padding * 2)
    return { x, y }
  })

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto text-brand-interactive"
      role="img"
      aria-label="Gráfico de evolução do score geral"
    >
      <polyline points={polylinePoints} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-brand-interactive" />
      ))}
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/dashboard/ScoreTrendChart.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/ScoreTrendChart.tsx __tests__/components/dashboard/ScoreTrendChart.test.tsx
git commit -m "feat: add ScoreTrendChart, a dependency-free SVG trend line"
```

---

## Task 3: Fix the `assessed_at` bug and share the ranking logic in `/licoes`

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/licoes/page.tsx`

**Interfaces:**
- Consumes: `rankCompetencies()` (Task 1).

- [ ] **Step 1: Fix the wrong column name in `app/dashboard/page.tsx`**

Find this block (currently around line 75-81):

```ts
  // Load recent pronunciation scores for the dashboard trend card
  const { data: pronunciationRows } = await supabase
    .from('topic_assessments')
    .select('pronunciation')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(10)
```

Change `.order('created_at', { ascending: false })` to `.order('assessed_at', { ascending: false })`. `topic_assessments` has no `created_at` column — the real timestamp column is `assessed_at` — so this query was silently failing and `PronunciationScoreCard` was never rendering.

- [ ] **Step 2: Refactor `app/licoes/page.tsx` to use `rankCompetencies`**

In `app/licoes/page.tsx`, change the import line:

```ts
import { getMasteryLabel, rankCompetencies, COMPETENCY_LABELS_PT } from '@/lib/mastery'
```

Replace this block (currently lines ~46-65):

```ts
  // Average competency scores for "strengths" summary
  const assessments = (avgScores ?? []) as Record<string, number>[]
  const competencyKeys = ['speaking', 'listening', 'pronunciation', 'vocabulary', 'grammar', 'confidence', 'fluency'] as const
  const competencyLabels: Record<string, string> = {
    speaking: 'Conversação', listening: 'Compreensão', pronunciation: 'Pronúncia',
    vocabulary: 'Vocabulário', grammar: 'Gramática', confidence: 'Confiança', fluency: 'Fluência',
  }

  let strongestCompetency: string | null = null
  let weakestCompetency: string | null = null

  if (assessments.length > 0) {
    const avgs = competencyKeys.map(k => ({
      key: k,
      avg: assessments.reduce((s, a) => s + (a[k] ?? 0), 0) / assessments.length,
    }))
    avgs.sort((a, b) => b.avg - a.avg)
    strongestCompetency = competencyLabels[avgs[0].key]
    weakestCompetency = competencyLabels[avgs[avgs.length - 1].key]
  }
```

with:

```ts
  // Average competency scores for "strengths" summary
  const assessments = (avgScores ?? []) as Array<Partial<CompetencyScores>>
  const ranked = rankCompetencies(assessments)
  const strongestCompetency = ranked.length > 0 ? COMPETENCY_LABELS_PT[ranked[0].key] : null
  const weakestCompetency = ranked.length > 0 ? COMPETENCY_LABELS_PT[ranked[ranked.length - 1].key] : null
```

Add the `CompetencyScores` type import alongside the existing imports at the top of the file:

```ts
import type { CompetencyScores } from '@/lib/mastery'
```

This is a pure refactor — the rendered output (strongest/weakest labels, colors, layout below this block) does not change, it now shares logic with the new evolution page instead of duplicating it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full suite**

Run: `npm run test:run`
Expected: PASS — no test file directly covers these two pages (see Global Constraints), so this step is a regression check that nothing else broke, not a check for new passing tests.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/licoes/page.tsx
git commit -m "fix: order topic_assessments by assessed_at (not the nonexistent created_at), share competency ranking with /licoes"
```

---

## Task 4: `/dashboard/evolucao` page + dashboard nav card

**Files:**
- Create: `app/dashboard/evolucao/page.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `rankCompetencies()` (Task 1), `ScoreTrendChart` (Task 2), `getPronunciationTrend`/`COMPETENCY_LABELS_PT` (pre-existing in `lib/mastery.ts`).

- [ ] **Step 1: Create the evolution page**

```tsx
// app/dashboard/evolucao/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScoreTrendChart } from '@/components/dashboard/ScoreTrendChart'
import { getPronunciationTrend, rankCompetencies, COMPETENCY_LABELS_PT } from '@/lib/mastery'
import type { CompetencyScores } from '@/lib/mastery'

export default async function EvolucaoPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('topic_assessments')
    .select('speaking, listening, pronunciation, vocabulary, grammar, confidence, fluency, final_score, assessed_at')
    .eq('user_id', user.id)
    .order('assessed_at', { ascending: false })
    .limit(10)

  const assessments = (rows ?? []) as Array<Partial<CompetencyScores> & { final_score: number; assessed_at: string }>
  const overallTrend = getPronunciationTrend(assessments.map(a => a.final_score))
  const ranked = rankCompetencies(assessments)
  const chronologicalScores = [...assessments].reverse().map(a => a.final_score)

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
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Sua evolução</h1>

        {assessments.length === 0 ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Ainda não há avaliações suficientes. Continue praticando!
          </p>
        ) : (
          <>
            <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
                  Score geral
                </p>
                {overallTrend && (
                  <p className="text-2xl font-bold text-content-light dark:text-content-dark">
                    {overallTrend.currentScore}%
                  </p>
                )}
              </div>
              <ScoreTrendChart scores={chronologicalScores} />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
                Competências
              </p>
              {ranked.map((c, i) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
                >
                  <p className="text-sm text-content-light dark:text-content-dark">{COMPETENCY_LABELS_PT[c.key]}</p>
                  <p
                    className={`text-sm font-bold ${
                      i === 0
                        ? 'text-green-500'
                        : i === ranked.length - 1
                        ? 'text-amber-400'
                        : 'text-content-light dark:text-content-dark'
                    }`}
                  >
                    {Math.round(c.avg)}%
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
```

Note the deliberate ordering split: `overallTrend`/`ranked` are computed directly from `assessments` (still in the query's descending/most-recent-first order), while `chronologicalScores` is a **separate** reversed copy built only for the chart. Do not reverse `assessments` itself and reuse it for both.

- [ ] **Step 2: Add the nav card to the main dashboard**

In `app/dashboard/page.tsx`, add a new `<Link>` immediately after the existing `{pronunciationTrend && (<PronunciationScoreCard .../>)}` block:

```tsx
        {pronunciationTrend && (
          <PronunciationScoreCard
            currentScore={pronunciationTrend.currentScore}
            trend={pronunciationTrend.trend}
          />
        )}

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
```

This card is always visible (not conditional on `pronunciationTrend`/data existing), matching the existing "Suas lições"/"Planos e assinaturas" nav-card pattern — the destination page itself handles the empty-data case.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full suite**

Run: `npm run test:run`
Expected: PASS — every test file from Tasks 1-3 plus the full pre-existing suite, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/evolucao/page.tsx app/dashboard/page.tsx
git commit -m "feat: add the progress evolution page and its dashboard nav card"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Manual pass: with an account that has several `topic_assessments` rows, confirm (1) the dashboard's `PronunciationScoreCard` now actually renders (proving the `assessed_at` fix), (2) a new "Sua evolução" card appears below it and links to `/dashboard/evolucao`, (3) that page shows a chart with a plausible number of points and a current score, and the 7 competencies sorted with the strongest in green and weakest in amber, (4) `/licoes` still shows the same strongest/weakest summary it did before the refactor.
