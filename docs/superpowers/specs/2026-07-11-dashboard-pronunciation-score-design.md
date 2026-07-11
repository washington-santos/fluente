# Dashboard Pronunciation Score Card — Design Spec

**Roadmap item:** #3 of the 12 high-impact improvements — "Pronúncia % visível" (see `[[project_roadmap_vision]]` memory).

## Problem

Pronunciation score already exists as data (`topic_assessments.pronunciation`, 0–100, written by `app/api/session/[id]/assess/route.ts` after every assessed session) and is already *shown* once, transiently, in the end-of-lesson `SessionReport` modal — but it disappears the moment the student closes that modal. There is no persistent place where a student can see "this is my pronunciation right now" without having just finished a lesson. `/licoes` computes a weakest/strongest competency label but renders it as plain text ("Pronúncia"), never a number.

## Goal

Add a small, always-visible card to the main dashboard (`app/dashboard/page.tsx`) showing the student's current pronunciation score as a percentage, with a trend indicator once enough history exists.

## Non-goals

- Not building a full competency history/trend page (that's a separate, larger roadmap item — "Mostrar evolução").
- Not touching the mastery/adaptive-selection system, `assess` route, or `topic_assessments` schema — this is read-only.
- Not showing the other 6 competencies on the dashboard (scope confirmed with user — pronunciation only, to stay small and match the roadmap item as written).

## Data & calculation

Source: `topic_assessments` table, column `pronunciation` (integer 0–100), `created_at` timestamp, filtered by `user_id`.

Query: fetch the 10 most recent rows for the current user, ordered by `created_at desc`.

Given those rows (call them `r[0]` = most recent … `r[9]` = oldest of the 10):

- `recent = r[0..4]` (up to 5 most recent)
- `previous = r[5..9]` (the 5 before that, only if they exist)

```
currentScore = round(average(recent.pronunciation))
```

Trend, only computed when `previous.length === 5`:

```
previousScore = round(average(previous.pronunciation))
delta = currentScore - previousScore
trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
```

### Edge cases

| # of assessment rows | Card behavior |
|---|---|
| 0 | Card is not rendered at all |
| 1–4 | Card renders with `currentScore` = average of all available rows; no trend arrow |
| 5–9 | Card renders with `currentScore` = average of the up-to-5 most recent; no trend arrow (insufficient rows for a previous-period comparison) |
| 10+ | Card renders with `currentScore` and a trend arrow (↑/↓/→) comparing to the previous 5 |

This logic lives in a new pure function `getPronunciationTrend(scores: number[]): { currentScore: number; trend: 'up' | 'down' | 'flat' | null }` in `lib/mastery.ts` (alongside the existing `CompetencyScores`/mastery helpers), where `scores` is the array of `pronunciation` values already ordered most-recent-first. Keeping it pure and colocated makes it unit-testable without touching Supabase mocks.

## Components

### `lib/mastery.ts` (modified)

Add:

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
  const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { currentScore, trend }
}
```

Returns `null` when there's no data at all (0 rows), signaling the caller to skip rendering the card.

### `components/dashboard/PronunciationScoreCard.tsx` (new)

Presentational client-agnostic component (no `'use client'` needed — no interactivity), styled consistently with `StreakBadge.tsx`:

```typescript
interface Props {
  currentScore: number
  trend: 'up' | 'down' | 'flat' | null
}
```

- Card background: `bg-surface-light-card dark:bg-surface-dark-card` (matches other dashboard cards, e.g. `ProgressMemoryCard`), rounded-xl, padding consistent with siblings.
- `Mic` icon from `lucide-react` (already used in `SessionReport.tsx` and `components/aula/*`), colored `text-amber-500` (same as its use in `SessionReport`).
- Score rendered large (`text-2xl font-bold`, matching the stat-tile style already used in `SessionReport`'s grid), label "pronúncia" below it in the small secondary-text style used across the dashboard.
- Trend indicator: small `↑`/`↓`/`→` (or `lucide-react`'s `TrendingUp`/`TrendingDown`/`Minus`) next to the score, green for `up`, red for `down`, neutral gray for `flat`. Omitted entirely when `trend` is `null`.

### `app/dashboard/page.tsx` (modified)

- Add one query to the existing `Promise.all` block (or a sibling call — the file already issues several sequential/parallel Supabase queries inline, following that established pattern rather than introducing a new API route):

```typescript
supabase
  .from('topic_assessments')
  .select('pronunciation')
  .eq('user_id', authUser.id)
  .order('created_at', { ascending: false })
  .limit(10)
```

- Compute `const pronunciationTrend = getPronunciationTrend((rows ?? []).map(r => r.pronunciation))`.
- Render `{pronunciationTrend && <PronunciationScoreCard currentScore={pronunciationTrend.currentScore} trend={pronunciationTrend.trend} />}` directly below `<StreakBadge />` and above `{vipUser && <VipBadge .../>}` / `<DemoStatusCard .../>` block (matches the position agreed with the user: right after streak, before demo status).

## Testing

- `__tests__/lib/mastery.test.ts` (new — no existing test file for `lib/mastery.ts` today): unit tests for `getPronunciationTrend` covering all rows in the edge-case table above (0, 1–4, 5–9 exact boundary at 9, 10+ with up/down/flat deltas).
- `__tests__/components/dashboard/PronunciationScoreCard.test.tsx` (new): render test asserting the score renders, the trend icon/color appears only when `trend` is non-null, and each of `up`/`down`/`flat` renders the expected visual state. Follow the existing convention in `__tests__/components/dashboard/StreakBadge.test.tsx` / `ProgressMemoryCard.test.tsx` (same directory, same component shape — presentational, no Supabase mocking needed).
- No test file exists today for `app/dashboard/page.tsx` itself (its many existing inline Supabase queries are already untested at the page level — only `/dashboard/sessao` has a page test). This design follows that existing precedent: the new query is a straightforward `select().eq().order().limit()` on an already-RLS-scoped client, and correctness is covered by the `getPronunciationTrend` unit tests plus the `PronunciationScoreCard` render tests. Adding a full page-level integration test for `app/dashboard/page.tsx` is out of scope here — it would be a pre-existing gap, not one introduced by this change.

## Rollout

No migration needed — reads an existing column. No feature flag needed — this is additive and read-only. Ships as one plan, no phasing required.
