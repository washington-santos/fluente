# Medalhas Inteligentes — Design Spec

**Source:** item #7 of the 12 high-impact improvements tracked in `[[project_roadmap_vision]]` memory — "Medalhas inteligentes." Builds on the just-shipped `/dashboard/evolucao` page (item #10), reusing the same data (streaks, `topic_assessments`, `user_topic_progress`, `level_history`, `missions_completed_count`).

## Problem

The product tracks a lot of student progress (streaks, mastered topics, level-ups, pronunciation scores, completed missions) but never celebrates any of it in the moment. There is no recognition system — a student who hits a 7-day streak or masters their first topic gets no acknowledgment beyond the raw numbers already visible on the dashboard. This under-serves the product's "acompanha sua evolução" promise: tracking without celebrating is only half the loop.

## Goal

A permanent, per-user record of earned achievements ("medalhas"), covering both consistency (streaks, missions) and skill mastery (topic mastery, level-ups, pronunciation, perfect scores). Earning a medal surfaces immediately in the post-session report. A dedicated `/dashboard/medalhas` gallery page shows all medals — earned (with date) and locked (grayed out) — linked from a new dashboard nav card.

## Non-goals

- **No large initial catalog.** Ten medals for v1 (see catalog below), not twenty-plus tiered variants — matches the user's explicit choice of a lean v1 that can grow later.
- **No live/ephemeral badge computation.** Medals are persisted once earned and never revoked, even if the underlying stat that triggered them later changes (e.g. `streak_days` resets to 0 after a missed day) — a medal is a historical fact, not a live gauge. This is why a new table is required instead of computing badges on the fly like `/dashboard/evolucao` does.
- **No badge-editing admin UI.** The catalog is a static array in code (`lib/badges.ts`), not database-driven — consistent with how `lib/topics.ts` and `COMPETENCY_LABELS_PT` are already hardcoded rather than admin-configurable.
- **No push notifications / emails.** The only "in the moment" surface is the existing post-session report modal (`SessionReport`) — no new notification channel.
- **No social/sharing features** (leaderboards, sharing a medal externally) — out of scope for this pass.

## Data & shared logic

### New table: `user_badges` (migration)

```sql
CREATE TABLE user_badges (
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

The `UNIQUE (user_id, badge_key)` constraint is what makes granting idempotent: an `insert ... on conflict (user_id, badge_key) do nothing` never duplicates a medal, regardless of how many times or from how many call sites it's attempted.

### `lib/badges.ts` (new)

Static catalog, metadata only (no criteria logic embedded in the definitions — criteria are DB queries, evaluated separately, since they depend on server-side state):

```typescript
export type BadgeKey =
  | 'primeira_conversa' | 'sequencia_3' | 'sequencia_7' | 'sequencia_30'
  | 'primeiro_topico_dominado' | 'cinco_topicos_dominados' | 'subiu_de_nivel'
  | 'pronuncia_afiada' | 'perfeccionista' | 'dez_missoes'

