# Explicit Grammar Teaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a proactive grammar-teaching step to every guided lesson — presented once, right after the intro, followed by one practice exercise testing that specific rule — reusing the existing exercise components and adaptive-difficulty struggle-event wiring exactly as they are today.

**Architecture:** A new `grammarFocus: string` field on `Topic` (`lib/topics.ts`) names the grammar point for each of the 48 existing topics. `app/api/lesson/generate/route.ts` asks the AI to generate an explanation + one exercise for that point, exactly the way it already generates content per vocabulary word. A new `GrammarPresentStep` component (a near-copy of `VocabPresentStep`) presents it; the accompanying exercise is a plain `exercise_choice` step — no new exercise type, no new struggle-detection logic. `LessonEngine` needs exactly one new render case.

**Tech Stack:** Next.js App Router, React (client components), OpenAI (`gpt-4o-mini`), Vitest + Testing Library, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-15-explicit-grammar-teaching-design.md`

## Global Constraints

- All new/changed user-facing copy is in Portuguese (pt-BR), except spoken `teacher_script`/example-sentence English text, matching every existing lesson-content field.
- Tests use Vitest (`npm run test:run`), with `// @vitest-environment node` for API routes and `// @vitest-environment jsdom` for components, matching existing test files exactly.
- No new exercise step type — the grammar exercise is a plain `exercise_choice` step, reusing `ExerciseChoiceStep` and `LessonEngine`'s existing `advanceExercise()`/struggle-event wiring unmodified.
- No new adaptive-difficulty behavior — `GrammarPresentStep` only reads the existing `strugglingMode` prop for TTS speed, same as `VocabPresentStep`. No `extraExample` support (explicit non-goal in the design spec).
- No database changes.

---

## Task 1: `lib/topics.ts` — `grammarFocus` per topic

**Files:**
- Modify: `lib/topics.ts`
- Modify: `__tests__/lib/topics.test.ts`

