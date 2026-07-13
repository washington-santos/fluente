# Structured Pedagogical Lesson Engine — Design Spec

**Roadmap context:** direct response to user request to stop `/aula` from feeling like "free chat with AI" and make every lesson follow a real teaching methodology (review → objective → teach → examples → guided practice → exercises → guided conversation → challenge → assessment → summary → next-day mission). See `[[project_roadmap_vision]]` memory for the broader "personal AI teacher, not a chatbot" product identity this reinforces.

## Problem

Today, starting a topic-based lesson (`StartLessonButton` → `POST /api/lesson/generate` → `/aula`) drops the student straight into unstructured voice/text chat. The system prompt (`app/api/conversation/route.ts:236-251`) *tells* GPT to follow a 4-block "session anatomy" (warm-up → error review → new content → free conversation), but nothing in the UI enforces it — there's no distinct teaching moment, no exercises, no explicit checkpoint before the student is expected to converse. The student experiences one continuous conversation from minute one.

Separately, a complete, tested, **unused** structured-lesson step engine already exists (`/licao/[slug]`, `LessonEngine.tsx`, 7 step types in `components/lesson/`) — built 2026-07-04, then orphaned 2026-07-08 when the dashboard was repointed at `/aula` instead. It has real components for teaching a word (`VocabPresentStep`), drilling pronunciation (`VocabRepeatStep`), multiple-choice checks (`ExerciseChoiceStep`), vocabulary-restricted conversation (`GuidedConvoStep`), and a summary (`SummaryStep`) — but its content is 3 hand-authored static JSON lessons (A1 only: greetings, numbers, colors), and its completion (`/api/lesson/complete`) only computes XP — it never touches the mastery/assessment system that `/aula` already uses (`topic_assessments`, `user_topic_progress`, spaced repetition).

## Goal

Make every topic-based lesson follow an explicit, enforced sequence — review, stated objective, direct teaching with examples, guided practice, varied exercises, vocabulary-restricted guided conversation, a final challenge, AI assessment, a summary, and a next-day mission — by reviving and extending the existing step engine rather than building a new one, and reconciling it with the mastery system that's already live.

## Non-goals

- **Not touching the Daily Mission.** It stays exactly as it is today — a quick, focused free-form conversation (`mode: 'daily'`, `/aula` free-chat UI). It is not restructured into a mini-lesson. See `[[project_supabase_migration_drift]]` for the mission's own recent history — no further schema changes needed there.
- **Not building every exercise type from the request.** V1 ships multiple-choice (already exists, just reactivated) + a new fill-in-the-blank type + listen-and-repeat (already exists as `VocabRepeatStep`). Matching/relacionar, organize-the-sentence, and translation exercises are explicitly deferred to a v2.
- **Not retiring free-form conversation.** It remains available as an explicit "Prática livre" mode, reusing today's `/aula` chat UI unchanged.
- **Not writing new curriculum JSON files.** The 3 existing static A1 lesson JSON files (`content/curriculum/a1/*.json`) and `lib/curriculum.ts` are retired — content generation moves entirely to AI, keyed by the existing `lib/topics.ts` catalog (already covers all 6 CEFR levels).
- **Not changing `selectNextTopic`'s retry/review/next/restart logic, the 7-competency scoring weights, or the spaced-repetition interval ladder** (`lib/mastery.ts`) — this design reuses that engine as-is, it doesn't redesign it.
- **Not adding new exercise-authoring tools/admin UI.** Content is generated per-session, not curated.

## Architecture: one route, branching by session mode

`/aula` (`app/aula/page.tsx` + `AulaClient.tsx`) becomes a container that renders one of two experiences based on the session's `mode`:

