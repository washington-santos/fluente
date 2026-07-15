# Promoção Automática de Nível — Design Spec

**Source:** item #3 of the 5-item pedagogical improvement list identified after reviewing the shipped level state machine. Items #1 (in-lesson adaptive difficulty) and #2 (explicit grammar teaching) are already shipped. Items #4 (dedicated listening exercises) and #5 (phoneme-level pronunciation feedback) are separate future specs.

This also completes the "REVISÃO DE NÍVEL" section of the original level-state-machine spec, which explicitly deferred it: *"A evolução para níveis superiores deve acontecer apenas quando o sistema confirmar domínio suficiente."*

## Problem

`users.cefr_level` currently only ever moves down (manual downgrade, a suggested downgrade after struggling, or never at all) or back up to a previously-earned level via reinforcement recovery (`checkAndApplyReinforcementReturn()`, `lib/levels.ts`). There is no path for a student who has genuinely mastered their current level to advance to the next one on their own merit — they're stuck until a human (or a future retake of the full placement test) manually changes their level. A strong student who has mastered everything at B1 stays at B1 indefinitely.

Investigation confirmed the reinforcement-recovery mechanism this feature will mirror is genuinely live on the primary lesson path today, not orphaned: the structured lesson engine (`components/lesson/LessonEngine.tsx`) doesn't write `user_topic_progress.mastery_status` itself, but its `onComplete` is wired (via `app/aula/AulaClient.tsx:247-271`'s `handleEnd`) to the same `POST /api/session/[id]/assess` call the older conversational flow uses — and that route is where `mastery_status` actually gets upserted and where `checkAndApplyReinforcementReturn()` already runs after every lesson, structured or not.

## Goal