**Interfaces:**
- Produces: `Topic.grammarFocus: string` — consumed by Task 3 (`app/api/lesson/generate/route.ts`'s prompt and fallback content).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/topics.test.ts`:

```ts
import { getTopicsForLevel } from '@/lib/topics'

describe('grammarFocus', () => {
  it('every topic across every level has a non-empty grammarFocus', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const) {
      const topics = getTopicsForLevel(level)
      expect(topics.length).toBeGreaterThan(0)
      for (const t of topics) {
        expect(t.grammarFocus).toBeTruthy()
      }
    }
  })

  it('returns the expected grammarFocus for a known topic', () => {
    const t = getTopicByKey('family')
    expect(t?.grammarFocus).toBe('Possessive adjectives: my, his, her')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/topics.test.ts`
Expected: FAIL — `t.grammarFocus` is `undefined` (TypeScript itself will also fail to compile once the field is referenced in the test before the interface has it — that's expected RED)

- [ ] **Step 3: Add the field to the interface**

In `lib/topics.ts`, change the `Topic` interface:

```ts
export interface Topic {
  key: string
  labelPt: string
  promptEn: string
  emoji: string
  objectivesPt: string[]
  grammarFocus: string
  starterPhrase: string
  estimatedMinutes: number
}
```

- [ ] **Step 4: Add `grammarFocus` to all 48 topic objects**

For each topic object below, insert a `grammarFocus: '...',` line immediately after that topic's `objectivesPt: [...]` array (before `starterPhrase`). Use this exact table (topic `key` → exact `grammarFocus` string):

**A1:**
| key | grammarFocus |
|---|---|
| `introductions` | `To be verb: I am / I'm from` |
| `family` | `Possessive adjectives: my, his, her` |
| `numbers-dates` | `Cardinal numbers and asking the time (What time is it?)` |
| `colors` | `It is / They are with adjectives` |
| `daily-routine` | `Present simple tense for daily routines` |
| `food` | `I like / I don't like + noun` |
| `greetings` | `Greetings and polite expressions (How are you? / Nice to meet you)` |
| `home` | `There is / there are + prepositions of place` |

**A2:**
| key | grammarFocus |
|---|---|
| `past-weekend` | `Past simple tense for completed actions` |
| `city` | `There is / there are (existence)` |
| `shopping` | `Comparatives (cheaper, bigger) and would like` |
| `weather` | `It is + weather adjectives (It's sunny/cold)` |
| `hobbies` | `Gerunds after like/enjoy (I like swimming)` |
| `transport` | `Prepositions of movement and imperatives for directions` |
| `work` | `Present simple for jobs and routines` |
| `health` | `I feel / I have a + symptom` |

**B1:**
| key | grammarFocus |
|---|---|
| `travel` | `Present perfect for life experiences` |
| `news` | `Opinion structures: I think / I believe + clause` |
| `future` | `Will vs. going to for future plans` |
| `problems` | `Modal verbs: should, could, might` |
| `entertainment` | `Relative clauses (a movie that...) for descriptions` |
| `culture` | `Comparatives and superlatives for comparing cultures` |
| `career` | `Future forms for ambitions (I'm going to / I plan to)` |
| `restaurants` | `Would like / I'd recommend for polite requests` |

**B2:**
| key | grammarFocus |
|---|---|
| `social-media` | `Linking words for argumentation (however, therefore, on the other hand)` |
| `environment` | `First conditional for cause and effect (If we don't act, ...)` |
| `technology` | `Second conditional for hypothetical scenarios` |
| `education` | `Passive voice for describing systems (Students are taught...)` |
| `finance` | `Future continuous/perfect for financial planning` |
| `relationships` | `Reported speech for describing conversations` |
| `leadership` | `Modal verbs of obligation (must, have to, should) for leadership advice` |
| `ethics` | `Third conditional for moral hypotheticals (If I had known...)` |

**C1:**
| key | grammarFocus |
|---|---|
| `job-interview` | `Formal register and indirect questions (Could you tell me...)` |
| `negotiation` | `Hedging language and conditionals for diplomacy (would, might, could)` |
| `ted-talk` | `Complex noun phrases and nominalization for summarizing` |
| `abstract-concepts` | `Concessive clauses (although, despite, even though)` |
| `idioms` | `Idiomatic expressions and fixed collocations` |
| `meeting-simulation` | `Passive voice and future perfect for project updates` |
| `persuasion` | `Rhetorical structures and cleft sentences (What matters is...)` |
| `storytelling` | `Narrative tenses: past perfect and past continuous` |

**C2:**
| key | grammarFocus |
|---|---|
| `native-humor` | `Irony and sarcasm markers in natural speech` |
| `literature` | `Literary present tense and advanced subordination` |
| `cultural-reference` | `Ellipsis and implied meaning in cultural references` |
| `register-shift` | `Register shifting: formal vs. colloquial structures` |
| `accents-dialects` | `Discourse markers across dialects` |
| `philosophy` | `Subjunctive mood and hypothetical framing` |
| `spontaneous-debate` | `Advanced conditionals and rebuttal structures (Be that as it may...)` |
| `advanced-vocabulary` | `Collocations and connotation-precise word choice` |

Example of the exact edit for the first topic (`introductions`, currently at `lib/topics.ts:17-24`):

```ts
    {
      key: 'introductions',
      labelPt: 'Apresentações pessoais',
      promptEn: 'personal introductions: name, age, nationality, and what you do',
      emoji: '👋',
      objectivesPt: ['Dizer seu nome e de onde você é', 'Falar sua idade em inglês', 'Apresentar-se naturalmente'],
      grammarFocus: 'To be verb: I am / I'm from',
      starterPhrase: 'Hello! My name is ___.',
      estimatedMinutes: 8,
    },
```

Note: `I'm` inside the string literal needs escaping — write it as `"To be verb: I am / I'm from"` (double-quoted) or `'To be verb: I am / I\'m from'` (escaped single-quote) to avoid a syntax error. Apply the same care to any other `grammarFocus` value containing an apostrophe (e.g. `I'd recommend`, `I'm going to`, `don't`).

Repeat this pattern (append `grammarFocus: '...',` after `objectivesPt`) for all 47 remaining topics using the table above.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/topics.test.ts`
Expected: PASS (9 tests — 7 pre-existing + 2 new)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms all 48 topic object literals satisfy the updated `Topic` interface — a missing `grammarFocus` on any topic would fail this step)

- [ ] **Step 7: Commit**

```bash
git add lib/topics.ts __tests__/lib/topics.test.ts
git commit -m "feat: add grammarFocus to every curriculum topic"
```

---

## Task 2: `GrammarPresentStep` type + component

**Files:**
- Modify: `types/lesson.ts`
- Create: `components/lesson/GrammarPresentStep.tsx`
- Test: `__tests__/components/lesson/GrammarPresentStep.test.tsx`

**Interfaces:**
- Produces: `GrammarPresentStep` type (added to the `LessonStep` union) and the `GrammarPresentStep` component, `{ step, ttsVoice, strugglingMode?, onContinue }` — consumed by Task 3 (step shape used by `buildSteps()`) and Task 4 (`LessonEngine`'s new render case).

- [ ] **Step 1: Add the type**

In `types/lesson.ts`, add this interface (near the other step types, e.g. after `VocabPresentStep`):

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

Add `| GrammarPresentStep` to the `LessonStep` union:

```ts
export type LessonStep =
  | WarmupReviewStep
  | IntroStep
  | GrammarPresentStep
  | VocabPresentStep
  | VocabRepeatStep
  | ExerciseChoiceStep
  | ExerciseFillBlankStep
  | GuidedConvoStep
  | ReviewStep
  | SummaryStep
```

- [ ] **Step 2: Write the failing test**

```tsx
// __tests__/components/lesson/GrammarPresentStep.test.tsx
// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarPresentStep } from '@/components/lesson/GrammarPresentStep'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })

const mockStep = {
  id: 'gr-1',
  type: 'grammar_present' as const,
  teacher_script: "Today we'll learn possessive adjectives: my, his, her.",
  explanation_pt: 'Use "my", "his", "her" antes de um substantivo pra mostrar posse.',
  example_sentence_en: 'This is my book.',
  example_sentence_pt: 'Este é meu livro.',
}

describe('GrammarPresentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('shows the explanation and bilingual example', () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.getByText('Use "my", "his", "her" antes de um substantivo pra mostrar posse.')).toBeInTheDocument()
    expect(screen.getByText('This is my book.')).toBeInTheDocument()
    expect(screen.getByText('Este é meu livro.')).toBeInTheDocument()
  })

  it('sends speed=1.0 by default', async () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('sends speed=0.85 when strugglingMode is on', async () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" strugglingMode onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('calls onContinue when the continue button is tapped', () => {
    const onContinue = vi.fn()
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={onContinue} />)
    fireEvent.click(screen.getByText('Entendi! Continuar →'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/GrammarPresentStep.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Write the component**

```tsx
// components/lesson/GrammarPresentStep.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { GrammarPresentStep as StepType } from '@/types/lesson'

interface GrammarPresentStepProps {
  step: StepType
  ttsVoice: string
  strugglingMode?: boolean
  onContinue: () => void
}

export function GrammarPresentStep({ step, ttsVoice, strugglingMode = false, onContinue }: GrammarPresentStepProps) {
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playTts = async () => {
    setIsLoading(true)
    try {
      const fd = new FormData()
      fd.append('text', step.teacher_script)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      const audio = new Audio(audio_url)
      audioRef.current = audio
      await audio.play()
    } catch {
      // TTS failure is non-blocking
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    playTts()
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <span className="text-6xl" aria-hidden>📐</span>
      <div className="text-center">
        <p className="text-xs font-semibold text-brand-interactive uppercase tracking-wide mb-2">Gramática</p>
        <p className="text-base text-content-light dark:text-content-dark">{step.explanation_pt}</p>
      </div>
      <div className="w-full p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
        <p className="text-base text-content-light dark:text-content-dark">{step.example_sentence_en}</p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1 italic">{step.example_sentence_pt}</p>
      </div>
      <button
        onClick={playTts}
        disabled={isLoading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
        aria-label="Ouvir novamente"
      >
        🔊 {isLoading ? 'Carregando...' : 'Ouvir novamente'}
      </button>
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
      >
        Entendi! Continuar →
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/GrammarPresentStep.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add types/lesson.ts components/lesson/GrammarPresentStep.tsx __tests__/components/lesson/GrammarPresentStep.test.tsx
git commit -m "feat: add GrammarPresentStep type and component"
```

---

## Task 3: `app/api/lesson/generate/route.ts` — generate and sequence the grammar step

**Files:**
- Modify: `app/api/lesson/generate/route.ts`
- Modify: `__tests__/app/api/lesson/generate.test.ts`

**Interfaces:**
- Consumes: `Topic.grammarFocus` (Task 1), `GrammarPresentStep` type (Task 2).
- Produces: `buildSteps()` now emits a `grammar_present` step followed by one `exercise_choice` step, positioned right after `intro` — consumed by Task 4 (`LessonEngine`, via the `GeneratedLesson.steps` it already renders generically).

- [ ] **Step 1: Update the test fixture and assertions**

In `__tests__/app/api/lesson/generate.test.ts`, replace the `validAiContent` object with:

```ts
const validAiContent = {
  title_pt: 'Apresentação pessoal',
  objective_pt: 'Você vai aprender a se apresentar em inglês.',
  learning_objectives: [{ id: 'obj-1', description_pt: 'Dizer seu nome', vocab_words: ['name'] }],
  grammar_point: {
    teacher_script: "Today we'll learn the verb 'to be': I am, you are, he is.",
    explanation_pt: 'Use "am/is/are" para dizer quem você é.',
    example_sentence_en: 'I am Ana.',
    example_sentence_pt: 'Eu sou a Ana.',
  },
  grammar_exercise: {
    vocab_word: 'n/a',
    question_pt: 'Como se diz "Eu sou" em inglês?',
    correct_answer: 'I am',
    choices: ['I am', 'I is', 'I are', 'I be'],
    explanation_pt: '"I am" é a forma correta.',
    fill_blank_sentence: '___ Ana.',
    fill_blank_hint_pt: 'Eu sou a Ana.',
  },
  vocabulary: [
    { word: 'name', translation_pt: 'nome', emoji: '📛', pronunciation_hint: 'neym', example_sentence_en: 'My name is Ana.', example_sentence_pt: 'Meu nome é Ana.', teacher_script: "This word is 'name'..." },
  ],
  exercises: [
    { vocab_word: 'name', question_pt: 'Como se diz "nome"?', correct_answer: 'name', choices: ['name', 'age', 'city', 'day'], explanation_pt: '"Name" é "nome".', fill_blank_sentence: 'My ___ is Ana.', fill_blank_hint_pt: 'Meu nome é Ana.' },
  ],
  guided_convo_opening: "What's your name?",
  guided_convo_opening_pt: 'Qual é o seu nome?',
  challenge_opening: 'Tell me all about yourself.',
  challenge_opening_pt: 'Me conte tudo sobre você.',
}
```

Replace this block in the `'builds a full step sequence...'` test:

```ts
    expect(steps[0].type).toBe('intro')
    expect(steps.some(s => s.type === 'vocab_present')).toBe(true)
    expect(steps.some(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toBe(true)
    expect(steps.some(s => s.type === 'vocab_repeat')).toBe(true)
    expect(steps.filter(s => s.type === 'guided_convo')).toHaveLength(2)
    expect(steps[steps.length - 1].type).toBe('summary')
    // First lesson ever for this student (no recentSessionSummary/frequentErrors) — no warmup_review step
    expect(steps.some(s => s.type === 'warmup_review')).toBe(false)
```

with:

```ts
    expect(steps[0].type).toBe('intro')
    expect(steps[1].type).toBe('grammar_present')
    expect(steps[2].type).toBe('exercise_choice')
    expect(steps.some(s => s.type === 'vocab_present')).toBe(true)
    // 1 grammar exercise + 1 vocab exercise (fixture has a single vocabulary item)
    expect(steps.filter(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toHaveLength(2)
    expect(steps.some(s => s.type === 'vocab_repeat')).toBe(true)
    expect(steps.filter(s => s.type === 'guided_convo')).toHaveLength(2)
    expect(steps[steps.length - 1].type).toBe('summary')
    // First lesson ever for this student (no recentSessionSummary/frequentErrors) — no warmup_review step
    expect(steps.some(s => s.type === 'warmup_review')).toBe(false)
```

In the `'falls back to a minimal deterministic lesson...'` test, add this assertion right after the existing `expect(steps[0].type).toBe('intro')` line:

```ts
    expect(steps[1].type).toBe('grammar_present')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: FAIL — `steps[1].type` is `'vocab_present'`, not `'grammar_present'` (the route doesn't emit the new steps yet)

- [ ] **Step 3: Update `AiLessonContent` and `fallbackAiContent`**

In `app/api/lesson/generate/route.ts`, change the `AiLessonContent` interface:

```ts
interface AiLessonContent {
  title_pt: string
  objective_pt: string
  learning_objectives: LearningObjective[]
  grammar_point: { teacher_script: string; explanation_pt: string; example_sentence_en: string; example_sentence_pt: string }
  grammar_exercise: AiExercise
  vocabulary: Array<VocabItem & { example_sentence_en: string; example_sentence_pt: string; teacher_script: string }>
  exercises: AiExercise[]
  guided_convo_opening: string
  guided_convo_opening_pt: string
  challenge_opening: string
  challenge_opening_pt: string
}
```

Replace `fallbackAiContent`:

```ts
function fallbackAiContent(topic: Topic): AiLessonContent {
  const word = topic.objectivesPt[0]?.split(' ')[0]?.toLowerCase() ?? 'hello'
  return {
    title_pt: topic.labelPt,
    objective_pt: topic.objectivesPt[0] ?? 'Praticar inglês',
    learning_objectives: [{ id: 'obj-1', description_pt: topic.objectivesPt[0] ?? 'Praticar inglês', vocab_words: [word] }],
    grammar_point: {
      teacher_script: `Let's learn: ${topic.grammarFocus}.`,
      explanation_pt: topic.grammarFocus,
      example_sentence_en: topic.starterPhrase,
      example_sentence_pt: topic.starterPhrase,
    },
    grammar_exercise: {
      vocab_word: word,
      question_pt: `Qual frase usa corretamente: ${topic.grammarFocus}?`,
      correct_answer: topic.starterPhrase,
      choices: [topic.starterPhrase, 'other', 'more', 'less'],
      explanation_pt: topic.grammarFocus,
      fill_blank_sentence: `I say ___.`,
      fill_blank_hint_pt: topic.starterPhrase,
    },
    vocabulary: [{ word, translation_pt: word, emoji: '📘', pronunciation_hint: word, example_sentence_en: topic.starterPhrase, example_sentence_pt: topic.starterPhrase, teacher_script: topic.starterPhrase }],
    exercises: [{ vocab_word: word, question_pt: `O que significa "${word}"?`, correct_answer: word, choices: [word, 'other', 'more', 'less'], explanation_pt: topic.promptEn, fill_blank_sentence: `I say ___.`, fill_blank_hint_pt: topic.starterPhrase }],
    guided_convo_opening: topic.starterPhrase,
    guided_convo_opening_pt: topic.starterPhrase,
    challenge_opening: topic.starterPhrase,
    challenge_opening_pt: topic.starterPhrase,
  }
}
```

- [ ] **Step 4: Update `buildSteps()`**

Insert two new `steps.push(...)` calls between the existing `intro` push and the `content.vocabulary.forEach(...)` loop:

```ts
  steps.push({ id: nextId('intro'), type: 'intro', title_pt: content.title_pt, description_pt: content.objective_pt })

  steps.push({
    id: nextId('gr'),
    type: 'grammar_present',
    teacher_script: content.grammar_point.teacher_script,
    explanation_pt: content.grammar_point.explanation_pt,
    example_sentence_en: content.grammar_point.example_sentence_en,
    example_sentence_pt: content.grammar_point.example_sentence_pt,
  })

  steps.push({
    id: nextId('gr-ex'),
    type: 'exercise_choice',
    question_pt: content.grammar_exercise.question_pt,
    image_emoji: '📐',
    correct_answer: content.grammar_exercise.correct_answer,
    choices: content.grammar_exercise.choices,
    explanation_pt: content.grammar_exercise.explanation_pt,
  })

  content.vocabulary.forEach((vocab, i) => {
```

(The `content.vocabulary.forEach((vocab, i) => {` line already exists — this step only adds the two `steps.push(...)` blocks immediately above it, between it and the `intro` push.)

- [ ] **Step 5: Update the prompt and validation**

In the prompt template string, add a line after `OBJECTIVES: ${topic.objectivesPt.join(', ')}`:

```
TODAY'S TOPIC: ${topic.labelPt} (${topic.promptEn})
OBJECTIVES: ${topic.objectivesPt.join(', ')}
GRAMMAR FOCUS: ${topic.grammarFocus}
VOCABULARY COUNT: exactly ${shape.vocabCount} words/phrases, appropriate for ${cefrLevel}
${retryNote}
```

In the JSON schema block, add `grammar_point` and `grammar_exercise` right after `learning_objectives`:

```
Return ONLY valid JSON:
{
  "title_pt": "lesson title in Portuguese (max 5 words)",
  "objective_pt": "one sentence — what the student will achieve today (Portuguese)",
  "learning_objectives": [{"id":"obj-1","description_pt":"...","vocab_words":["word1"]}],
  "grammar_point": {"teacher_script":"spoken explanation of the GRAMMAR FOCUS rule, in English","explanation_pt":"how/when to use it, in Portuguese","example_sentence_en":"...","example_sentence_pt":"..."},
  "grammar_exercise": {"vocab_word":"n/a","question_pt":"a multiple-choice question testing the GRAMMAR FOCUS rule","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"...","fill_blank_hint_pt":"..."},
  "vocabulary": [{"word":"...","translation_pt":"...","emoji":"...","pronunciation_hint":"...","example_sentence_en":"...","example_sentence_pt":"...","teacher_script":"spoken intro of this word: say it, translate it, give one example"}],
  "exercises": [{"vocab_word":"...","question_pt":"...","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"a sentence with the word replaced by ___","fill_blank_hint_pt":"Portuguese translation of that full sentence"}],
  "guided_convo_opening": "teacher's opening question for guided practice, in English, using only today's vocabulary",
  "guided_convo_opening_pt": "Portuguese translation",
  "challenge_opening": "a harder closing question asking the student to combine everything learned, in English",
  "challenge_opening_pt": "Portuguese translation"
}
Provide exactly ${shape.vocabCount} vocabulary items and exactly ${shape.vocabCount} exercises (one per vocabulary item, in the same order), plus the grammar_point and grammar_exercise for the GRAMMAR FOCUS above.`
```

Update the incomplete-content check:

```ts
    if (!parsed.vocabulary?.length || !parsed.exercises?.length || !parsed.grammar_point || !parsed.grammar_exercise) throw new Error('Incomplete AI lesson content')
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add app/api/lesson/generate/route.ts __tests__/app/api/lesson/generate.test.ts
git commit -m "feat: generate and sequence a grammar_present step in every lesson"
```

---

## Task 4: `LessonEngine` — render the grammar step

**Files:**
- Modify: `components/lesson/LessonEngine.tsx`
- Modify: `__tests__/components/lesson/LessonEngine.test.tsx`

**Interfaces:**
- Consumes: `GrammarPresentStep` component (Task 2); `grammar_present` steps in `GeneratedLesson.steps` (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/components/lesson/LessonEngine.test.tsx` (this file already has the `useAudioRecorder` mock and `MockAudio` stub from the adaptive-difficulty work — no new mocks needed):

```tsx
  it('renders a grammar_present step and counts a wrong grammar exercise answer toward struggle events', async () => {
    const lesson: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'gr-1', type: 'grammar_present', teacher_script: 'Learn possessives.', explanation_pt: 'Use my/his/her.', example_sentence_en: 'This is my book.', example_sentence_pt: 'Este é meu livro.' },
        { id: 'ex-1', type: 'exercise_choice', question_pt: 'Q1?', image_emoji: '📐', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp1' },
        { id: 'ex-2', type: 'exercise_choice', question_pt: 'Q2?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp2' },
        { id: 'summary', type: 'summary' },
      ],
    }
    render(<LessonEngine lesson={lesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)

    expect(screen.getByText('Use my/his/her.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Entendi! Continuar →'))

    // Wrong answer on the grammar exercise (ex-1) — 1st struggle event, not enough yet
    await waitFor(() => screen.getByText('Q1?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Wrong answer on ex-2 — 2nd struggle event, crosses the threshold
    await waitFor(() => screen.getByText('Q2?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // ex-2 was cloned as an immediate retry — the same question appears again
    await waitFor(() => expect(screen.getByText('Q2?')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/LessonEngine.test.tsx`
Expected: FAIL — `grammar_present` isn't rendered by any case in `LessonEngine`, so `'Use my/his/her.'` never appears

- [ ] **Step 3: Update the component**

In `components/lesson/LessonEngine.tsx`, add the import:

```ts
import { GrammarPresentStep } from '@/components/lesson/GrammarPresentStep'
```

Add a new render case, between the `intro` case and the `vocab_present` case:

```tsx
        {step.type === 'grammar_present' && (
          <GrammarPresentStep
            key={step.id}
            step={step}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            onContinue={() => advance()}
          />
        )}
```

No other changes are needed — the grammar exercise step is a plain `exercise_choice` step, already handled by the existing `{step.type === 'exercise_choice' && (...)}` case and its `advanceExercise(isCorrect)` wiring.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/LessonEngine.test.tsx`
Expected: PASS (all pre-existing tests plus the new one). If the new test's `waitFor` timing doesn't settle exactly as written, adjust the `waitFor` calls (not `LessonEngine`'s actual logic) — same rule already established for this file's other async-choreography tests.

- [ ] **Step 5: Run the full related test set**

Run: `npx vitest run __tests__/components/lesson/ __tests__/lib/topics.test.ts __tests__/app/api/lesson/`
Expected: PASS — every test touched across Tasks 1-4, no regressions.

- [ ] **Step 6: Commit**

```bash
git add components/lesson/LessonEngine.tsx __tests__/components/lesson/LessonEngine.test.tsx
git commit -m "feat: render the grammar_present step in LessonEngine"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files (the previous feature's build broke on an unused import that `tsc`/`vitest` didn't catch; this is now a standing final-check habit).
- [ ] Manual pass: take a lesson, confirm a "📐 Gramática" step appears right after the intro screen, its explanation matches the topic's `grammarFocus`, the following exercise tests that same rule, and getting it wrong (plus one more wrong answer anywhere in the lesson) triggers adaptive-difficulty struggling mode exactly as it does today for vocabulary mistakes.
