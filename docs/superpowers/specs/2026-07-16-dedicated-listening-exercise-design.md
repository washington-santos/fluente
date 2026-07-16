# Exercício Dedicado de Listening — Design Spec

**Source:** item #4 of the 5-item pedagogical improvement list identified after reviewing the shipped level state machine. Items #1 (in-lesson adaptive difficulty), #2 (explicit grammar teaching), and #3 (automatic level promotion) are already shipped. Item #5 (phoneme-level pronunciation feedback) remains a separate future spec.

## Problem

The app is almost entirely speaking-centric: every existing interactive step either has the student speak (`VocabRepeatStep`, `GuidedConvoStep`) or read/select (`ExerciseChoiceStep`, `ExerciseFillBlankStep`). There is no step that tests pure listening comprehension — understanding a longer stretch of spoken English (a short passage, not just a single question) and answering questions about it. Responding to a short spoken question from the teacher (as `GuidedConvoStep` already does) is a different skill from following a multi-sentence passage and extracting specific information from it.

## Goal

Add a dedicated listening-comprehension moment to every guided lesson: the student hears a short spoken passage (no on-screen transcript or translation), then answers two comprehension questions about it — reusing the exact same exercise components and adaptive-difficulty wiring already established for grammar.

## Non-goals

- **No on-screen transcript or Portuguese translation while the passage plays.** This is the one deliberate divergence from `VocabPresentStep`/`GrammarPresentStep`, which both show translated text alongside audio because their goal is teaching. This step's goal is testing comprehension, so showing a translation up front would defeat the purpose. The translation/explanation of what was said only appears afterward, inside each comprehension question's existing `explanation_pt` field — exactly where `ExerciseChoiceStep` already shows it after an answer is selected.
- **No replay limit.** Matches the existing "Ouvir novamente" pattern in `VocabPresentStep`/`GrammarPresentStep`/`GuidedConvoStep` — unlimited replay, consistent with this being a supportive learning app, not a timed exam.
- **No new exercise step type.** Both comprehension questions are plain `exercise_choice` steps, reusing `ExerciseChoiceStep` and `LessonEngine`'s existing `advanceExercise()`/struggle-event wiring exactly as the grammar exercise already does — zero new `LessonEngine` logic beyond one render case for the passage-playing step itself.
- **No adaptive-difficulty "extra example" support** for the listening step, mirroring the same non-goal already established for `GrammarPresentStep`.
- **No per-CEFR-level passage-length configuration in `lib/lesson-shape.ts`.** The AI calibrates passage complexity from the CEFR level already present in the prompt (the same way vocabulary and grammar content are calibrated today) rather than a new structured shape field.
- **No new "listening mastery" tracking dimension** — comprehension-question correctness feeds into the lesson the same way any other exercise's correctness already does.

## New step type + component

### `types/lesson.ts`

```ts
export interface ListeningPresentStep {
  id: string
  type: 'listening_present'
  teacher_script: string
}
```

Added to the `LessonStep` union. Deliberately has no translation/transcript field at all — there is nothing to withhold-then-reveal on this step; the reveal happens later, in the questions' `explanation_pt`.

### `components/lesson/ListeningPresentStep.tsx`

Structurally similar to `GrammarPresentStep.tsx` (TTS-on-mount via the same `/api/lesson/tts` endpoint, same `strugglingMode` speed control, same replay button), but with no explanation/example card at all — just a "🎧 Listening" label, a short Portuguese instruction ("Ouça com atenção. Você vai responder perguntas sobre o que ouviu."), the replay button, and the continue button. No passage text is rendered anywhere on this screen.

## Content generation

### `AiLessonContent` (`app/api/lesson/generate/route.ts`)

Gains two new fields, using the existing `AiExercise` shape for the questions (same type grammar and vocabulary exercises already use):

```ts
interface AiLessonContent {
  // ...existing fields unchanged...
  listening_passage: { teacher_script: string }
  listening_questions: [AiExercise, AiExercise]
}
```

The prompt gains a new instruction block requesting a short (3-5 sentence) spoken passage using the lesson's topic and vocabulary, appropriate for the student's CEFR level, plus exactly two comprehension questions about it — each in the same JSON shape already used for `grammar_exercise`/`exercises` (`vocab_word` set to `"n/a"`, matching the existing convention for non-vocabulary exercises).

The AI-incomplete-content validation is extended to also require `listening_passage` and both `listening_questions`.

`fallbackAiContent()` (used when the AI call fails or returns incomplete JSON) builds a deterministic listening passage and two questions from the topic's existing fields (`starterPhrase`, `promptEn`) the same way the grammar fallback already derives from `topic.grammarFocus`.

## Sequencing

`buildSteps()` inserts the new steps after the vocabulary loop and its trailing `vocab_repeat`, before the two `guided_convo` steps:

`[warmup_review]?` → `intro` → `grammar_present` → grammar exercise → per vocab word (`vocab_present` → exercise) → `vocab_repeat` (last word) → **`listening_present` → comprehension question 1 (`exercise_choice`) → comprehension question 2 (`exercise_choice`)** → `guided_convo` ×2 → `summary`.

This placement is deliberate: the passage can naturally reuse vocabulary the student just learned earlier in the same lesson, and listening comprehension serves as an input-modality bridge before the output-focused (speaking) guided conversation steps that close the lesson.

## Wiring into `LessonEngine`

One new render case, structurally identical to the `grammar_present` case added for the grammar feature:

```tsx
{step.type === 'listening_present' && (
  <ListeningPresentStep
    key={step.id}
    step={step}
    ttsVoice={ttsVoice}
    strugglingMode={strugglingMode}
    onContinue={() => advance()}
  />
)}
```

The two comprehension-question steps need no new wiring at all — they render through the existing `exercise_choice` case, which already calls `advanceExercise(isCorrect)`, which already feeds `registerStruggleEvent()`. A wrong answer on either listening question counts toward the same struggle-event threshold as any other exercise.

## Testing

- Component: `ListeningPresentStep` — renders the label/instruction (not the passage text, since there is none to render), auto-plays TTS with the correct `speed` value, replay button works, continue button calls `onContinue`. No test should assert any passage/translation text is visible, since none should be rendered.
- API: `app/api/lesson/generate/route.ts`'s existing test gets updated fixtures/assertions confirming `listening_passage`/`listening_questions` are requested from the AI and correctly assembled into `buildSteps()`'s output at the right sequence position (after `vocab_repeat`, before the first `guided_convo`).
- Integration: a `LessonEngine` test rendering a lesson with a `listening_present` step followed by two `exercise_choice` steps, confirming wrong answers there increment the same struggle counter a wrong grammar/vocabulary exercise answer would — mirroring the existing grammar integration test's pattern.
- Manual: take a lesson, confirm the listening step shows no passage text anywhere, only the two questions afterward reveal what was said (via their explanation text), and getting one wrong (plus one more wrong answer anywhere) triggers struggling mode exactly as it does today.
