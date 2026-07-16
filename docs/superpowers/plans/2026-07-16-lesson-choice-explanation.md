# AI Explains Lesson Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the student a short, accurate, one-sentence explanation of why today's lesson is what it is (retry, spaced-repetition review, or a brand-new topic), built entirely from topic-selection logic `app/api/lesson/generate/route.ts` already computes today — no new AI call.

**Architecture:** A new pure function `explainLessonChoice()` in `lib/lesson-explanation.ts` turns the already-computed `isRetry`/`isReview`/`methodology`/topic label into one Portuguese sentence. `app/api/lesson/generate/route.ts` calls it right after `selectNextTopic()` resolves and threads the result into `buildSteps()`, which sets it directly on the `intro` step it already constructs. `IntroStep` renders it. No changes to `app/aula/AulaClient.tsx` are needed — the enriched `intro` step rides inside `lesson_plan_json.steps`, which already flows unmodified from the database through `useSession` → `LessonEngine` → `IntroStep`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest + Testing Library.

**Design spec:** `docs/superpowers/specs/2026-07-16-lesson-choice-explanation-design.md`

## Global Constraints

- No new AI/LLM call anywhere in this feature — `explainLessonChoice()` is a pure, synchronous function.
- No correlation with `frequentErrors`/`biggestDifficulty` — only `isRetry`/`isReview`/`methodology`/topic label are used, exactly as `selectNextTopic()` already computes them.
- No change to `selectNextTopic()`'s selection logic — this feature only surfaces an existing decision.
- No new lesson step or dedicated screen — the explanation is one line added to the existing `IntroStep`.
- No change to `app/aula/AulaClient.tsx` — confirmed unnecessary; see the spec's Architecture section for why.
- No database changes. No feature flag.

---

## Task 1: `lib/lesson-explanation.ts` — the pure explanation function

**Files:**
- Create: `lib/lesson-explanation.ts`
- Test: `__tests__/lib/lesson-explanation.test.ts`

