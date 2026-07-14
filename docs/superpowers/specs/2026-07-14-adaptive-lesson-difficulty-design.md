# Ajuste Automático de Dificuldade — Design Spec

**Source:** the "AJUSTE AUTOMÁTICO DA DIFICULDADE" section of the same user-provided pedagogical spec that produced the level state machine (see `docs/superpowers/specs/2026-07-13-level-state-machine-design.md`), explicitly deferred there as out of scope. This is item #1 of a 5-item pedagogical improvement list the user asked for after reviewing the shipped level state machine; the other four (automatic level promotion, explicit grammar teaching, dedicated listening exercises, phoneme-level pronunciation feedback) are separate future specs.

## Problem

`components/lesson/LessonEngine.tsx` is a purely linear step sequencer: the full step array is generated once, up front, by `app/api/lesson/generate/route.ts`, and nothing about its content or pacing changes based on how the student actually performs during the lesson. Concretely:

- `ExerciseChoiceStep` and `ExerciseFillBlankStep` compute `isCorrect` locally for visual feedback, but call their `onSuccess()` callback unconditionally — a wrong answer advances the lesson exactly like a right one, and correctness is never reported to `LessonEngine`.
- `GuidedConvoStep` tracks `exchangeCount` locally (only counting turns without a correction) but discards this the moment the step unmounts; nothing aggregates a "how much correction did this student need" signal across a lesson.
- TTS speech rate is not configurable anywhere in the codebase — `lib/tts.ts`'s `synthesizeTts()` doesn't accept a `speed` parameter, despite OpenAI's TTS API supporting one server-side.
- A `translationDefaultVisible` flag exists in `lib/lesson-shape.ts` seemingly designed to gate translation visibility by CEFR level, but is never read by any component — translations are in fact always shown in `VocabPresentStep` and `GuidedConvoStep` (the latter because the AI prompt in `app/api/conversation/route.ts:281` always requests a `reply_pt` translation). The only place translation is *not* default-visible is `ReviewStep`'s flashcard `revealed` toggle.
- `guided_convo` steps have a fixed `min_exchanges` baked in at generation time, with no mechanism to lower it mid-lesson.
- There is no content generation path at all once a lesson has started — "give another example" or "explain in more detail" would require new content the pre-generated plan doesn't have.

The result: a struggling A1 student gets exactly the same pacing, translation density, dialogue length, and explanation depth as a breezing-through student, for the entire lesson. This directly contradicts the pedagogical goal: "O objetivo é que o aluno nunca se sinta perdido."

## Goal

Detect, during a single guided lesson, when a student is struggling — using signals already available or cheap to add — and once detected, apply six adaptations for the remainder of that lesson: slower speech, more visible translation, simpler/shorter guided dialogue, an extra practice repetition on missed vocabulary, and one auto-generated extra example/explanation per remaining vocabulary step.

## Non-goals

- **Prática Livre (free conversation mode)** is out of scope — it has no structured steps/exercises to measure struggle against; the detection mechanism here is specific to `LessonEngine`'s guided step structure.
- **Reverting out of "struggling mode" within a lesson** is out of scope — once triggered, the simplified mode holds for the rest of that lesson (confirmed with the user: predictability over dynamic re-tightening).
- **No database changes.** Struggle state lives entirely in `LessonEngine`'s React state for the duration of the browser session, matching how the rest of `LessonEngine`'s progress (current step, `vocabScores`) already doesn't survive a page reload.
- **No mid-lesson full regeneration of the lesson plan.** Only two things get new AI-generated content (the extra-example endpoint); everything else is presentation-layer changes to already-generated content, or reuse of already-generated content (the cloned practice step).
- Not touching `getLessonShape()`'s per-CEFR-level defaults (`vocabCount`, base `minExchangesPractice/Challenge`) — those remain the starting point; struggle mode only adjusts downward from whatever that starting point was.

## Detection

New module `lib/adaptive-difficulty.ts`:

```ts
export function shouldEnterStruggleMode(struggleEvents: number): boolean {
  return struggleEvents >= 2
}
```

`LessonEngine` adds state:

```ts
const [struggleEvents, setStruggleEvents] = useState(0)
const [strugglingMode, setStrugglingMode] = useState(false)
```

Every struggle event increments `struggleEvents` via a new `onStruggleEvent()` callback threaded down to the relevant steps; `LessonEngine` re-evaluates `shouldEnterStruggleMode()` after each increment and flips `strugglingMode` to `true` the first time it returns `true` (never back to `false`, per the non-goal above).

Three event sources:

1. **Wrong exercise answer.** `ExerciseChoiceStep.tsx` and `ExerciseFillBlankStep.tsx` currently call `onSuccess()` with no arguments regardless of correctness. Change the prop signature to `onSuccess(isCorrect: boolean)` in both, and have `LessonEngine` call `onStruggleEvent()` when `isCorrect === false`, on top of still advancing the lesson (a wrong answer still doesn't block progress — it just now also counts toward struggle detection).
2. **Vocab repeat exhausted without a good score.** `VocabRepeatStep` already reports a score into `LessonEngine`'s existing `vocabScores` map via `advance(word, score)`. `LessonEngine` checks `score < 60` at that point and calls the same struggle-increment logic — no new prop needed on `VocabRepeatStep` itself.
3. **Guided conversation mostly corrected.** `GuidedConvoStep` tracks `exchangeCount` (successful, uncorrected turns) against `messages` (all turns). Add a `correctionRate` computation before calling `onComplete`, and change `onComplete: () => void` to `onComplete: (correctionRate: number) => void`; `LessonEngine` counts a struggle event when `correctionRate > 0.5`.

## Adaptations

Once `strugglingMode` is `true`, it's passed as a prop to every subsequently-rendered step. Concretely:

1. **Slower speech.** `lib/tts.ts`'s `synthesizeTts(text, voice, speed?)` gains an optional `speed` parameter (default `1.0`), passed straight through to OpenAI's `audio.speech.create({ ..., speed })`. `app/api/lesson/tts/route.ts` accepts an optional `speed` field from the request `FormData` (parsed as a float, default `1.0`, clamped to OpenAI's valid `[0.25, 4.0]` range). `VocabPresentStep` and `GuidedConvoStep` receive a `strugglingMode` prop and send `speed: strugglingMode ? 0.85 : 1.0` in their existing TTS fetch calls.

2. **More visible translation.** `ReviewStep`'s flashcards default `revealed` to `true` (instead of `false`) when `strugglingMode` is on — translations are pre-revealed instead of requiring a tap. (`VocabPresentStep` and `GuidedConvoStep` already always show translation, confirmed by direct inspection — no change needed there.)

3. **Simpler/shorter dialogue.** `LessonEngine` computes an adjusted `min_exchanges` for any `guided_convo` step not yet rendered at the moment `strugglingMode` activates: `Math.max(1, step.min_exchanges - 1)`. This is applied by updating the local `steps` state (see Data Flow below), not by mutating the original generated plan.

4. **Extra guided practice.** When an exercise is answered incorrectly (event source #1) and `strugglingMode` is (or becomes) active, `LessonEngine` clones that vocabulary word's `VocabRepeatStep` entry from the original plan and splices a copy into the local `steps` array immediately after the current step index — giving the student one additional pronunciation-practice rep on the word they just got wrong, using content already generated (no AI call).

5. **Extra example / more detailed explanation.** The one adaptation needing genuinely new content. New endpoint:

   ```
   POST /api/lesson/extra-example
   Body: { word: string, cefr_level: CefrLevel }
   Response: { example_sentence_en: string, example_sentence_pt: string, explanation_pt: string }
   ```

   A single `gpt-4o-mini` call (same pattern as the existing exercise-generation prompt in `app/api/lesson/generate/route.ts`) producing one additional example sentence pair plus a slightly more detailed Portuguese explanation for the given word at the given level. Triggered automatically (not user-initiated, matching "o sistema deve... fornecer mais exemplos") the moment `strugglingMode` activates, for the *next* `vocab_present` step still to come — the result is shown as a "💡 Dica extra" panel beneath that step's normal content once it loads. Not retroactive to already-shown steps.

## Data Flow

`LessonEngine` currently derives its rendered step from the immutable `lesson.steps` prop by index. To support adaptation #3 (patching `min_exchanges` on not-yet-seen steps) and #4 (splicing in a cloned step), it now holds a local, mutable copy:

```ts
const [steps, setSteps] = useState<LessonStep[]>(lesson.steps)
```

When `strugglingMode` transitions to `true` for the first time, `LessonEngine` runs one state update that:
- maps over `steps.slice(currentStepIndex + 1)`, reducing `min_exchanges` on any `guided_convo` entries, and
- fires the `extra-example` fetch for the next upcoming `vocab_present` step's word (fire-and-forget; if it fails, the step just renders without the extra panel — no error surfaced to the student).

The step-cloning for adaptation #4 happens at the moment a wrong-answer event is registered (which may or may not be the same moment `strugglingMode` first activates), independent of the bulk update above.

No new Supabase tables or columns. No changes to `sessions.lesson_plan_json` — the *persisted* plan is untouched; the client-side mutable copy exists only in the browser tab for the duration of the lesson, consistent with `LessonEngine`'s existing lack of reload-resilience.

## Testing

- Unit: `shouldEnterStruggleMode()` boundary cases (0, 1, 2, 3 events).
- Component: `ExerciseChoiceStep`/`ExerciseFillBlankStep` call `onSuccess(isCorrect)` with the right boolean for both a correct and incorrect selection. `GuidedConvoStep` computes and passes the right `correctionRate` to `onComplete`. `ReviewStep` defaults `revealed` correctly based on a new `strugglingMode` prop.
- API: `/api/lesson/extra-example` — auth required, valid CEFR level required, returns the three expected fields, mocked OpenAI call matching the existing test conventions in `__tests__/app/api/lesson/`.
- Integration (LessonEngine-level): simulate two struggle events via the callbacks and assert (a) `strugglingMode` becomes `true`, (b) a not-yet-rendered `guided_convo` step's effective `min_exchanges` is reduced, (c) a cloned `vocab_repeat` step appears in the steps array after a wrong-answer event.
- Manual: play through a lesson deliberately answering exercises wrong, confirm TTS noticeably slows down, `ReviewStep` cards start pre-revealed, and the "Dica extra" panel appears on the next vocab step.