export interface BadgeDefinition {
  key: BadgeKey
  title_pt: string
  description_pt: string
  icon: string // lucide-react icon name
  category: 'constancia' | 'dominio'
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [ /* the 10 entries below */ ]
```

**Catalog (v1, 10 medals):**

| `badge_key` | title_pt | Category | Criterion |
|---|---|---|---|
| `primeira_conversa` | Primeira conversa | constancia | First `sessions` row for the user with `duration_seconds > 0` |
| `sequencia_3` | Sequência de 3 dias | constancia | `users.streak_days >= 3` |
| `sequencia_7` | Sequência de 7 dias | constancia | `users.streak_days >= 7` |
| `sequencia_30` | Sequência de 30 dias | constancia | `users.streak_days >= 30` |
| `primeiro_topico_dominado` | Primeiro tópico dominado | dominio | At least 1 row in `user_topic_progress` with `mastery_status = 'mastered'` |
| `cinco_topicos_dominados` | 5 tópicos dominados | dominio | At least 5 rows in `user_topic_progress` with `mastery_status = 'mastered'` |
| `subiu_de_nivel` | Subiu de nível | dominio | At least 1 row in `level_history` with `reason = 'auto_promotion'` |
| `pronuncia_afiada` | Pronúncia afiada | dominio | Any `topic_assessments.pronunciation >= 90` |
| `perfeccionista` | Perfeccionista | dominio | Any `topic_assessments.final_score >= 95` |
| `dez_missoes` | 10 missões cumpridas | constancia | `users.missions_completed_count >= 10` |

### `checkAndAwardBadges(supabase, userId): Promise<BadgeKey[]>` (in `lib/badges.ts`)

Runs the 10 criterion checks as small targeted queries (count/exists queries, not full-table scans), collects the `badge_key`s whose criterion is currently true, and does a single batched call:

```typescript
const { data } = await supabase
  .from('user_badges')
  .upsert(
    metCriteria.map(key => ({ user_id: userId, badge_key: key })),
    { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
  )
  .select('badge_key')
```

With `ignoreDuplicates: true`, Postgres performs `ON CONFLICT DO NOTHING`, and `RETURNING` (surfaced here via `.select()`) only ever contains rows that were actually written — so `data` is already exactly the "newly earned this call" list, with no separate diffing needed. Already-earned medals are silently skipped by the conflict clause, so calling this function repeatedly (from multiple routes, or on a user with no new progress) is always safe and cheap.

Wrapped in a single top-level `try/catch`: any failure (a criterion query erroring, the insert failing) is logged with `console.error` and the function resolves to `[]` rather than throwing — mirrors the existing resilience pattern in `finalize/route.ts`'s `generateSessionMemory` call and `assess/route.ts`'s `assessErr`/`progressErr` logging. A badge check must never fail the session-end response.

### Call sites

`checkAndAwardBadges` is called at the end of **both**:
- `app/api/session/[id]/assess/route.ts` — after the existing `checkAndApplyLevelPromotion` call, since level-ups and topic-mastery updates happen in this route.
- `app/api/session/[id]/report/route.ts` — after the existing `increment_missions_completed` RPC call, since mission-count updates happen here.

Both routes add `newly_awarded_badges: BadgeKey[]` to their JSON response. These two routes already fire in parallel from `AulaClient.handleEnd()` (`Promise.allSettled`), and `streak_days` is already updated earlier in the same flow (via `finalize`, awaited before `assess`/`report` fire) — so by the time either route's badge check runs, streak state is current. Because the grant is idempotent, it does not matter which of the two routes' badge check "wins" a given medal — whichever runs first gets it in its response; the other simply finds it already granted and omits it. No coordination between the two routes is needed.

## UI changes

### `AulaClient.tsx` (modified)

`handleEnd()` already merges `a.level_promotion` from the `/assess` response into `reportData`. Extend the same merge to also collect `newly_awarded_badges` from **both** the `/assess` and `/report` responses (a simple array concat — duplicates are not possible given the idempotency guarantee above) into a new `reportData.newlyAwardedBadges: BadgeKey[]`, passed to `SessionReport` as a new `newlyAwardedBadges` prop.

### `SessionReport` (modified, `components/aula/SessionReport.tsx`)

New conditional section, rendered only when `newlyAwardedBadges.length > 0`, showing each newly-earned medal's icon + `title_pt` (looked up from `BADGE_DEFINITIONS`). Visually matches the existing `levelPromotion` highlight section already in this component (same emphasis treatment) — this is a sibling achievement callout, not a new visual pattern.

### `app/dashboard/medalhas/page.tsx` (new)

Server component, matching `/dashboard/evolucao`'s pattern exactly (async function, direct Supabase query, no client-side fetch — this page has no interactivity). Queries all of the user's `user_badges` rows, cross-references against the full `BADGE_DEFINITIONS` catalog, and renders all 10 grouped by `category` (Constância / Domínio):
- **Earned:** colored icon, title, `earned_at` formatted as a date.
- **Locked:** grayscale/dimmed icon, title, no date.

Header: back-link to `/dashboard` + `ThemeToggle`, same pattern as `/dashboard/evolucao`.

### `app/dashboard/page.tsx` (modified)

New always-visible nav card directly below the "Sua evolução" card added in the previous feature, same visual pattern (title + one-line description + chevron), linking to `/dashboard/medalhas`.

## Testing

- `__tests__/lib/badges.test.ts` (new): mocks the Supabase client in the same `makeChain` style as `__tests__/app/api/session/assess.test.ts`. Covers each of the 10 criteria (met / not met), the idempotency guarantee (calling twice does not return the same key as "newly awarded" the second time), and that a thrown/errored query resolves to `[]` rather than propagating.
- `__tests__/app/api/session/assess.test.ts` and the `report` route's equivalent (modified): add `vi.mock('@/lib/badges', ...)` (same pattern already used for `vi.mock('@/lib/levels', ...)`), and a case asserting `newly_awarded_badges` is present in the response body.
- `SessionReport.test.tsx` (modified, already exists): new case covering the conditional newly-awarded-badges section.
- No new test for `app/dashboard/medalhas/page.tsx` — matches the established precedent (from the evolution-page spec) that server-component dashboard pages in this codebase are not directly tested; correctness is covered by the `lib/badges.ts` unit tests plus a manual pass.
- Manual pass: with an account close to a threshold (e.g. `streak_days = 6`), complete a session to cross the threshold, confirm the medal appears in the post-session report AND on `/dashboard/medalhas` afterward with the correct date; confirm an already-earned medal does not re-appear as "new" on a subsequent session.

## Rollout

One new migration (`user_badges` table + RLS policy). No feature flag — ships as one plan, same as prior features this session. After merging, remember this project's DB-migration and Vercel-deploy drift pattern: the migration must be applied to the live Supabase project (`iifsamuemsrlpzafegat`) via `apply_migration`, and a fresh `vercel --prod` run, before this feature is live for real users — neither happens automatically on merge/push.
