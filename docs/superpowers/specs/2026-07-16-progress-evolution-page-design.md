# Progress Evolution Page — Design Spec

**Source:** item #10 of the 12 high-impact improvements tracked in `[[project_roadmap_vision]]` memory — "Mostrar evolução." Explicitly deferred as a separate, larger item in the `2026-07-11-dashboard-pronunciation-score-design.md` spec's non-goals ("Not building a full competency history/trend page — that's a separate, larger roadmap item").

## Problem

The dashboard shows a single live snapshot (`PronunciationScoreCard`) and `/licoes` computes a strongest/weakest competency pair inline, but there is nowhere a student can see their scores change over time across all 7 competencies. This directly under-serves the product's core marketing promise: "acompanha sua evolução diariamente, identifica seus pontos fracos."

**Bug discovered while scoping this feature:** `app/dashboard/page.tsx`'s existing pronunciation-trend query orders `topic_assessments` by `created_at` — a column that does not exist on that table (the real timestamp column is `assessed_at`). Since the code only destructures `{ data }` from the query and never checks `error`, a failed query silently resolves to `pronunciationRows = null` → `[] `→ `getPronunciationTrend([])` returns `null` → `PronunciationScoreCard` never renders. This is fixed as part of this feature, since the new page's query touches the exact same table and would otherwise repeat the same mistake.

## Goal

A dedicated `/dashboard/evolucao` page showing a simple trend chart of the student's overall score across their last 10 assessed sessions, plus all 7 competencies ranked from strongest to weakest — linked from a new nav card on the main dashboard.

## Non-goals

- **No CEFR level timeline** (from `level_history`) — explicitly deferred; this page is about competency scores, not level transitions.
- **No new charting library.** A hand-rolled SVG polyline is enough for a single trend line over ≤10 points — matches this session's established pattern of avoiding new vendors/dependencies unless there's no reasonable alternative (unlike `ffmpeg-static`, which had no alternative).
- **No date-range picker or filtering.** Fixed window of the last 10 assessed sessions, same window size `PronunciationScoreCard`/`getPronunciationTrend` already use — consistency over configurability.
- **No per-topic breakdown.** Aggregate competency averages only, same aggregation `/licoes` already does today.
- **No changes to how `topic_assessments` rows are produced** (`app/api/session/[id]/assess/route.ts` is untouched) — this is a read-only reporting feature.

## Data & shared logic

### `lib/mastery.ts` (modified)

Extract the strongest/weakest ranking logic currently duplicated inline in `app/licoes/page.tsx` into a shared, reusable, pure function:

