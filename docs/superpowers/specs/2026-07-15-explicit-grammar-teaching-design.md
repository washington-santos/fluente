# Ensino Explícito de Gramática — Design Spec

**Source:** item #2 of the 5-item pedagogical improvement list identified after reviewing the shipped level state machine (item #1, in-lesson adaptive difficulty, already shipped — see `docs/superpowers/specs/2026-07-14-adaptive-lesson-difficulty-design.md`). The remaining three (automatic level promotion, dedicated listening exercises, phoneme-level pronunciation feedback) are separate future specs.

## Problem

Today, grammar is taught *only* reactively: `app/api/conversation/route.ts` asks the AI to detect a grammar error mid-conversation (`error_type: 'verb_tense' | 'preposition' | ...`, `app/api/conversation/route.ts:277`) and correct it after the fact. There is no proactive teaching moment — no equivalent of `VocabPresentStep` (which shows a word, its translation, and an example *before* the student practices it) for grammar. A student sees a grammar rule for the first time only by getting it wrong.

The `Topic` model (`lib/topics.ts`) already has an implicit sense of "this topic's grammar focus" buried as free Portuguese prose inside `objectivesPt` (e.g. `family`: `'Usar possessivos: my, his, her'`, `past-weekend`: `'Usar o passado simples em inglês'`) — but nothing reads it as structured data, and the AI lesson-generation prompt (`app/api/lesson/generate/route.ts:228-253`) only uses `objectivesPt` as unstructured flavor text, never asking for a discrete grammar point back.

## Goal

Add a proactive grammar-teaching moment to every guided lesson: present the topic's grammar rule (explanation + example, spoken and written) once, right after the intro, followed by one practice exercise testing that specific rule — using the exact same exercise components and adaptive-difficulty wiring vocabulary exercises already use.

## Non-goals

