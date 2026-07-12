# Daily Mission (Missão do Dia) Redesign — Design Spec

**Roadmap item:** #4 of the 12 high-impact improvements — "Missão do dia" (see `[[project_roadmap_vision]]` memory).

## Problem

Today's "Missão do dia" is weaker than it looks:

- `lib/missions.ts` has exactly 3 hardcoded missions per CEFR level (18 total), picked deterministically by day-of-month — the same 3 missions repeat forever, every 3 days, identical for every student at that level.
- Completion (`app/api/session/[id]/finalize/route.ts:101-114`) only checks that the student sent at least `minUserTurns` messages in *any* session that day — it never checks whether the conversation had anything to do with the mission's topic. Any sufficiently long chat "completes" any mission.
- There is no reward: `daily_missions_log` has no points/XP/badge column, and no other table is touched on completion. Completing a mission has zero gameplay effect.
- `MissionCard` (dashboard) and the mission banner in `SessionReport` are both purely cosmetic — tapping them does nothing.

## Goal

Make the daily mission real: content generated per-student per-day (not a repeating static list), completion verified against what was actually said (not just message count), a small persistent reward for completing one, and a tap-to-start flow that threads the mission into the actual lesson conversation.

## Non-goals

- No new points/XP economy. The reward is a simple lifetime counter (`users.missions_completed_count`), matching the existing `streak_days` pattern — not a new currency, not levels, not badges.
- Not touching the separate structured-lesson XP system (`lessons.xp_reward` / `user_lesson_progress.xp_earned`, used only for the A1/A2 beginner track) — different feature, out of scope.
- Not changing `streak_days` logic — it stays independent of mission completion, as it is today.
- Not adding a mission-history/calendar view. Only "today's mission" is in scope.

## Data model

### Migration: `daily_missions_log`

Today, a row in `daily_missions_log` is only ever inserted at *completion* time (`completed_at timestamptz NOT NULL DEFAULT now()`), and only stores `mission_key` — the title/description are recomputed from the static list on every read. Since missions become AI-generated per day, the generated content must be persisted the moment it's generated (before completion), so every reader that day sees the same mission. This requires `completed_at` to become nullable.

```sql
-- supabase/migrations/20260711000001_daily_mission_ai.sql

ALTER TABLE public.daily_missions_log
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT;

ALTER TABLE public.daily_missions_log
  ADD COLUMN IF NOT EXISTS title_pt text,
  ADD COLUMN IF NOT EXISTS description_pt text;

-- Backfill NOT NULL after adding: existing rows are completion-only records
-- from the old static-mission system, so backfill from mission_key as a
-- readable placeholder rather than leaving them null.
UPDATE public.daily_missions_log SET title_pt = mission_key WHERE title_pt IS NULL;
UPDATE public.daily_missions_log SET description_pt = mission_key WHERE description_pt IS NULL;

ALTER TABLE public.daily_missions_log
  ALTER COLUMN title_pt SET NOT NULL,
  ALTER COLUMN description_pt SET NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS missions_completed_count integer NOT NULL DEFAULT 0;
```

No RLS changes needed — `daily_missions_log`'s existing `own rows` policy and `users`' existing self-policy already cover the new columns.

## Mission generation

`lib/missions.ts` drops `MISSIONS_BY_LEVEL` / `getMissionForDate` in favor of:

```typescript
export interface DailyMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
  completed: boolean
}

export async function getOrGenerateTodaysMission(
  userId: string,
  supabase: SupabaseClient,
): Promise<DailyMission>
```

Behavior:
1. Compute today's date string using the existing Brazil-offset convention (`new Date(Date.now() - 3*60*60*1000).toISOString().slice(0,10)`, same as `finalize`/`report`/the old `getMissionForDate` callers).
2. `select * from daily_missions_log where user_id = userId and date = today`. If a row exists, return it mapped to `DailyMission` (`completed = !!completed_at`).
3. If no row exists: call `getStudentContext(userId, supabase)` (existing, unchanged — `lib/student-context.ts`) and prompt `gpt-4o-mini` (JSON mode, same style as `app/api/lesson/generate/route.ts`) for a short daily speaking mission: a `title_pt` (≤5 words), a `description_pt` (one sentence, imperative, e.g. "Fale sobre..."), a `mission_key` (short kebab-case slug), tailored to the student's CEFR level, goal, frequent errors, and topics not yet covered. Also derive `minUserTurns` in code (not from the AI) from CEFR level, reusing the same tiering the old static list used: A1 → 3, A2 → 4, B1 → 5, B2 → 6, C1 → 8, C2 → 8. Insert the row (`user_id`, `date`, `mission_key`, `title_pt`, `description_pt`; `completed_at` stays null), return it as `completed: false`.
4. On AI failure (network/parse error), fall back to one hardcoded mission per CEFR level (trimmed from the current 18 down to 6 — one per level, reused only as an emergency fallback, not the primary content source), insert that instead so the day is still consistent if re-requested, and return it.

