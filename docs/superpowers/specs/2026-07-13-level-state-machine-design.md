# Nivelamento Inteligente — Level State Machine Design Spec

**Source:** user-provided product spec ("NIVELAMENTO INTELIGENTE" / "CONFIRMAÇÃO DO NIVELAMENTO" / "REVISÃO DE NÍVEL" / "MODO REFORÇO" sections). The spec also included "AJUSTE AUTOMÁTICO DA DIFICULDADE" (in-lesson real-time adaptation), which is a separate, independently shippable mechanism and is **out of scope** for this doc — to be designed in its own spec.

## Problem

Today `users.cefr_level` is a single value that gets written once by `/api/placement/complete` right after the full placement test at `/nivelamento` (`PlacementTestEngine` → `PlacementDiagnosticReport`), and never changes automatically. There is:

- No distinction between a *recommended* level and a *confirmed* one — the diagnostic report writes `cefr_level` immediately and the only action is "Começar as aulas →".
- No monitoring of whether the assigned level is actually a good fit once lessons start.
- No way for a student to say "this is too hard, put me back a level" — manually or automatically.
- No "reinforcement mode" concept: if a student ever needed to study a lower level again, there's no way to track that they're temporarily there while preserving their real level and history.

Existing infrastructure this design reuses rather than duplicates:
- `topic_assessments` (migration `20260708000002_mastery_system.sql`) already scores each completed lesson across speaking/listening/pronunciation/vocabulary/grammar/confidence/fluency, and `lib/mastery.ts`'s `checkPassed()` already computes a `passed` boolean + `failedCompetencies` from those scores.
- `user_topic_progress.mastery_status` (`learning` / `mastered` / `reviewing` / `needs_reinforcement`) already tracks per-topic mastery.
- `lib/topics.ts`'s `TOPICS_BY_LEVEL` already defines a fixed curriculum (8 topics per CEFR level) used by `pickTopic()`/`getTopicsForLevel()`.

## Goal

Turn the placement test's output into a *recommendation* the student can accept or downgrade (never upgrade), monitor the first 5 lessons at a new level to catch a bad fit early, and let students move down a level manually at any time — all while keeping full history and letting them return automatically once they've re-proven the lower level.

## Non-goals

- **In-lesson real-time difficulty adaptation** (speech speed, more translations/examples, simplified dialogues) — separate spec, uses different signals (mid-session, not per-lesson-assessment).
- **Automatic promotion to a higher level** (e.g. A2 → B1 when the system judges sufficient mastery) — explicitly deferred to a future spec. This design only ever moves `cefr_level` *down* or back up to a previously-earned level via reinforcement auto-return; it never advances a student past the level they were placed/confirmed at.
- **The signup-time quick guess** (`app/cadastro/nivelamento` MCQ + `app/cadastro/conversa` 45s recording, combined in `app/cadastro/professor`) is untouched. It only exists to pick a teacher/tone before the real test; the recommend-and-choose flow applies only to the authoritative test at `/nivelamento`.
- No changes to `topic_assessments` scoring weights or thresholds (`OVERALL_MIN_SCORE`, `ESSENTIAL_MIN_SCORE`) — reused as-is.

## Data model

### Migration: `level_state_machine`