```typescript
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

Returns competencies sorted strongest-first (empty array when there's no data — callers decide what "no data" means for their UI, matching the existing `getPronunciationTrend` convention of returning `null`/empty rather than throwing). Takes `Partial<CompetencyScores>` (not a hard-required full shape) so it works whether the caller selected all 7 columns or a subset, matching how both `/licoes` (selects only the 7 competency columns) and the new page (selects those 7 plus `final_score`/`assessed_at`) already query differently today.

`getPronunciationTrend(scores: number[])` (already exists) is reused as-is for the overall-score trend on the new page — its logic doesn't reference pronunciation specifically, it just operates on a plain `number[]`, so no rename or duplication is needed.

### `app/licoes/page.tsx` (modified)

Replace the inline `avgs`/`strongestCompetency`/`weakestCompetency` computation (currently lines ~46-65) with a call to `rankCompetencies(assessments)`, taking `COMPETENCY_LABELS_PT[ranked[0]?.key]` / `COMPETENCY_LABELS_PT[ranked[ranked.length - 1]?.key]` for the existing strongest/weakest display. No visible behavior change — this is a pure refactor to remove the duplicate logic before a third consumer (the new page) would otherwise duplicate it a second time. Also drops the page's local `competencyLabels` map in favor of the already-existing `COMPETENCY_LABELS_PT` export from `lib/mastery.ts` (identical Portuguese labels, confirmed by direct comparison).

### `app/dashboard/page.tsx` (modified)

Fix the pre-existing bug: change `.order('created_at', { ascending: false })` to `.order('assessed_at', { ascending: false })` on the `topic_assessments` query that feeds `PronunciationScoreCard`. Add a new always-visible nav card (same visual pattern as the existing "Suas lições"/"Planos e assinaturas" link-cards — title + one-line description + chevron, not conditional on data existing like the "Revisar erros"/"Revisar vocabulário" cards, since the destination page itself handles the empty-data case) linking to `/dashboard/evolucao`, placed directly below the `PronunciationScoreCard`.

## New page: `app/dashboard/evolucao/page.tsx`

A server component (async function doing a direct Supabase query), matching `app/dashboard/page.tsx`'s and `app/licoes/page.tsx`'s own pattern — **not** a client component with a `useEffect` fetch like `/dashboard/revisao` and `/dashboard/vocabulario`, because unlike those two (which need client-side flip/swipe review interactions calling `PATCH` endpoints), this page is pure read-only display with no interactivity, so a server component is simpler and avoids an unneeded API route + loading state.

Query: last 10 rows from `topic_assessments` (`speaking, listening, pronunciation, vocabulary, grammar, confidence, fluency, final_score, assessed_at`), filtered by `user_id`, ordered by `assessed_at` descending.

**Ordering matters and differs by consumer, from the same fetched rows:** `getPronunciationTrend` expects most-recent-first (its own `slice(0, 5)`/`slice(5, 10)` logic assumes index 0 is the newest), so it's called directly on the descending-order query result. `ScoreTrendChart` needs oldest-first (a chart reads left-to-right as time moving forward), so a *separate* reversed copy of the same rows is built for it. Don't reverse the array once and reuse it for both — each consumer needs its own ordering.

Layout: header with a back-link to `/dashboard` (same `ArrowLeft` + "Dashboard" pattern as `/dashboard/revisao`/`/dashboard/vocabulario`'s headers) and `ThemeToggle`. Body:

1. **Empty state** (`assessments.length === 0`): a centered message, "Ainda não há avaliações suficientes. Continue praticando!" — matching the tone of `/dashboard/revisao`'s "Nenhum erro para revisar" empty state.
2. **Score card**: current overall score (`getPronunciationTrend(assessments.map(a => a.final_score)).currentScore`) as a large number, with the `ScoreTrendChart` below it.
3. **Competency list**: `rankCompetencies(assessments)` rendered as 7 rows (label + rounded average percentage), the first (strongest) row's number in green, the last (weakest) row's number in amber, matching `/licoes`'s existing strongest/weakest color convention.

## New component: `components/dashboard/ScoreTrendChart.tsx`

```typescript
interface ScoreTrendChartProps {
  scores: number[] // chronological order, oldest first, each 0-100
}
```

Renders `null` when `scores.length < 2` (a line needs at least two points — the score card above it still shows the current number even with only one data point). Otherwise renders a `viewBox="0 0 300 100"` SVG: a `<polyline>` connecting each score (x = evenly spaced by index, y = inverted/scaled from the 0-100 value) plus a `<circle>` per point, styled with the existing `text-brand-interactive`/`fill-brand-interactive` utility classes already used elsewhere in the app (e.g. buttons), so it automatically follows the light/dark theme without new color tokens. `role="img"` with an `aria-label` describing it as the score evolution chart, since an SVG polyline conveys no information to screen readers otherwise.

## Testing

- `__tests__/lib/mastery.test.ts` (modified — file already exists for `getPronunciationTrend`): add tests for `rankCompetencies` covering empty input, a single-assessment case where the ranking is unambiguous, and a multi-assessment case verifying the averaging math and descending sort order.
- `__tests__/components/dashboard/ScoreTrendChart.test.tsx` (new): renders `null`/nothing for 0 or 1 scores; renders an `<svg>` with the correct number of `<circle>` points for a multi-score array; renders with the accessible label.
- `app/dashboard/evolucao/page.tsx` and the refactor to `app/licoes/page.tsx`: no new page-level test, matching the already-established precedent (from the `2026-07-11-dashboard-pronunciation-score-design.md` spec) that server-component dashboard pages in this codebase are not directly tested — correctness is covered by the `rankCompetencies`/`getPronunciationTrend`/`ScoreTrendChart` unit and component tests plus a manual pass.
- Manual pass: with an account that has several `topic_assessments` rows, confirm the new "Sua evolução" card appears on the dashboard, the evolution page renders a chart with the right number of points and a plausible current score, the competency list is sorted with the correct strongest (green) and weakest (amber) highlighted, and that the dashboard's `PronunciationScoreCard` now actually renders (proving the `assessed_at` bug fix).

## Rollout

No database changes — every field this feature reads already exists on `topic_assessments`. No feature flag — ships as one plan, same as every prior feature this session.