- **No AI-generated "extra example" for the grammar step during adaptive-difficulty struggling mode.** That adaptation (`docs/superpowers/specs/2026-07-14-adaptive-lesson-difficulty-design.md`) stays scoped to `vocab_present` steps only, as originally shipped. The grammar step only inherits the slower-TTS adaptation.
- **No separate "grammar mastery" tracking.** The grammar exercise's correctness feeds into the lesson the same way a vocabulary exercise's does (advances the lesson, counts toward adaptive-difficulty struggle events) — no new competency dimension, no new database column.
- **No new exercise step type.** The grammar exercise reuses `exercise_choice`/`exercise_fill_blank` exactly as they exist today — same components, same `onSuccess(isCorrect)` contract, same struggle-event wiring in `LessonEngine`. This is a deliberate simplification: because the grammar exercise is structurally indistinguishable from a vocabulary exercise, `LessonEngine`'s existing `advanceExercise()` logic requires zero changes.
- **`ReviewStep` stays out of scope.** (Aside, found during investigation: `ReviewStep`/`components/lesson/ReviewStep.tsx` is fully built and tested but never emitted by `buildSteps()` — a pre-existing, unrelated gap, not something this feature touches or fixes.)
- Not touching the reactive correction path (`app/api/conversation/route.ts`'s `error_type` detection) — that keeps working exactly as it does today, as a second, independent layer alongside proactive teaching.

## Data model

### `lib/topics.ts`

`Topic` gains one new required field:

```ts
export interface Topic {
  key: string
  labelPt: string
  promptEn: string
  emoji: string
  objectivesPt: string[]
  starterPhrase: string
  estimatedMinutes: number
  grammarFocus: string   // new — short English label naming the grammar point this topic teaches
}
```

Every topic across all 6 CEFR levels (~48 topics total, 8 per level in the current curriculum) gets a curated `grammarFocus` string, largely derived from the grammar hint already present in that topic's `objectivesPt`. Examples:

| Topic key | Level | `grammarFocus` |
|---|---|---|
| `family` | A1 | `"Possessive adjectives: my, his, her"` |
| `daily-routine` | A1 | `"Present simple tense for daily routines"` |
| `past-weekend` | A2 | `"Past simple tense for completed actions"` |
| `city` | A2 | `"There is / there are"` |
| `travel` | B1 | `"Present perfect for life experiences"` |
| `future` | B1 | `"Will vs. going to for future plans"` |
| `problems` | B1 | `"Modal verbs: should, could, might"` |

Topics whose `objectivesPt` has no clear grammar hint (a minority, mostly at B2+ where objectives skew toward vocabulary/register rather than tense/structure) get a curated label chosen to fit the topic's actual conversational content — this is content-authoring work done once, by hand, not generated at request time.

## Content generation

### `AiLessonContent` (`app/api/lesson/generate/route.ts:62-72`)

Gains two new fields:

```ts
interface AiLessonContent {
  // ...existing fields unchanged...
  grammar_point: {
    teacher_script: string        // spoken explanation of the rule, in English (TTS'd)
    explanation_pt: string        // how/when to use it, in Portuguese
    example_sentence_en: string
    example_sentence_pt: string
  }
  grammar_exercise: AiExercise    // same shape as a vocabulary AiExercise, testing the grammar rule instead of a word
}
```

The prompt (`app/api/lesson/generate/route.ts:228-253`) gains a new instruction line — `GRAMMAR FOCUS: ${topic.grammarFocus}` — and the JSON response schema requests the two new fields alongside the existing ones. This mirrors exactly how vocabulary words are seeds (fixed) while their `teacher_script`/example sentences are freshly generated per lesson — `grammarFocus` is the fixed seed, the explanation and exercise are generated fresh each time the topic is taught, giving variety across repeat visits to the same topic without needing hand-authored explanation text for all 48 topics.

## New step type + component

### `types/lesson.ts`

```ts
export interface GrammarPresentStep {
  id: string
  type: 'grammar_present'
  teacher_script: string
  explanation_pt: string
  example_sentence_en: string
  example_sentence_pt: string
}
```

Added to the `LessonStep` union alongside the existing 9 variants.

### `components/lesson/GrammarPresentStep.tsx`

New component, structurally a near-copy of `components/lesson/VocabPresentStep.tsx`: auto-plays TTS of `step.teacher_script` on mount (same `useEffect`-on-`step.id` pattern), a "🔊 Ouvir novamente" replay button, the rule's explanation and bilingual example in a card, and a continue button. Differs from `VocabPresentStep` only in not needing a `VocabItem` lookup (no word/emoji/translation header) — instead a simple "📐 Gramática" label heads the card. Takes the same `strugglingMode?: boolean` prop `VocabPresentStep` takes, applying the same `0.85`/`1.0` TTS speed split (no `extraExample` prop, per the stated non-goal).

## Sequencing

`buildSteps()` (`app/api/lesson/generate/route.ts:89-180`) inserts two new steps immediately after `intro` and before the vocabulary loop begins:

1. `grammar_present` (built from `content.grammar_point`)
2. The grammar exercise — an `exercise_choice` or `exercise_fill_blank` step (alternating the same way vocabulary exercises already do, or fixed to `exercise_choice` for simplicity — implementation detail for the plan) built from `content.grammar_exercise`, identical in shape to a per-word vocabulary exercise.

Resulting full sequence: `[warmup_review]?` → `intro` → `grammar_present` → grammar exercise → per vocab word (`vocab_present` → exercise) → `vocab_repeat` (last word) → `guided_convo` ×2 → `summary`.

## Wiring into `LessonEngine`

`components/lesson/LessonEngine.tsx` gains one new render case:

```tsx
{step.type === 'grammar_present' && (
  <GrammarPresentStep
    key={step.id}
    step={step}
    strugglingMode={strugglingMode}
    onContinue={() => advance()}
  />
)}
```

The grammar exercise step needs **no new wiring at all** — it renders through the existing `exercise_choice`/`exercise_fill_blank` cases, which already call `advanceExercise(isCorrect)`, which already feeds `registerStruggleEvent()`. A wrong answer on the grammar exercise counts toward the same struggle-event threshold as a wrong vocabulary exercise, exactly as decided.

## Testing

- Unit: none needed beyond what TDD naturally produces for the new component/type (no new pure-logic module like `lib/adaptive-difficulty.ts` — this feature has no new decision logic, only new content/rendering).
- Component: `GrammarPresentStep` — renders the rule/explanation/example, auto-plays TTS with the right `speed` value, replay button works, continue button calls `onContinue`. Mirrors `VocabPresentStep.test.tsx`'s existing test shape.
- API: `app/api/lesson/generate/route.ts`'s existing test (`__tests__/app/api/lesson/generate.test.ts`) gets updated fixtures/assertions confirming `grammar_point` and `grammar_exercise` are requested from the AI and correctly assembled into `buildSteps()`'s output at the right sequence position.
- Integration: a `LessonEngine` test rendering a lesson with a `grammar_present` + grammar `exercise_choice` step, confirming a wrong answer there increments the same struggle counter a wrong vocabulary exercise would (reusing the existing adaptive-difficulty integration test's pattern).
- Manual: take a lesson, confirm the grammar step appears right after the intro, the exercise tests the stated rule, and getting it wrong (plus one more wrong answer anywhere) triggers struggling mode exactly as it does today for vocabulary mistakes.