```sql
-- supabase/migrations/20260714000001_level_state_machine.sql

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

`reinforcement_target_level` is non-null exactly while a student is in reinforcement mode. `confirmation_suggestion_dismissed` tracks whether the student closed Flow 2's banner for the current confirmation window; it's reset to `false` every time `level_confirmed_at` is updated (new placement, manual downgrade, suggestion accepted, or reinforcement auto-return), since each of those starts a fresh window. `cefr_level` itself always holds the level currently being studied (so `pickTopic()`, `getTopicsForLevel()`, and every other existing reader of `cefr_level` keep working unmodified, including during reinforcement).

`lib/mastery.ts` (or a new `lib/levels.ts`) gains:

```ts
export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export function levelBelow(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx > 0 ? CEFR_ORDER[idx - 1] : null
}
```

## Flow 1 — Nivelamento inteligente (placement recommendation)

`/api/placement/complete` stops writing `users.cefr_level` / `level_confirmed_at`. It still computes and persists the `placement_results` + `learning_plans` rows (diagnostic data), and returns the recommended `cefr_level` as before — the diagnosis itself is unchanged.

`PlacementDiagnosticReport` (`components/placement/PlacementDiagnosticReport.tsx`) gains a level-choice step, replacing the current single "Começar as aulas →" button:

- Headline: **"Seu nível estimado é {cefr_level}."**
- Primary button: **"Começar no {cefr_level}"** (visually emphasized — recommended path).
- Secondary control: **"Prefiro começar mais fácil"**, which expands a list built from `CEFR_ORDER` of every level *strictly below* the recommendation (e.g. recommendation B1 → shows A1, A2 only). Never renders anything at or above the recommended level.

New endpoint `POST /api/placement/confirm-level` (called with the chosen level, defaulting to the recommendation if the student didn't downgrade):
1. Validates the chosen level is either the recommended level or `CEFR_ORDER`-below it (rejects attempts to pick equal/above via tampered requests).
2. Writes `users.cefr_level`, `users.level_confirmed_at = now()`.
3. Inserts a `level_history` row: `reason = 'placement_recommended'` if the student accepted the recommendation, `'placement_chose_lower'` otherwise (`from_level = null` since this is the first level ever assigned to this account).

`PlacementTestEngine`'s `done` state now waits for this choice before calling `onContinue` → `/dashboard`.

## Flow 2 — Confirmação do nivelamento (first 5 lessons)

**Signal:** `topic_assessments` rows for the user with `created_at >= users.level_confirmed_at`, in creation order. No new scoring — reuses `checkPassed()`'s existing `passed` boolean per row.

**Trigger:** evaluated server-side whenever a new `topic_assessments` row is inserted for the user during the confirmation window (first 5 rows since `level_confirmed_at`). As soon as it's mathematically decided that the student cannot pass at least 3 of the first 5 (i.e. 3 failures have already occurred, checkable from as few as 3 rows), a suggestion becomes active. If 5 rows pass without 3 failures accumulating, the window closes with no action — `level_confirmed_at` already marks the level as having started; there's no separate "confirmed" event to write.

**Surfacing:** a dismissible server-rendered card on `/dashboard` (same visual pattern as `DemoStatusCard`), shown only while the window is open and the trigger condition holds and it hasn't already been dismissed this window (`users.confirmation_suggestion_dismissed boolean DEFAULT false`, reset to `false` whenever `level_confirmed_at` changes):

> "Notamos que o {cefr_level} está sendo desafiador. Quer revisar o {levelBelow(cefr_level)} antes de continuar?"
> **[Revisar {levelBelow(cefr_level)}]** · **[Continuar no {cefr_level}]**

- "Revisar" calls the same downgrade path as Flow 3 (`reason = 'confirmation_suggestion_accepted'`).
- "Continuar" sets `confirmation_suggestion_dismissed = true`; the card does not reappear for the rest of this confirmation window (it does not re-nag on lesson 4, 5, etc., and does not resurface later at this same level).

## Flow 3 — Revisão de nível manual + Modo reforço + Retorno automático

**Manual downgrade UI:** new "Nível" card in `app/perfil/`, showing the current level and a button **"Estudar um nível abaixo"**, enabled only when `levelBelow(cefr_level)` is non-null. Clicking opens a confirmation dialog ("Seu progresso será mantido — você vai reforçar o {levelBelow} antes de voltar ao {cefr_level}.") before committing. No UI anywhere ever offers moving *up* a level.

**Shared downgrade function** (`lib/levels.ts`, called by both the profile action and Flow 2's "Revisar" button):

```ts
async function downgradeLevel(supabase, userId: string, currentLevel: CefrLevel, reason: LevelHistoryReason) {
  const target = levelBelow(currentLevel)
  if (!target) return // A1 has no level below; button/suggestion should already be hidden

  const { data: user } = await supabase.from('users').select('reinforcement_target_level').eq('id', userId).single()

  await supabase.from('users').update({
    cefr_level: target,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
    reinforcement_target_level: user?.reinforcement_target_level ?? currentLevel,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId, from_level: currentLevel, to_level: target, reason,
  })
}
```

Note `reinforcement_target_level` is only set if not already set — a student who downgrades twice in a row (e.g. B1 → A2 → A1) keeps their *original* target (B1), not the intermediate one, so auto-return takes them all the way back to where they actually were.

Setting `level_confirmed_at = now()` on downgrade also means Flow 2's confirmation window re-opens at the new (lower) level — consistent, since it's a fresh level assignment from the student's perspective.

**Reinforcement mode display:** while `reinforcement_target_level IS NOT NULL`, the profile's "Nível" card shows:

```
Nível atual: A2
Modo de estudo: Reforçando conteúdos do A1
```

No other part of the app needs to branch on reinforcement mode — `cefr_level` already holds A1, so the lesson engine, topic picker, and dashboard all behave exactly as if the student's real level were A1.

**Automatic return:** after each `topic_assessments` insert (same code path already writing the assessment — likely `app/api/conversation` or wherever lesson completion is finalized), if `users.reinforcement_target_level IS NOT NULL`, check whether every topic in `TOPICS_BY_LEVEL[cefr_level]` (the reinforcement level, currently 8 per level) has `user_topic_progress.mastery_status = 'mastered'` for this user. If so:

1. `cefr_level = reinforcement_target_level`
2. `reinforcement_target_level = null`
3. `level_confirmed_at = now()` (re-opens the 5-lesson confirmation window at the recovered level)
4. `confirmation_suggestion_dismissed = false`
5. Insert `level_history` row: `from_level = <reinforcement level>`, `to_level = reinforcement_target_level`, `reason = 'reinforcement_auto_return'`.

This reuses `user_topic_progress`/`mastery_status` exactly as it exists today — no new "essential topics" flag, since every topic currently in `TOPICS_BY_LEVEL` is core curriculum.

## Testing

- Unit: `levelBelow()`/`CEFR_ORDER` boundary (A1 → null, C2 → B2); `downgradeLevel()` preserves an existing `reinforcement_target_level` across repeated downgrades.
- Integration: placement → confirm-level rejects a level at/above the recommendation; confirmation-window trigger fires at exactly 3 failures out of the first 3–5 assessments and not before; auto-return fires only when *all* topics of the reinforcement level are mastered, not a subset.
- Manual: full loop — take placement test, choose a lower level, fail lessons deliberately to trigger the Flow 2 suggestion banner, accept it, verify profile shows "Reforçando conteúdos do X", complete all topics of the lower level, verify auto-return and that the 5-lesson window reopens.