When a student has mastered every topic at their current CEFR level (and isn't currently in reinforcement mode), automatically promote them to the next level, record the transition, and celebrate it in the session report shown right after the lesson that triggered it.

## Non-goals

- **No change to `placement_results` or `learning_plans`.** Those remain historical diagnostic records from the original placement test; `users.cefr_level` is the single live source of truth for current level, exactly as manual downgrade and reinforcement recovery already treat it.
- **Promotion never fires while `reinforcement_target_level` is set.** A student currently reinforcing a lower level is, by definition, below their real level — the reinforcement-recovery flow (already shipped) is responsible for getting them back to `reinforcement_target_level`. Promotion only evaluates when a student is at their confirmed, non-reinforcing level.
- **No new/different mastery bar.** Reuses the exact same "every topic of the level has `mastery_status = 'mastered'` in `user_topic_progress`" check `checkAndApplyReinforcementReturn()` already uses — just evaluated against the current level looking upward instead of a reinforcement level looking back to a stored target.
- **No email or push notification.** The only celebration surface is the in-app session report shown immediately after the triggering lesson.
- **C2 has no promotion path** (nothing above it) — handled naturally by `levelAbove('C2')` returning `null`.

## Data model

### Migration

`level_history.reason` currently has a `CHECK` constraint listing five allowed values (`placement_recommended`, `placement_chose_lower`, `confirmation_suggestion_accepted`, `manual_downgrade`, `reinforcement_auto_return`). It needs a sixth: `auto_promotion`.

```sql
ALTER TABLE level_history DROP CONSTRAINT IF EXISTS level_history_reason_check;
ALTER TABLE level_history ADD CONSTRAINT level_history_reason_check CHECK (reason IN (
  'placement_recommended',
  'placement_chose_lower',
  'confirmation_suggestion_accepted',
  'manual_downgrade',
  'reinforcement_auto_return',
  'auto_promotion'
));
```

(The exact constraint name should be confirmed against the live schema when writing the implementation plan — Postgres's default naming for an inline `CHECK` is `<table>_<column>_check`, but this should be verified via the Supabase advisor/schema inspection rather than assumed.)

No other schema changes. `users.cefr_level`/`level_confirmed_at`/`confirmation_suggestion_dismissed` are reused as-is — promotion writes to the same columns downgrade and reinforcement-return already write to.

### `lib/levels.ts`

New function, symmetric to the existing `levelBelow()`:

```ts
export function levelAbove(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx < CEFR_ORDER.length - 1 ? CEFR_ORDER[idx + 1] : null
}
```

## Detection and promotion

New function `checkAndApplyLevelPromotion(supabase, userId)` in `lib/levels.ts`, structurally a mirror of the existing `checkAndApplyReinforcementReturn()`:

1. Fetch `users.cefr_level, reinforcement_target_level`.
2. If `reinforcement_target_level` is not `null` (student is reinforcing), return `null` immediately — promotion is mutually exclusive with reinforcement recovery.
3. Compute `target = levelAbove(cefrLevel)`. If `null` (already at C2), return `null`.
4. Fetch `getTopicsForLevel(cefrLevel)` and the student's `user_topic_progress` rows for that level (same query shape `checkAndApplyReinforcementReturn()` already uses). If any topic isn't `mastery_status = 'mastered'`, return `null`.
5. All mastered — promote:
   - `users` update: `cefr_level = target`, `level_confirmed_at = now()`, `confirmation_suggestion_dismissed = false`.
   - Insert into `level_history`: `from_level = cefrLevel`, `to_level = target`, `reason = 'auto_promotion'`.
6. Return `target` (the new level), so the caller can report it upward — unlike `checkAndApplyReinforcementReturn()`, whose return value isn't currently consumed by its caller, this one's return value is what drives the celebration banner.

Setting `level_confirmed_at = now()` also re-opens the 5-lesson confirmation window (from the already-shipped level state machine) at the new, higher level — consistent with how every other level transition already resets that window.

## Wiring

`app/api/session/[id]/assess/route.ts` already calls `checkAndApplyReinforcementReturn(supabase, user.id)` after the `topic_assessments`/`user_topic_progress` writes. Right after that call, add:

```ts
const promotedTo = await checkAndApplyLevelPromotion(supabase, user.id)
```

Since the two functions are mutually exclusive by construction (one requires `reinforcement_target_level` to be set, the other requires it to be `null`), calling both unconditionally on every assess is safe — at most one will ever do anything on a given call.

The route's JSON response gains one new optional field:

```ts
level_promotion: promotedTo ? { from: cefrLevel, to: promotedTo } : null
```

(`cefrLevel` here is the value already loaded earlier in the route for the assessment prompt — the level the student was AT during this lesson, before any promotion this same call might apply.)

## Celebration UI

`app/aula/AulaClient.tsx`'s `handleEnd()` already captures the full `/api/session/[id]/assess` response into local state (`assessment`) before showing `SessionReport`. It's extended to also capture `level_promotion` into a sibling field on `reportData`.

`components/aula/SessionReport.tsx` gains a new optional prop:

```ts
levelPromotion?: { from: CefrLevel; to: CefrLevel } | null
```

When present, a celebratory banner renders at the very top of the modal, above the existing "Resumo da aula" header:

> 🎉 **Você subiu de nível!**
> Parabéns! Você dominou tudo do {from} e agora está no {to}.

Styled distinctly (e.g. a gradient or brand-accent background) so it reads as a bigger moment than the existing green "🎉 Tópico dominado!" per-topic banner already inside the modal — the two can coexist in the same report (a lesson can both pass its topic AND trigger the level's overall promotion).

## Testing

- Unit: `levelAbove()` boundary cases (C2 → `null`, mid-range levels → next). `checkAndApplyLevelPromotion()` — returns `null` when reinforcing, `null` when not all topics mastered, `null` at C2, and promotes + returns the new level when every topic is mastered (mirroring `checkAndApplyReinforcementReturn()`'s existing test shape).
- Integration: `/api/session/[id]/assess` test confirming `level_promotion` is `null` on an ordinary pass, and populated with the correct `{from, to}` when the mocked `user_topic_progress` shows every topic of the current level mastered.
- Component: `SessionReport` renders the promotion banner when `levelPromotion` is provided, and omits it when `null`/absent.
- Manual: get a test account to `mastery_status = 'mastered'` on every topic of a level (not in reinforcement mode), complete one more lesson, confirm the session report shows the promotion banner and the profile's `LevelCard` reflects the new level afterward.