- **`mode: 'lesson'`** (new) — topic-based structured lessons. Renders the revived step engine (`LessonEngine`, moved from `/licao/[slug]` into a component `AulaClient` selects between). This is the new default for `StartLessonButton` / the topic map's "start lesson" action.
- **`mode: 'daily'`** (unchanged) or **`mode: 'free'`** (existing enum value, currently unused in practice) — renders today's chat UI unchanged. `'daily'` stays the Daily Mission's mode; `'free'` becomes the explicit "Prática livre" mode, reachable via a new dashboard entry point that calls `POST /api/session` with `{ mode: 'free' }` (the route already accepts a `mode` override, `app/api/session/route.ts:52`).

No new routes, no redirects to rewrite — every existing link (`StartLessonButton`, dashboard CTAs, `MissionCard`'s "Começar aula focada") keeps pointing at `/aula`; only what the session *contains* changes what renders.

`/licao/[slug]` and `lib/curriculum.ts` are deleted once the engine is migrated — static-slug-based lessons are superseded by session-based generation (a lesson is now tied to a `sessions` row, like everything else in the app, not a fixed content file).

**Migration:** add `'lesson'` to the `sessions.mode` CHECK constraint.

```sql
-- supabase/migrations/20260713000001_lesson_engine_mode.sql
ALTER TABLE public.sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_mode_check
  CHECK (mode in ('guided','scenario','free','daily','lesson'));
```

## Content generation: one GPT call produces the full step sequence

`app/api/lesson/generate/route.ts` keeps `selectNextTopic` (unchanged — retry/review/next/restart) but its prompt is replaced: instead of returning a flat `{title_pt, objective_pt, teacher_greeting, lesson_instructions, vocabulary_focus}`, it now returns a full step sequence matching (an extended) `LessonContent` shape from `types/lesson.ts`:

```typescript
interface GeneratedLesson {
  title_pt: string
  objective_pt: string          // shown in the new intro/objective moment
  why_it_matters_pt: string      // new — "quando usar / por que importa"
  vocabulary: VocabItem[]        // 3-6 items, shape unchanged (word/translation_pt/emoji/pronunciation_hint)
  steps: LessonStep[]            // see "New step types" below for the two additions
}
```

The prompt (built the same way as today's, reusing `getStudentContext`, `retryNote`/`isReview` framing, frequent-errors injection) asks GPT to produce, in order: one `warmup_review` step (only when `context.recentSessionSummary`/`frequentErrors` exist — skipped for a student's very first lesson), one `intro` step, one `vocab_present` + one `exercise_choice` or `exercise_fill_blank` per vocabulary item (alternating exercise type for variety), one `vocab_repeat` for pronunciation practice, one `guided_convo` (restricted to `vocabulary_focus`, `min_exchanges` tuned by level — see below), one final `guided_convo` marked as the **challenge** (harder instruction, e.g. "combine everything you learned into one full exchange"; distinguished from the practice one via a new optional `is_challenge?: boolean` field on `GuidedConvoStep`, not a new step type), and one `summary` step. Fallback on AI failure: a minimal 5-step lesson (intro → one vocab_present → one exercise_choice → one guided_convo → summary) built from `topic.objectivesPt`/`topic.starterPhrase`, mirroring today's fallback pattern (`app/api/lesson/generate/route.ts:130-139`).

This is generated fresh every time a lesson starts — no caching, no static content — which is what gives "never repeat the same lesson" for free, the same way every other AI-generated surface in this app (mission descriptions, session replies) already varies naturally per call.

The generated `GeneratedLesson` is stored on the session (`sessions.lesson_plan_json`, reusing the existing column — its shape is already untyped `Record<string, unknown>` at the DB level) instead of the flatter shape used today. `app/api/conversation/route.ts`'s reading of `lesson_plan_json` is untouched — that code path only runs for `mode: 'daily'`/`'free'` sessions, which keep the old flat shape (the Daily Mission's `lesson_plan_json` shape, `app/api/mission/start/route.ts`, is unaffected).

## New step types

Two additions to `types/lesson.ts`'s `LessonStep` union — everything else (`intro`, `vocab_present`, `vocab_repeat`, `exercise_choice`, `guided_convo`, `review`, `summary`) is reused unchanged:

**`warmup_review`** (new component `components/lesson/WarmupReviewStep.tsx`) — phase 1. Shown before `intro`, only when there's prior-session content to review. Displays: last session's summary sentence, up to 3 frequent errors (word/correction pairs, same data `errors_log`/`getStudentContext` already surfaces), and up to 3 recently-learned vocabulary words (`vocab_log` — already exists and is already populated by every `/aula` conversation turn, `app/api/conversation/route.ts:365-375`). Pure "continue" CTA, no interaction/scoring — a fast (~2 min) recap, not a quiz.

Note: a separate table, `user_word_mastery` (from the same orphaned 2026-07-04 migration as `/licao`), already models per-word spaced repetition (`next_review_at`, `mastered`, `correct_count`) — but its `lesson_slug` column is a foreign key into the static `lessons` table this design retires, and nothing populates it today. Wiring real word-level spaced review is worth doing later (decouple `user_word_mastery` from `lesson_slug`, populate it from `vocab_repeat` results) but is out of scope here — `vocab_log` (simple recency, no mastery tracking) is enough for a warm-up recap.

**`exercise_fill_blank`** (new component `components/lesson/ExerciseFillBlankStep.tsx`) — phase 6 (interactive exercises), alternated with `exercise_choice` for variety. Shape:
```typescript
interface ExerciseFillBlankStep {
  id: string
  type: 'exercise_fill_blank'
  sentence_pt_hint: string   // Portuguese translation shown as a hint
  sentence_with_blank: string // "My ___ is John." — blank marked with ___
  correct_answer: string
  explanation_pt: string
}
```
Text input (not multiple choice) compared case-insensitively against `correct_answer`, immediate inline correct/incorrect feedback + `explanation_pt`, same visual language as `ExerciseChoiceStep` (correct = green border, incorrect = red + reveal correct answer, matching existing component's styling conventions).

**Examples (phase 4)** are *not* a separate step — `VocabPresentStep`'s `teacher_script` field already carries freeform text; the generation prompt is instructed to always include "word → Portuguese translation → one example sentence in English → its translation" in that script, so no new component is needed.

**Challenge (phase 8)** is not a separate step — the second `guided_convo` per lesson carries `is_challenge: true`, which `GuidedConvoStep` renders with a distinct header ("🏆 Desafio final") and a harder `instruction_pt`, reusing all existing conversation/recording/replay logic unchanged.

## Reconciling assessment: `GuidedConvoStep` must persist to `messages`

Today `GuidedConvoStep` keeps its conversation in local component state only and scores each turn via a separate per-turn endpoint (`POST /api/lesson/assess`, correctness-only, not the 7-competency scorer). This must change for assessment unification to work: `GuidedConvoStep` (both the practice and challenge instances) starts writing each exchange to the `messages` table under the lesson's `session_id`, the same way `/api/conversation` already does for `/aula` — reusing that route directly (it already returns `reply_pt`/`suggested_replies` fine-grained data `GuidedConvoStep` doesn't currently use but can ignore) rather than maintaining a second, parallel conversation endpoint. `POST /api/lesson/assess` (the old per-turn correctness check) is retired along with the static-JSON `/licao` engine — `/api/conversation`'s existing per-turn GPT correction/pronunciation-hint logic already covers "is this right, and if not, gently correct it," which is what that route was doing at a lower fidelity.

Lesson completion (last step advances past `summary`) calls `POST /api/session/[id]/assess` — completely unchanged (`app/api/session/[id]/assess/route.ts`), reading the now-populated `messages` table for the session, scoring the same 7 competencies, upserting `topic_assessments`/`user_topic_progress`, and advancing spaced repetition exactly as it does for `/aula` today. `/api/lesson/complete` (XP-only) is deleted — the summary step's XP number comes from `final_score`/`passed` in the assess response instead of the old `vocab_scores` average.

## Level-based tuning