**Interfaces:**
- Produces: `explainLessonChoice(params: { isRetry: boolean; isReview: boolean; methodology: Methodology; topicLabelPt: string }): string` — consumed by Task 2 (`app/api/lesson/generate/route.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/lesson-explanation.test.ts
import { describe, it, expect } from 'vitest'
import { explainLessonChoice } from '@/lib/lesson-explanation'

describe('explainLessonChoice', () => {
  it('explains a retry with the methodology name', () => {
    const text = explainLessonChoice({ isRetry: true, isReview: false, methodology: 'roleplay', topicLabelPt: 'Apresentações pessoais' })
    expect(text).toContain('Apresentações pessoais')
    expect(text).toContain('Roleplay')
  })

  it('explains a review', () => {
    const text = explainLessonChoice({ isRetry: false, isReview: true, methodology: 'conversation', topicLabelPt: 'Família' })
    expect(text).toContain('Família')
    expect(text).toContain('revisão')
  })

  it('explains a new topic', () => {
    const text = explainLessonChoice({ isRetry: false, isReview: false, methodology: 'conversation', topicLabelPt: 'Cores' })
    expect(text).toContain('Cores')
    expect(text).toContain('novo')
  })

  it('prioritizes retry over review when both flags are true (should not happen given selectNextTopic()\'s mutually-exclusive branches, but the function must still be deterministic)', () => {
    const text = explainLessonChoice({ isRetry: true, isReview: true, methodology: 'game', topicLabelPt: 'Comida' })
    expect(text).toContain('jeito diferente')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/lesson-explanation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// lib/lesson-explanation.ts
import type { Methodology } from '@/lib/mastery'
import { METHODOLOGY_NAMES_PT } from '@/lib/mastery'

export function explainLessonChoice(params: {
  isRetry: boolean
  isReview: boolean
  methodology: Methodology
  topicLabelPt: string
}): string {
  const { isRetry, isReview, methodology, topicLabelPt } = params
  if (isRetry) {
    return `Você já praticou "${topicLabelPt}" antes — hoje vamos tentar de um jeito diferente (${METHODOLOGY_NAMES_PT[methodology]}) pra ajudar a fixar.`
  }
  if (isReview) {
    return `Faz um tempo que você não pratica "${topicLabelPt}" — hoje é dia de revisão pra manter na memória.`
  }
  return `Hoje é um tópico novo pra você: "${topicLabelPt}".`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/lesson-explanation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/lesson-explanation.ts __tests__/lib/lesson-explanation.test.ts
git commit -m "feat: add explainLessonChoice, a pure function describing why a lesson was picked"
```

---

## Task 2: `types/lesson.ts` + `app/api/lesson/generate/route.ts` — wire the explanation into the intro step

**Files:**
- Modify: `types/lesson.ts`
- Modify: `app/api/lesson/generate/route.ts`
- Modify: `__tests__/app/api/lesson/generate.test.ts`

**Interfaces:**
- Consumes: `explainLessonChoice()` (Task 1).
- Produces: `IntroStep.choice_explanation_pt?: string` (added to the `LessonStep` union's `IntroStep` member) — consumed by Task 3 (`components/lesson/IntroStep.tsx`).

- [ ] **Step 1: Add the field to `IntroStep`**

In `types/lesson.ts`, change the `IntroStep` interface:

```ts
export interface IntroStep {
  id: string
  type: 'intro'
  title_pt: string
  description_pt: string
  choice_explanation_pt?: string
}
```

- [ ] **Step 2: Update the test fixture and add new test cases**

In `__tests__/app/api/lesson/generate.test.ts`, add this assertion to the existing `'builds a full step sequence and creates a mode:"lesson" session'` test, right after the existing `expect(steps.some(s => s.type === 'warmup_review')).toBe(false)` line:

```ts
    // No progress rows exist for this student — the selected topic ('introductions',
    // the first A1 topic) is brand new, so the intro step's explanation should say so.
    const introStep = steps[0] as { choice_explanation_pt?: string }
    expect(introStep.choice_explanation_pt).toContain('Apresentações pessoais')
    expect(introStep.choice_explanation_pt).toContain('novo')
```

Add a new test, after the `'builds a full step sequence...'` test and before `'truncates listening_questions to exactly 2 when AI returns 3+'`:

```ts
  it('explains a retry lesson using the methodology it was chosen with', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    // 'introductions' is the first A1 topic — mark it as still being learned (a retry),
    // with 'roleplay' as the methodology it should retry with next.
    const progressChain = makeChain([
      { topic_id: 'introductions', mastery_status: 'learning', last_methodology: 'roleplay', next_review_at: null },
    ])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-retry' })

    let sessionsCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return userChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'sessions') {
        sessionsCall++
        return sessionsCall === 1 ? dangling : insertChain
      }
      return makeChain(null)
    })

    const res = await POST()
    expect(res.status).toBe(200)

    const insertedRow = insertChain.insert.mock.calls[0][0]
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string; choice_explanation_pt?: string }>
    const introStep = steps[0]
    expect(introStep.type).toBe('intro')
    expect(introStep.choice_explanation_pt).toContain('Apresentações pessoais')
    expect(introStep.choice_explanation_pt).toContain('Roleplay')
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: FAIL — `introStep.choice_explanation_pt` is `undefined` in both new assertions/test

- [ ] **Step 4: Wire `explainLessonChoice()` into the route**

In `app/api/lesson/generate/route.ts`, add the import alongside the existing ones:

```ts
import { explainLessonChoice } from '@/lib/lesson-explanation'
```

Change `buildSteps()`'s signature to accept a 4th parameter, and use it when constructing the `intro` step:

```ts
function buildSteps(
  content: AiLessonContent,
  shape: ReturnType<typeof getLessonShape>,
  warmup: { recentSummaryPt: string | null; frequentErrorsPt: string[]; recentWords: string[] } | null,
  choiceExplanationPt: string,
): LessonStep[] {
```

```ts
  steps.push({ id: nextId('intro'), type: 'intro', title_pt: content.title_pt, description_pt: content.objective_pt, choice_explanation_pt: choiceExplanationPt })
```

(Only the `choice_explanation_pt: choiceExplanationPt` field is new on this line — everything else is unchanged.)

At the call site (currently `const steps = buildSteps(aiContent, shape, warmup)`), pass the computed explanation as the new 4th argument:

```ts
  const steps = buildSteps(
    aiContent,
    shape,
    warmup,
    explainLessonChoice({ isRetry, isReview, methodology, topicLabelPt: topic.labelPt }),
  )
```

`isRetry`, `isReview`, `methodology`, and `topic` are already in scope at this point in `POST()` (destructured from `selection` earlier in the function) — no other changes needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add types/lesson.ts app/api/lesson/generate/route.ts __tests__/app/api/lesson/generate.test.ts
git commit -m "feat: attach a plain-Portuguese lesson-choice explanation to the intro step"
```

---

## Task 3: `IntroStep` — render the explanation

**Files:**
- Modify: `components/lesson/IntroStep.tsx`
- Create: `__tests__/components/lesson/IntroStep.test.tsx` (no test file exists for this component today)

**Interfaces:**
- Consumes: `IntroStep.choice_explanation_pt?: string` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/lesson/IntroStep.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IntroStep } from '@/components/lesson/IntroStep'
import type { IntroStep as StepType } from '@/types/lesson'

const baseStep: StepType = {
  id: 'intro-1',
  type: 'intro',
  title_pt: 'Apresentações pessoais',
  description_pt: 'Você vai aprender a se apresentar.',
}

describe('IntroStep', () => {
  it('shows the choice explanation when present', () => {
    const step: StepType = { ...baseStep, choice_explanation_pt: 'Hoje é um tópico novo pra você: "Apresentações pessoais".' }
    render(<IntroStep step={step} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.getByText('Hoje é um tópico novo pra você: "Apresentações pessoais".')).toBeInTheDocument()
  })

  it('renders nothing extra when choice_explanation_pt is absent', () => {
    render(<IntroStep step={baseStep} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.queryByText('💡')).not.toBeInTheDocument()
  })

  it('still shows the title and description', () => {
    render(<IntroStep step={baseStep} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.getByText('Apresentações pessoais')).toBeInTheDocument()
    expect(screen.getByText('Você vai aprender a se apresentar.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/IntroStep.test.tsx`
Expected: FAIL — `choice_explanation_pt` is never rendered, so "Hoje é um tópico novo..." never appears

- [ ] **Step 3: Update the component**

In `components/lesson/IntroStep.tsx`, add a new block right after the opening `<div className="flex flex-col gap-5 p-4">` and before the existing "Nesta aula" title block:

```tsx
export function IntroStep({ step, vocabulary, learningObjectives, onContinue }: IntroStepProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {step.choice_explanation_pt && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-interactive/10">
          <span className="text-base" aria-hidden>💡</span>
          <p className="text-xs text-content-light dark:text-content-dark">{step.choice_explanation_pt}</p>
        </div>
      )}

      <div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Nesta aula
        </p>
```

(Only the new `{step.choice_explanation_pt && (...)}` block is added — the `<div>` containing "Nesta aula" and everything below it in the file is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/IntroStep.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full related test set**

Run: `npx vitest run __tests__/lib/lesson-explanation.test.ts __tests__/app/api/lesson/generate.test.ts __tests__/components/lesson/IntroStep.test.tsx __tests__/components/lesson/LessonEngine.test.tsx`
Expected: PASS — every test touched across Tasks 1-3, plus `LessonEngine.test.tsx`'s existing intro-step assertions still pass unchanged (they don't set `choice_explanation_pt`, so the optional field simply doesn't render, matching Task 3's Step 2 "absent" test).

- [ ] **Step 7: Commit**

```bash
git add components/lesson/IntroStep.tsx __tests__/components/lesson/IntroStep.test.tsx
git commit -m "feat: show the lesson-choice explanation on the intro step"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Manual pass: start a brand-new lesson (never-taught topic) and confirm the intro screen shows "Hoje é um tópico novo pra você: ...". If possible, trigger a retry (a topic with `mastery_status: 'learning'`) and confirm the explanation names the new methodology instead.