This function is the single source of truth for "today's mission" — every caller below uses it instead of touching `daily_missions_log` directly for reads.

### `GET /api/mission` (repurposed)

This route exists today (`app/api/mission/route.ts`) but is dead code — no component calls it. It becomes the read endpoint for `MissionCard`:

```typescript
export async function GET() {
  // auth check (unchanged pattern)
  const mission = await getOrGenerateTodaysMission(user.id, supabase)
  return NextResponse.json({ mission })
}
```

Response shape: `{ mission: DailyMission }` (see interface above — already includes `completed`).

## Starting a mission-focused lesson

### `POST /api/mission/start` (new)

Mirrors the session-creation pattern already used by `app/api/lesson/generate/route.ts`:

1. Auth check.
2. Load `users.teacher_id`, `users.cefr_level`. 404 if no teacher assigned (same as `/api/lesson/generate`).
3. `mission = await getOrGenerateTodaysMission(user.id, supabase)`.
4. Close any dangling open session for this user+teacher (`update sessions set ended_at = now() where user_id = ... and teacher_id = ... and ended_at is null`) — same line `/api/lesson/generate` already runs, prevents `GET /api/session` from resolving to a stale session instead of the new one.
5. Insert a new `sessions` row with `mode: 'daily'`, `topic: mission.missionKey`, `lesson_topic_id: mission.missionKey`, and `lesson_plan_json` built from the mission:
   ```typescript
   {
     title_pt: mission.titlePt,
     objective_pt: mission.descriptionPt,
     teacher_greeting: `Today's mission: ${mission.descriptionPt}. Let's work on that together!`,
     lesson_instructions: `Guide the student toward accomplishing this mission during the conversation: "${mission.descriptionPt}". Don't announce the mission mechanically — weave it naturally into the conversation.`,
     vocabulary_focus: [],
   }
   ```
   (`app/api/conversation/route.ts` already reads `session.lesson_plan_json` to build the system prompt — no changes needed there.)
6. Return `{ session_id: newSession.id }`.

The client (`MissionCard`) calls this, then `router.push('/aula')`. No changes needed to `useSession`/`AulaClient` — `GET /api/session` already resolves to "the most recent session for this teacher with `ended_at is null`", which will be the one just created.

## Completion verification and reward

### Why this moves out of `finalize`

`hooks/useSession.ts`'s `endSession()` (`hooks/useSession.ts:262-264`) fires `POST /api/session/[id]/finalize` with `keepalive: true` and does **not** await it. `app/aula/AulaClient.tsx`'s `handleEnd()` (`app/aula/AulaClient.tsx:221-228`) awaits `endSession()` and then immediately fetches `/report` and `/assess` in parallel. Today this race is harmless because the old mission-completion check in `finalize` is a cheap, optimistic turn-count comparison that `report` *also* re-derives independently and optimistically (`app/api/session/[id]/report/route.ts:51`). Once completion requires an LLM judgment call, that duplication stops being safe — whichever of `finalize`/`report` runs the check first would either miss the DB write the other made, or double-run the (paid) AI call.

Resolution: move the mission-verification logic entirely into `/report`, since `handleEnd()` already awaits it synchronously before rendering `SessionReport` — this guarantees correctness with no new latency added to `endSession()` itself. `finalize` drops mission-handling entirely and goes back to just session-memory generation + streak update.

### `app/api/session/[id]/report/route.ts` (rewritten)

Replace the current mission block (lines 47-51 today) with:

1. `mission = await getOrGenerateTodaysMission(user.id, supabase)`.
2. If `mission.completed` is already `true` (completed earlier today via a different session), skip straight to reporting it completed — no AI call.
3. Else if `userMessages < mission.minUserTurns`: not completed, no AI call (cheap floor, avoids paying for a judgment call on a two-line exchange).
4. Else: call `gpt-4o-mini` (JSON mode) with the session's transcript (already loaded via `messages` in this route) and the mission's `description_pt`, asking `{"covered": boolean}` — "did this conversation actually address the mission?". On success with `covered: true`: `upsert` `daily_missions_log` setting `completed_at = now()` for today's row (the row already exists from generation — this is an `update`, keyed on `user_id, date`), and `increment` `users.missions_completed_count` by 1 via a small `increment_missions_completed(p_user_id uuid)` SQL function (same atomic-increment pattern as `increment_topic_progress` in `supabase/migrations/20260708000001_pedagogy_engine.sql:24-37`, avoiding a read-modify-write race). On AI failure: treat as not completed for this call (student can complete it in a later session today — `getOrGenerateTodaysMission` will still return the same mission since the row persists).
5. Response gains no new top-level fields — `missionCompleted` and `missionTitle` (now `mission.titlePt`) keep their existing shape so `SessionReport` needs no prop changes.

### New migration addition: atomic increment function

Add to the same migration file as the schema changes above:

```sql
CREATE OR REPLACE FUNCTION increment_missions_completed(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users SET missions_completed_count = missions_completed_count + 1 WHERE id = p_user_id;
$$;
```

### `app/api/session/[id]/finalize/route.ts`

Delete step 3 (lines 101-114 today: the `getMissionForDate` import and the turn-count completion block) entirely. Steps 1 (session memory) and 2 (streak) are unchanged.

## UI

### `components/dashboard/MissionCard.tsx` (rewritten)

Currently a pure presentational component receiving `titlePt`/`descriptionPt`/`completed` as props. Becomes self-fetching (it's already `'use client'`):

- On mount, `fetch('/api/mission')`, store `{ mission, loading }` in state.
- Loading state: a small skeleton/pulse placeholder matching the card's dimensions (avoid layout shift).
- Loaded, not completed: current title/description styling, plus a new button "Começar aula focada →" that on click: sets a local `starting` state, `POST /api/mission/start`, reads `{ session_id }`, `router.push('/aula')` (Next.js `useRouter`). On failure, show an inline error and re-enable the button (don't silently fail).
- Loaded, completed: current green "completed" styling, no button (nothing to start — already done today).

Props are dropped entirely — `<MissionCard />` takes no props.

### `app/dashboard/page.tsx`

Remove: the `getMissionForDate` import, the `mission`/`missionCompleted`/`missionLog` computation (today at roughly lines 87-94, 136-137), and stop passing props to `MissionCard` — render `<MissionCard />` bare. This is a net simplification of the file (removes one more inline query + computed variables).

### Mission counter badge

A small new component `components/dashboard/MissionCounterBadge.tsx`, visually consistent with `StreakBadge`/`PronunciationScoreCard`: "🎯 {missions_completed_count} missões cumpridas" in the same `rounded-xl bg-surface-light-card dark:bg-surface-dark-card` card style, reading `users.missions_completed_count` (already fetched as part of the existing `select('*')` on `users` in `app/dashboard/page.tsx` — no new query needed). Rendered directly below `<PronunciationScoreCard />` (which itself sits below `<StreakBadge />`) and above the VIP/demo-status block — grouping the three small stat cards together at the top of the dashboard. Renders nothing when `missions_completed_count === 0` (same "don't show an empty stat" precedent as `ProgressMemoryCard`).

## Testing

- `lib/missions.ts`: `getOrGenerateTodaysMission` — returns existing row when one exists for today (no AI call made); generates + inserts + returns when none exists; falls back to the static per-level mission and still inserts a row when the AI call throws or returns unparseable JSON. Mock OpenAI and Supabase following `__tests__/lib/tts.test.ts` / `__tests__/lib/did.test.ts` conventions.
- `app/api/mission/route.ts` (GET): thin wrapper — one test confirming it calls `getOrGenerateTodaysMission` and returns its result as `{ mission }`.
- `app/api/mission/start/route.ts` (POST, new): closes a dangling open session before creating the new one; new session has `lesson_plan_json.objective_pt` equal to the mission's `description_pt`; 404 when user has no `teacher_id`. Follow the mocking style of `__tests__/app/api/conversation.test.ts` (`vi.mock('@supabase/ssr', ...)`, hoisted mock fns).
- `app/api/session/[id]/report/route.ts`: three cases — (a) `userMessages < minUserTurns` → not completed, no OpenAI call made (assert the mock wasn't called); (b) enough turns but AI returns `covered: false` → not completed, no DB write; (c) enough turns and AI returns `covered: true` → `completed_at` upserted and `increment_missions_completed` RPC called exactly once. Also: mission already completed earlier today → report reflects completed with zero new OpenAI calls.
- `app/api/session/[id]/finalize/route.ts`: existing tests for memory generation and streak should be unaffected; remove/update any existing test assertions that reference the now-deleted mission-completion step in this file.
- `components/dashboard/MissionCard.tsx`: loading state renders; not-completed state renders title/description/button; completed state renders no button; clicking the button calls `POST /api/mission/start` and navigates (mock `next/navigation`'s `useRouter`).

## Rollout

Requires the migration above (`daily_missions_log` schema change + `users.missions_completed_count` + the increment function). Existing `daily_missions_log` rows (old completion-only records) are backfilled with `title_pt`/`description_pt` from `mission_key` so the `NOT NULL` constraint can be added safely — those old rows are historical and never re-displayed as "today's mission" (a new day always queries by today's date). No feature flag needed: this replaces the mission system in place, ships as one plan.