One new config, `lib/lesson-shape.ts`, keyed by `CefrLevel` (same six values used throughout the app), read by both the generation prompt (`/api/lesson/generate`) and the step components:

```typescript
interface LessonShape {
  vocabCount: number              // A1: 3 → C2: 6
  translationDefaultVisible: boolean  // A1/A2: true, B1+: false (behind "Ver tradução")
  minExchangesPractice: number    // guided_convo (practice instance)
  minExchangesChallenge: number   // guided_convo (challenge instance) — always > practice
  exerciseWeight: 'heavy' | 'balanced' | 'light' // A1/A2 heavy, B1/B2 balanced, C1/C2 light
}
```
This is the same pattern already established by `MIN_USER_TURNS_BY_LEVEL` (`lib/missions.ts`) and `METHODOLOGY_INSTRUCTIONS` (`lib/mastery.ts`) — a per-level lookup table, not per-level code branches. `exerciseWeight` controls how many `exercise_choice`/`exercise_fill_blank` steps the generation prompt asks for per vocab item (heavy = one each, light = one exercise total, skip-per-word) — this is what makes A1 "muito exercício, pouca conversação" and C2 "conversação totalmente natural" without forking the generator itself.

## UI touch points

- **`components/lesson/StartLessonButton.tsx`**: no change needed — already calls `/api/lesson/generate` then `router.push('/aula')`; the session it creates now has `mode: 'lesson'` instead of `'daily'` (one-line change in the route), and `/aula` picks the right renderer automatically.
- **New "Prática livre" entry point**: a small new card/button on the dashboard that `POST /api/session { mode: 'free' }` then `router.push('/aula')` — same shape as `StartLessonButton`, different mode. Exact placement on the dashboard is an implementation-plan detail (dashboard layout may have shifted by the time this is built).
- **`app/aula/AulaClient.tsx`**: gains a branch at the top — if `session.mode === 'lesson'`, render the (relocated) `LessonEngine` instead of the existing chat JSX. `useSession` gains a `mode` field read from the session payload.
- **Dashboard topic map** (`app/licoes/page.tsx`): unchanged visually — still shows the CEFR topic map with mastery status; its CTA already routes through `StartLessonButton`.
- **Summary step**: extend `SummaryStep.tsx` to also show today's mission for tomorrow, fetched from the already-existing `getOrGenerateTodaysMission`-adjacent logic (or simply linking to the dashboard's `MissionCard`, which already self-fetches) — small addition, not a new system.

## Testing

Full detail deferred to the implementation plan, but the shape: unit tests for the extended `/api/lesson/generate` prompt/fallback (mock OpenAI, assert step sequence shape and count matches `LessonShape`), `ExerciseFillBlankStep` (correct/incorrect/case-insensitive matching), `WarmupReviewStep` (renders review data, skips when absent), `GuidedConvoStep`'s new message-persistence path (assert it posts to `/api/conversation` and no longer to the retired `/api/lesson/assess`), `LessonEngine`'s final-step transition (asserts it calls `/api/session/[id]/assess` and reads `final_score`/`passed` for the XP/summary display, not the retired `/api/lesson/complete`), and an `AulaClient` mode-branch test (session with `mode: 'lesson'` renders `LessonEngine`, `mode: 'daily'`/`'free'` renders the existing chat).

## Rollout

Single migration (`sessions.mode` CHECK constraint). No feature flag — this replaces the lesson-start experience in place for all levels at once, matching the precedent set by the Daily Mission redesign (`[[project_supabase_migration_drift]]` — remember to actually run `vercel --prod` and apply the migration after merging, both are manual in this project). Given the scope (new generation prompt, two new step components, `GuidedConvoStep` rewrite, assessment reconciliation, mode-branching in `AulaClient`, deletion of `/licao`+`lib/curriculum.ts`+`/api/lesson/complete`+`/api/lesson/assess`), the implementation plan should sequence this as an ordered multi-task plan (same pattern as the Daily Mission's 9-task plan), not a single commit.
