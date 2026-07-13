# Structured Pedagogical Lesson Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/aula`'s unstructured free chat (the default lesson experience today) with an enforced, multi-phase pedagogical sequence — review, objective, teaching, examples, guided practice, varied exercises, restricted guided conversation, a final challenge, AI assessment, and a summary — by reviving the orphaned `/licao` step engine and feeding it AI-generated content per session, while keeping free-form chat available as an explicit "Prática livre" mode.

**Architecture:** `/aula` becomes a container that renders either the step-engine (`mode: 'lesson'`, new) or today's chat UI (`mode: 'daily'`/`'free'`, unchanged) based on the session's `mode` column. `POST /api/lesson/generate` is rewritten to produce a full step sequence (not a flat prompt) via one GPT call, reusing `selectNextTopic`/mastery/spaced-repetition untouched. `GuidedConvoStep` is rewritten to persist through the same `/api/conversation` + `messages` table pipeline `/aula` already uses, so lesson completion can trigger the exact same `/api/session/[id]/assess` competency scoring that's already live.

**Tech Stack:** Next.js 14 App Router route handlers, Supabase (Postgres + RLS via `createSupabaseServer()`), OpenAI (`gpt-4o-mini` JSON mode, `whisper-1`, `tts-1`), Vitest + Testing Library.

## Global Constraints

- All new/modified DB access goes through the existing RLS-scoped `createSupabaseServer()` client (unchanged pattern) — except the one existing `createSupabaseAdmin()` use in `/api/conversation/audio`, untouched by this plan.
- Every route handler returns JSON error bodies with correct HTTP status codes; never throw uncaught.
- AI calls must never throw uncaught: on parse/network failure, fall back to a minimal deterministic lesson (mirrors the existing fallback pattern in `app/api/lesson/generate/route.ts:130-139`).
- `selectNextTopic`'s retry/review/next/restart logic, `lib/mastery.ts`'s scoring weights, and the spaced-repetition interval ladder are NOT modified anywhere in this plan.
- Run `npm run test:run` after every task; all tests (existing + new) must pass before moving to the next task. Run `npx tsc --noEmit` before each commit.
- Follow existing test conventions exactly: `// @vitest-environment node` for route-handler tests, `vi.mock('@supabase/ssr', ...)` or `vi.mock('@/lib/supabase-server', ...)` with `vi.hoisted` mock fns, class-based `vi.mock('openai', ...)`, and the thenable `makeChain` helper pattern already used across `__tests__/app/api/*`.
- No feature flag — this replaces the lesson-start experience in place for all CEFR levels at once (matches the Daily Mission precedent).
- **Remember after merging:** this project's Supabase migrations and Vercel deploys are both manual (see `[[project_supabase_migration_drift]]` memory) — apply the migration via `mcp__plugin_supabase_supabase__apply_migration` and run `vercel --prod` after merging, don't assume either happens automatically.

---

## File Structure

- **Create:** `supabase/migrations/20260713000001_lesson_engine_mode.sql` — adds `'lesson'` to `sessions.mode` CHECK constraint.
- **Modify:** `types/lesson.ts` — add `WarmupReviewStep`, `ExerciseFillBlankStep`, `GeneratedLesson`; extend `VocabPresentStep` (example sentence fields) and `GuidedConvoStep` (`is_challenge`); remove now-dead static-catalog types (`LessonContent`, `LessonStatus`, `UserLessonProgress`, `LessonWithProgress`) in the cleanup task.
- **Create:** `lib/lesson-shape.ts` — per-CEFR-level tuning config.
- **Create:** `components/lesson/WarmupReviewStep.tsx` + test.
- **Create:** `components/lesson/ExerciseFillBlankStep.tsx` + test.
- **Modify:** `components/lesson/VocabPresentStep.tsx` — show + speak an example sentence.
- **Modify:** `app/api/conversation/route.ts` — accept optional `guided_vocab`/`guided_instruction_pt`/`is_challenge` form fields, fold into the system prompt.
- **Modify:** `components/lesson/GuidedConvoStep.tsx` — persist exchanges via `/api/conversation` instead of the retired `/api/lesson/assess` conversation branch; render a distinct header when `is_challenge`.
- **Modify:** `app/api/lesson/assess/route.ts` — remove the `type === 'conversation'` branch; keep `type === 'pronunciation'` (still used by `VocabRepeatStep`).
- **Rewrite:** `app/api/lesson/generate/route.ts` — produce a full `GeneratedLesson` step sequence; set `mode: 'lesson'`.
- **Create:** `components/lesson/LessonEngine.tsx` — new home (moved from `app/licao/[slug]/LessonEngine.tsx`), consumes `GeneratedLesson` + `sessionId` directly, no slug/progress-API calls.
- **Modify:** `hooks/useSession.ts` — expose `mode` and parsed `lessonPlan: GeneratedLesson | null`.
- **Modify:** `app/aula/AulaClient.tsx` — branch: `mode === 'lesson'` renders `LessonEngine` wired to the existing `handleEnd`; otherwise unchanged chat UI.
- **Create:** `components/dashboard/FreePracticeButton.tsx` + test.
- **Modify:** `app/dashboard/page.tsx` — always route the main CTA through `StartLessonButton` (drop the `isBeginnerLevel` branch that sent B1+ users straight to a topic-less `/aula` chat), replace the beginner-only `user_lesson_progress` progress link with a universal `user_topic_progress`-based one, add `<FreePracticeButton />`.
- **Delete:** `app/licao/` (entire directory), `lib/curriculum.ts`, `content/curriculum/` (entire directory), `app/api/lesson/complete/route.ts`, `app/api/lessons/route.ts`, `app/api/lesson/progress/route.ts`, `components/lesson/LessonCard.tsx`, and their tests (`__tests__/components/lesson/LessonEngine.test.tsx` old version, `__tests__/components/lesson/LessonCard.test.tsx`, `__tests__/lib/curriculum.test.ts`).

---

### Task 1: Migration — allow `'lesson'` as a session mode

**Files:**
- Create: `supabase/migrations/20260713000001_lesson_engine_mode.sql`

**Interfaces:**
- Produces: `sessions.mode` CHECK constraint now allows `'lesson'` in addition to `'guided'|'scenario'|'free'|'daily'` — consumed by Task 10 (`/api/lesson/generate` sets `mode: 'lesson'`) and Task 12/13 (`useSession`/`AulaClient` branch on it).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260713000001_lesson_engine_mode.sql

-- The structured lesson engine (see docs/superpowers/specs/2026-07-13-structured-lesson-engine-design.md)
-- needs its own session mode so /aula and useSession can tell a topic-based
-- structured lesson apart from free-form chat ('daily'/'free').
ALTER TABLE public.sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_mode_check
  CHECK (mode in ('guided','scenario','free','daily','lesson'));
```

- [ ] **Step 2: Apply and commit**

The constraint name (`sessions_mode_check`) was confirmed against the live database on 2026-07-13 via `SELECT conname FROM pg_constraint WHERE conrelid = 'public.sessions'::regclass AND contype = 'c' AND conname LIKE '%mode%'` — no need to re-verify before applying.

Apply via `mcp__plugin_supabase_supabase__apply_migration` (project `iifsamuemsrlpzafegat`), then:

```bash
git add supabase/migrations/20260713000001_lesson_engine_mode.sql
git commit -m "feat: allow 'lesson' as a session mode for the structured lesson engine"
```

Apply via `mcp__plugin_supabase_supabase__apply_migration` (project `iifsamuemsrlpzafegat`), then:

```bash
git add supabase/migrations/20260713000001_lesson_engine_mode.sql
git commit -m "feat: allow 'lesson' as a session mode for the structured lesson engine"
```

---

### Task 2: `types/lesson.ts` — new step types and `GeneratedLesson`

**Files:**
- Modify: `types/lesson.ts`

**Interfaces:**
- Produces: `WarmupReviewStep`, `ExerciseFillBlankStep`, extended `VocabPresentStep` (adds `example_sentence_en`/`example_sentence_pt`), extended `GuidedConvoStep` (adds `is_challenge?: boolean`), `GeneratedLesson` — all consumed by Tasks 4, 5, 6, 8, 10, 11.
- Old `LessonContent`/`LessonStatus`/`UserLessonProgress`/`LessonWithProgress` are left in place for now (still used by soon-to-be-deleted `/licao` code) — removed in Task 15 once nothing references them.

- [ ] **Step 1: Add the new step interfaces and extend existing ones**

In `types/lesson.ts`, replace the `VocabPresentStep` interface:

```typescript
export interface VocabPresentStep {
  id: string
  type: 'vocab_present'
  vocab_index: number
  teacher_script: string
  example_sentence_en: string
  example_sentence_pt: string
}
```

Replace the `GuidedConvoStep` interface:

```typescript
export interface GuidedConvoStep {
  id: string
  type: 'guided_convo'
  instruction_pt: string
  teacher_opens_with: string
  teacher_opens_with_pt?: string
  allowed_vocabulary: string[]
  min_exchanges: number
  is_challenge?: boolean
}
```

Add two new step interfaces right after `SummaryStep`:

```typescript
export interface WarmupReviewStep {
  id: string
  type: 'warmup_review'
  recent_summary_pt: string | null
  frequent_errors_pt: string[]
  recent_words: string[]
}

export interface ExerciseFillBlankStep {
  id: string
  type: 'exercise_fill_blank'
  sentence_pt_hint: string
  sentence_with_blank: string
  correct_answer: string
  explanation_pt: string
}
```

Update the `LessonStep` union:

```typescript
export type LessonStep =
  | WarmupReviewStep
  | IntroStep
  | VocabPresentStep
  | VocabRepeatStep
  | ExerciseChoiceStep
  | ExerciseFillBlankStep
  | GuidedConvoStep
  | ReviewStep
  | SummaryStep
```

Add `GeneratedLesson` at the end of the file (the session-based replacement for the static-catalog `LessonContent`):

```typescript
export interface GeneratedLesson {
  title_pt: string
  objective_pt: string
  vocabulary: VocabItem[]
  learning_objectives: LearningObjective[]
  steps: LessonStep[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `app/licao/[slug]/LessonEngine.tsx`, `components/lesson/VocabPresentStep.tsx`, and their tests — these are expected and fixed by Tasks 6, 9, 11, 15. Confirm no OTHER files broke (a broken file outside that expected list means something unexpectedly consumed the old shape — stop and investigate).

- [ ] **Step 3: Commit**

```bash
git add types/lesson.ts
git commit -m "feat: add warmup_review and exercise_fill_blank step types, GeneratedLesson"
```

---

### Task 3: `lib/lesson-shape.ts` — per-level lesson tuning

**Files:**
- Create: `lib/lesson-shape.ts`
- Test: `__tests__/lib/lesson-shape.test.ts`

**Interfaces:**
- Produces: `export interface LessonShape { vocabCount: number; translationDefaultVisible: boolean; minExchangesPractice: number; minExchangesChallenge: number; exercisesPerWord: number }` and `export function getLessonShape(cefrLevel: CefrLevel): LessonShape` — consumed by Task 10 (`/api/lesson/generate`'s prompt/step assembly).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/lesson-shape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getLessonShape } from '@/lib/lesson-shape'

describe('getLessonShape', () => {
  it('gives beginners more vocab support and more exercises per word', () => {
    const a1 = getLessonShape('A1')
    expect(a1.vocabCount).toBe(3)
    expect(a1.translationDefaultVisible).toBe(true)
    expect(a1.exercisesPerWord).toBe(1)
    expect(a1.minExchangesChallenge).toBeGreaterThan(a1.minExchangesPractice)
  })

  it('gives advanced students more vocabulary and less translation support', () => {
    const c2 = getLessonShape('C2')
    expect(c2.vocabCount).toBe(6)
    expect(c2.translationDefaultVisible).toBe(false)
    expect(c2.minExchangesChallenge).toBeGreaterThan(c2.minExchangesPractice)
  })

  it('increases vocab count and exchange requirements monotonically from A1 to C2', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
    const shapes = levels.map(getLessonShape)
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].vocabCount).toBeGreaterThanOrEqual(shapes[i - 1].vocabCount)
      expect(shapes[i].minExchangesPractice).toBeGreaterThanOrEqual(shapes[i - 1].minExchangesPractice)
    }
  })

  it('defaults to A1 shape for an unrecognized level', () => {
    expect(getLessonShape('unknown' as never)).toEqual(getLessonShape('A1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/lib/lesson-shape.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lesson-shape'`

- [ ] **Step 3: Implement**

Create `lib/lesson-shape.ts`:

```typescript
import type { CefrLevel } from '@/types'

export interface LessonShape {
  vocabCount: number
  translationDefaultVisible: boolean
  minExchangesPractice: number
  minExchangesChallenge: number
  exercisesPerWord: number
}

const LESSON_SHAPES: Record<CefrLevel, LessonShape> = {
  A1: { vocabCount: 3, translationDefaultVisible: true, minExchangesPractice: 3, minExchangesChallenge: 4, exercisesPerWord: 1 },
  A2: { vocabCount: 4, translationDefaultVisible: true, minExchangesPractice: 4, minExchangesChallenge: 5, exercisesPerWord: 1 },
  B1: { vocabCount: 4, translationDefaultVisible: false, minExchangesPractice: 5, minExchangesChallenge: 6, exercisesPerWord: 1 },
  B2: { vocabCount: 5, translationDefaultVisible: false, minExchangesPractice: 5, minExchangesChallenge: 7, exercisesPerWord: 1 },
  C1: { vocabCount: 5, translationDefaultVisible: false, minExchangesPractice: 6, minExchangesChallenge: 8, exercisesPerWord: 1 },
  C2: { vocabCount: 6, translationDefaultVisible: false, minExchangesPractice: 6, minExchangesChallenge: 8, exercisesPerWord: 1 },
}

export function getLessonShape(cefrLevel: CefrLevel): LessonShape {
  return LESSON_SHAPES[cefrLevel] ?? LESSON_SHAPES.A1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/lib/lesson-shape.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lesson-shape.ts __tests__/lib/lesson-shape.test.ts
git commit -m "feat: add per-CEFR-level lesson shape config"
```

---

### Task 4: `WarmupReviewStep` component

**Files:**
- Create: `components/lesson/WarmupReviewStep.tsx`
- Test: `__tests__/components/lesson/WarmupReviewStep.test.tsx`

**Interfaces:**
- Consumes: `WarmupReviewStep` type from `@/types/lesson` (Task 2).
- Produces: `export function WarmupReviewStep({ step, onContinue }: { step: WarmupReviewStepType; onContinue: () => void }): JSX.Element` — consumed by Task 11 (`LessonEngine`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/lesson/WarmupReviewStep.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WarmupReviewStep } from '@/components/lesson/WarmupReviewStep'

describe('WarmupReviewStep', () => {
  it('shows the recent summary, frequent errors, and recent words', () => {
    render(
      <WarmupReviewStep
        step={{
          id: 'warmup-1',
          type: 'warmup_review',
          recent_summary_pt: 'Você praticou o passado simples.',
          frequent_errors_pt: ['I goed to school → I went to school'],
          recent_words: ['weekend', 'travel'],
        }}
        onContinue={vi.fn()}
      />
    )
    expect(screen.getByText('Você praticou o passado simples.')).toBeInTheDocument()
    expect(screen.getByText('I goed to school → I went to school')).toBeInTheDocument()
    expect(screen.getByText('weekend')).toBeInTheDocument()
    expect(screen.getByText('travel')).toBeInTheDocument()
  })

  it('calls onContinue when the button is tapped', () => {
    const onContinue = vi.fn()
    render(
      <WarmupReviewStep
        step={{ id: 'warmup-1', type: 'warmup_review', recent_summary_pt: null, frequent_errors_pt: [], recent_words: [] }}
        onContinue={onContinue}
      />
    )
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('renders without a summary/errors/words section when all are empty', () => {
    render(
      <WarmupReviewStep
        step={{ id: 'warmup-1', type: 'warmup_review', recent_summary_pt: null, frequent_errors_pt: [], recent_words: [] }}
        onContinue={vi.fn()}
      />
    )
    expect(screen.getByText('Vamos começar!')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/lesson/WarmupReviewStep.test.tsx`
Expected: FAIL — `Cannot find module '@/components/lesson/WarmupReviewStep'`

- [ ] **Step 3: Implement**

Create `components/lesson/WarmupReviewStep.tsx`:

```typescript
import type { WarmupReviewStep as StepType } from '@/types/lesson'

interface WarmupReviewStepProps {
  step: StepType
  onContinue: () => void
}

export function WarmupReviewStep({ step, onContinue }: WarmupReviewStepProps) {
  const hasContent = !!step.recent_summary_pt || step.frequent_errors_pt.length > 0 || step.recent_words.length > 0

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Antes de começar
        </p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-1">
          Revisão rápida
        </h2>
      </div>

      {!hasContent && (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Vamos começar!
        </p>
      )}

      {step.recent_summary_pt && (
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
            Na última aula
          </p>
          <p className="text-sm text-content-light dark:text-content-dark">{step.recent_summary_pt}</p>
        </div>
      )}

      {step.frequent_errors_pt.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">
            Fique de olho
          </p>
          <ul className="flex flex-col gap-1.5">
            {step.frequent_errors_pt.map((err, i) => (
              <li key={i} className="text-sm text-content-light dark:text-content-dark">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {step.recent_words.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
            Palavras recentes
          </p>
          <div className="flex flex-wrap gap-2">
            {step.recent_words.map(w => (
              <span key={w} className="px-3 py-1.5 rounded-full text-sm bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Continuar →
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/lesson/WarmupReviewStep.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/WarmupReviewStep.tsx __tests__/components/lesson/WarmupReviewStep.test.tsx
git commit -m "feat: add WarmupReviewStep component for lesson phase 1 (review)"
```

---

### Task 5: `ExerciseFillBlankStep` component

**Files:**
- Create: `components/lesson/ExerciseFillBlankStep.tsx`
- Test: `__tests__/components/lesson/ExerciseFillBlankStep.test.tsx`

**Interfaces:**
- Consumes: `ExerciseFillBlankStep` type from `@/types/lesson` (Task 2).
- Produces: `export function ExerciseFillBlankStep({ step, onSuccess }: { step: ExerciseFillBlankStepType; onSuccess: () => void }): JSX.Element` — consumed by Task 11 (`LessonEngine`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/lesson/ExerciseFillBlankStep.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ExerciseFillBlankStep } from '@/components/lesson/ExerciseFillBlankStep'

const mockStep = {
  id: 'fb-1',
  type: 'exercise_fill_blank' as const,
  sentence_pt_hint: 'Meu nome é John.',
  sentence_with_blank: 'My ___ is John.',
  correct_answer: 'name',
  explanation_pt: '"Name" significa "nome".',
}

describe('ExerciseFillBlankStep', () => {
  it('shows the sentence with the blank and the Portuguese hint', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    expect(screen.getByText('My ___ is John.')).toBeInTheDocument()
    expect(screen.getByText('Meu nome é John.')).toBeInTheDocument()
  })

  it('accepts the correct answer case-insensitively and shows success', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'NAME' } })
    fireEvent.click(screen.getByText('Verificar'))
    expect(screen.getByText('✅ Correto!')).toBeInTheDocument()
    expect(screen.getByText('"Name" significa "nome".')).toBeInTheDocument()
  })

  it('shows the correct answer when the input is wrong', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'age' } })
    fireEvent.click(screen.getByText('Verificar'))
    expect(screen.getByText('❌ Quase — a resposta certa é "name".')).toBeInTheDocument()
  })

  it('calls onSuccess when Continuar is tapped after answering', () => {
    const onSuccess = vi.fn()
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'name' } })
    fireEvent.click(screen.getByText('Verificar'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not let an empty answer be checked', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    expect(screen.getByText('Verificar')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/lesson/ExerciseFillBlankStep.test.tsx`
Expected: FAIL — `Cannot find module '@/components/lesson/ExerciseFillBlankStep'`

- [ ] **Step 3: Implement**

Create `components/lesson/ExerciseFillBlankStep.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ExerciseFillBlankStep as StepType } from '@/types/lesson'

interface ExerciseFillBlankStepProps {
  step: StepType
  onSuccess: () => void
}

export function ExerciseFillBlankStep({ step, onSuccess }: ExerciseFillBlankStepProps) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)

  const isCorrect = value.trim().toLowerCase() === step.correct_answer.toLowerCase()
  const [sentenceBefore, sentenceAfter] = step.sentence_with_blank.split('___')

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
          Complete a frase
        </p>
        <p className="text-lg font-semibold text-content-light dark:text-content-dark">
          {sentenceBefore}
          <span className="inline-block min-w-[4rem] border-b-2 border-brand-interactive mx-1">
            {checked ? step.correct_answer : ' '}
          </span>
          {sentenceAfter}
        </p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2 italic">
          {step.sentence_pt_hint}
        </p>
      </div>

      {!checked && (
        <>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Digite a palavra..."
            data-testid="fill-blank-input"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-center text-lg focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          />
          <button
            onClick={() => setChecked(true)}
            disabled={!value.trim()}
            className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Verificar
          </button>
        </>
      )}

      {checked && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl text-center ${isCorrect ? 'bg-green-500/15' : 'bg-red-500/15'}`}
        >
          <p className="font-bold text-content-light dark:text-content-dark">
            {isCorrect ? '✅ Correto!' : `❌ Quase — a resposta certa é "${step.correct_answer}".`}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {step.explanation_pt}
          </p>
        </motion.div>
      )}

      {checked && (
        <button
          onClick={onSuccess}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/lesson/ExerciseFillBlankStep.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/ExerciseFillBlankStep.tsx __tests__/components/lesson/ExerciseFillBlankStep.test.tsx
git commit -m "feat: add ExerciseFillBlankStep component for interactive exercises"
```

---

### Task 6: `VocabPresentStep` — show and speak the example sentence

**Files:**
- Modify: `components/lesson/VocabPresentStep.tsx`
- Test: `__tests__/components/lesson/VocabPresentStep.test.tsx` (new — none existed before)

**Interfaces:**
- Consumes: extended `VocabPresentStep` type from Task 2 (`example_sentence_en`/`example_sentence_pt`).
- Produces: same `export function VocabPresentStep(...)` signature, unchanged props — no consumers need updating beyond the type extension itself.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/lesson/VocabPresentStep.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })

const mockStep = {
  id: 'vp-1',
  type: 'vocab_present' as const,
  vocab_index: 0,
  teacher_script: "This word is 'name'. In Portuguese, 'nome'. For example: My name is John.",
  example_sentence_en: 'My name is John.',
  example_sentence_pt: 'Meu nome é John.',
}
const mockVocab = { word: 'name', translation_pt: 'nome', emoji: '📛', pronunciation_hint: 'neym' }

describe('VocabPresentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('shows the word, translation, and example sentence in English then Portuguese', () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('nome')).toBeInTheDocument()
    expect(screen.getByText('My name is John.')).toBeInTheDocument()
    expect(screen.getByText('Meu nome é John.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/lesson/VocabPresentStep.test.tsx`
Expected: FAIL — example sentence text not found in the rendered output

- [ ] **Step 3: Update the component**

In `components/lesson/VocabPresentStep.tsx`, insert the example sentence block right after the pronunciation hint paragraph:

```typescript
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>
```

becomes:

```typescript
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>
      <div className="w-full p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
        <p className="text-base text-content-light dark:text-content-dark">{step.example_sentence_en}</p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1 italic">{step.example_sentence_pt}</p>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/lesson/VocabPresentStep.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/VocabPresentStep.tsx __tests__/components/lesson/VocabPresentStep.test.tsx
git commit -m "feat: show example sentence in VocabPresentStep (lesson phase 4)"
```

---

### Task 7: `/api/conversation` — accept guided-practice vocabulary restriction

**Files:**
- Modify: `app/api/conversation/route.ts`
- Modify: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/conversation` now reads optional FormData fields `guided_vocab` (JSON string array) and `is_challenge` (`'true'`/absent) — consumed by Task 9 (`GuidedConvoStep`).

- [ ] **Step 1: Write the failing test**

`__tests__/app/api/conversation.test.ts` already mocks a full happy path (see its top, reproduced in the File Structure notes above). Add this new test case inside the existing `describe('POST /api/conversation', ...)` block (find it and add as a new `it(...)` at the end, before the closing `})`):

```typescript
  it('restricts vocabulary in the system prompt when guided_vocab is provided', async () => {
    const { POST } = await import('@/app/api/conversation/route')
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'My name is Ana')
    form.append('guided_vocab', JSON.stringify(['name', 'hello']))

    const request = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const res = await POST(request)
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[0][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('name, hello')
    expect(systemMessage.content).toContain('only use vocabulary from this list')
  })

  it('marks the exchange as a challenge in the system prompt when is_challenge is true', async () => {
    const { POST } = await import('@/app/api/conversation/route')
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'My name is Ana')
    form.append('guided_vocab', JSON.stringify(['name']))
    form.append('is_challenge', 'true')

    const request = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    await POST(request)

    const promptArg = mockChatCreate.mock.calls[mockChatCreate.mock.calls.length - 1][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('final challenge')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`
Expected: FAIL — system prompt doesn't contain the expected restriction text yet

- [ ] **Step 3: Implement**

In `app/api/conversation/route.ts`, find where form fields are read:

```typescript
  const formData = await request.formData()
  const sessionId = formData.get('session_id') as string | null
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('panic_text') as string | null
```

Add right after:

```typescript
  const guidedVocabRaw = formData.get('guided_vocab') as string | null
  const isChallenge = formData.get('is_challenge') === 'true'
  const guidedVocab: string[] = (() => {
    try { return guidedVocabRaw ? JSON.parse(guidedVocabRaw) : [] }
    catch { return [] }
  })()
```

Find the system prompt assembly:

```typescript
  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${studentName}
- CEFR level: ${cefrLevel}
${memoryBlock}${topicBlock}${errorContextBlock}${anatomyBlock}${interventionBlock}
UNDERSTANDING RULE — CRITICAL: ...`
```

Add a new block computed just above it and interpolated in:

```typescript
  const guidedVocabBlock = guidedVocab.length > 0
    ? `\nGUIDED PRACTICE RESTRICTION — CRITICAL: This is a structured practice exchange. You must only use vocabulary from this list in your questions and replies: ${guidedVocab.join(', ')}. Keep sentences short and built only from these words plus basic connecting words (a, the, is, you, I, and, etc.).${isChallenge ? ' This is the final challenge of the lesson — ask the student to combine everything they learned into one fuller exchange, and be a bit more demanding than during earlier practice.' : ''}`
    : ''
```

Then change the template literal to include it:

```typescript
  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${studentName}
- CEFR level: ${cefrLevel}
${memoryBlock}${topicBlock}${errorContextBlock}${anatomyBlock}${interventionBlock}${guidedVocabBlock}
UNDERSTANDING RULE — CRITICAL: ...`
```

(Keep the rest of the template exactly as it is today — only the interpolation line gains `${guidedVocabBlock}`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`
Expected: PASS (all previous tests + 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: let /api/conversation restrict vocabulary for guided lesson practice"
```

---

### Task 8: `GuidedConvoStep` — persist through `/api/conversation`, add challenge styling

**Files:**
- Modify: `components/lesson/GuidedConvoStep.tsx`
- Test: `__tests__/components/lesson/GuidedConvoStep.test.tsx` (new — none existed before)

**Interfaces:**
- Consumes: `POST /api/conversation` (Task 7, now accepts `guided_vocab`/`is_challenge`) via FormData with `session_id`+`audio`. Extended `GuidedConvoStep` type (`is_challenge?`) from Task 2.
- Produces: `export function GuidedConvoStep({ step, sessionId, teacherName, teacherImageUrl, ttsVoice, onComplete }: GuidedConvoStepProps)` — note the new required `sessionId` prop — consumed by Task 11 (`LessonEngine`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/lesson/GuidedConvoStep.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn((opts: { onComplete: (blob: Blob) => void }) => ({
    isRecording: false,
    startRecording: () => opts.onComplete(new Blob(['audio'], { type: 'audio/webm' })),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

global.fetch = vi.fn()

// jsdom's HTMLMediaElement never fires real 'ended'/'playing' events on its own —
// GuidedConvoStep's flow depends on audio.onended firing to advance (autoplay →
// record → assess). This mock constructor auto-fires onended on the next
// microtask after play() so the component's callback chain actually runs,
// the same way a real (very short) audio clip finishing would.
class MockAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  onplaying: (() => void) | null = null
  constructor(public src?: string) {}
  play() {
    queueMicrotask(() => this.onended?.())
    return Promise.resolve()
  }
  pause() {}
}
vi.stubGlobal('Audio', MockAudio)

const baseStep = {
  id: 'gc-1',
  type: 'guided_convo' as const,
  instruction_pt: 'Converse sobre seu nome.',
  teacher_opens_with: "What's your name?",
  teacher_opens_with_pt: 'Qual é o seu nome?',
  allowed_vocabulary: ['name', 'hello'],
  min_exchanges: 1,
}

function mockFetchSequence(...responses: object[]) {
  let call = 0
  vi.mocked(fetch).mockImplementation(() => {
    const res = responses[call] ?? responses[responses.length - 1]
    call++
    return Promise.resolve({ ok: true, json: async () => res } as Response)
  })
}

describe('GuidedConvoStep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the teacher opening line', () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    expect(screen.getByText("What's your name?")).toBeInTheDocument()
  })

  it('posts to /api/conversation with session_id, audio, and guided_vocab when the student speaks', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' }, // initial TTS
      { message_id: 'm1', text: 'Nice to meet you!', reply_pt: 'Prazer!', transcript: 'My name is Ana', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' }, // reply TTS
    )
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => {
      const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
      expect(convoCall).toBeTruthy()
    })
    const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
    const body = convoCall![1].body as FormData
    expect(body.get('session_id')).toBe('sess-1')
    expect(body.get('guided_vocab')).toBe(JSON.stringify(['name', 'hello']))
    expect(body.get('audio')).toBeInstanceOf(Blob)
  })

  it('sends is_challenge=true when the step is marked as the final challenge', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' },
      { message_id: 'm1', text: 'Great!', reply_pt: 'Ótimo!', transcript: 'My name is Ana', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' },
    )
    render(
      <GuidedConvoStep step={{ ...baseStep, is_challenge: true }} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    expect(screen.getByText('🏆 Desafio final')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))
    await waitFor(() => {
      const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
      expect(convoCall).toBeTruthy()
    })
    const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
    const body = convoCall![1].body as FormData
    expect(body.get('is_challenge')).toBe('true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/lesson/GuidedConvoStep.test.tsx`
Expected: FAIL — component still posts to `/api/lesson/assess`, has no `sessionId` prop, no challenge header

- [ ] **Step 3: Rewrite the component**

Replace `components/lesson/GuidedConvoStep.tsx` in full:

```typescript
'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import type { GuidedConvoStep as StepType } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Message {
  role: 'teacher' | 'student'
  text: string
  text_pt?: string
  correct?: boolean
}

interface GuidedConvoStepProps {
  step: StepType
  sessionId: string
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  onComplete: () => void
}

export function GuidedConvoStep({ step, sessionId, teacherName, teacherImageUrl, ttsVoice, onComplete }: GuidedConvoStepProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isSpeaking, setIsSpeaking] = useState(true)
  const [isAssessing, setIsAssessing] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [assessError, setAssessError] = useState<string | null>(null)
  const [awaitingListen, setAwaitingListen] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingUrlRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const playCurrentTts = async (text: string) => {
    setIsSpeaking(true)
    setAwaitingListen(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      pendingUrlRef.current = audio_url
      return new Promise<void>(resolve => {
        const audio = new Audio(audio_url)
        audioRef.current = audio
        audio.onplaying = () => {
          pendingUrlRef.current = null
          setAwaitingListen(false)
        }
        const done = () => { setIsSpeaking(false); resolve() }
        audio.onended = done
        audio.onerror = () => { setIsSpeaking(false); resolve() }
        audio.play().catch(() => { setIsSpeaking(false); resolve() })
      })
    } catch {
      setIsSpeaking(false)
    }
  }

  const replayTts = async (text: string) => {
    if (isSpeaking) { audioRef.current?.pause(); setIsSpeaking(false); return }
    setIsSpeaking(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      const audio = new Audio(audio_url)
      audioRef.current = audio
      const done = () => setIsSpeaking(false)
      audio.onended = done
      audio.onerror = done
      audio.play().catch(done)
    } catch {
      setIsSpeaking(false)
    }
  }

  useEffect(() => {
    const initial: Message = { role: 'teacher', text: step.teacher_opens_with, text_pt: step.teacher_opens_with_pt }
    setMessages([initial])
    playCurrentTts(step.teacher_opens_with)
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAssessment = async (blob: Blob) => {
    setIsAssessing(true)
    setAssessError(null)
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      fd.append('audio', blob, 'recording.webm')
      fd.append('guided_vocab', JSON.stringify(step.allowed_vocabulary))
      if (step.is_challenge) fd.append('is_challenge', 'true')

      const res = await fetch('/api/conversation', { method: 'POST', body: fd })

      if (!res.ok) {
        setAssessError('Não entendi. Fale mais devagar e tente novamente. 🎙️')
        return
      }

      const data = await res.json()

      if (!data.transcript?.trim()) {
        setAssessError('Não detectei sua voz. Fale mais alto e tente novamente. 🎙️')
        return
      }

      const studentMsg: Message = { role: 'student', text: data.transcript, correct: !data.had_correction }
      const teacherMsg: Message = { role: 'teacher', text: data.text ?? '', text_pt: data.reply_pt }

      setMessages(prev => [...prev, studentMsg, teacherMsg])
      if (!data.had_correction) setExchangeCount(c => c + 1)
      setIsAssessing(false)
      if (data.text) await playCurrentTts(data.text)
    } catch {
      setAssessError('Erro ao processar. Tente novamente.')
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder({ onComplete: handleAssessment })

  const handleMic = () => {
    if (isRecording) { stopRecording(); return }
    if (isSpeaking || isAssessing) return
    setAssessError(null)

    const url = pendingUrlRef.current
    if (url) {
      pendingUrlRef.current = null
      setAwaitingListen(false)
      setIsSpeaking(true)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setIsSpeaking(false); startRecording() }
      audio.onerror = () => { setIsSpeaking(false); startRecording() }
      audio.play().catch(() => { setIsSpeaking(false); startRecording() })
    } else {
      startRecording()
    }
  }

  const canComplete = exchangeCount >= step.min_exchanges
  const displayError = assessError ?? recorderError

  const micIcon = isAssessing ? '⏳' : isSpeaking ? '🔊' : isRecording ? '⏹' : awaitingListen ? '🔊' : '🎤'
  const micHint = isRecording
    ? 'Gravando... toque para parar'
    : isSpeaking
    ? 'Professora falando...'
    : isAssessing
    ? 'Avaliando...'
    : awaitingListen
    ? 'Toque para ouvir a pergunta e depois falar'
    : canComplete
    ? 'Pronto para continuar!'
    : `${exchangeCount} / ${step.min_exchanges} trocas`

  return (
    <div className="flex flex-col h-full">
      {step.is_challenge && (
        <p className="text-center text-sm font-bold text-brand-cta pt-3">🏆 Desafio final</p>
      )}
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center px-4 pt-4 pb-2">
        {step.instruction_pt}
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start gap-2 items-end'}`}>
            {msg.role === 'teacher' && (
              <Image src={teacherImageUrl} alt={teacherName} width={32} height={32} className="rounded-full flex-shrink-0" />
            )}
            <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
              msg.role === 'student'
                ? msg.correct === false
                  ? 'bg-red-500/80 text-white rounded-br-sm'
                  : 'bg-brand-interactive text-content-dark rounded-br-sm'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
            }`}>
              <p>{msg.text}</p>
              {msg.text_pt && (
                <p className="text-xs opacity-60 mt-1 italic">{msg.text_pt}</p>
              )}
              {msg.role === 'teacher' && msg.text && (
                <button
                  onClick={() => replayTts(msg.text)}
                  disabled={isAssessing || isRecording}
                  className="mt-2 text-xs opacity-50 hover:opacity-100 transition-opacity disabled:opacity-20"
                  aria-label="Ouvir novamente"
                >
                  🔊 ouvir
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-4 border-t border-surface-light-card dark:border-surface-dark-card">
        {displayError && (
          <p className="text-xs text-red-400 text-center">{displayError}</p>
        )}
        <button
          onClick={handleMic}
          disabled={isAssessing || isSpeaking}
          aria-label={isRecording ? 'Parar' : awaitingListen ? 'Ouvir pergunta' : 'Falar'}
          className={`w-16 h-16 rounded-full text-2xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110'
              : (isAssessing || isSpeaking)
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {micIcon}
        </button>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
          {micHint}
        </p>
        {canComplete && (
          <button
            onClick={onComplete}
            className="w-full py-3 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Finalizar conversa →
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/lesson/GuidedConvoStep.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/GuidedConvoStep.tsx __tests__/components/lesson/GuidedConvoStep.test.tsx
git commit -m "feat: persist guided conversation through /api/conversation, add challenge styling"
```

---

### Task 9: `/api/lesson/assess` — drop the conversation branch

**Files:**
- Modify: `app/api/lesson/assess/route.ts`
- Test: `__tests__/app/api/lesson/assess.test.ts` (new — none existed before)

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/lesson/assess` now only accepts `type: 'pronunciation'`; `type: 'conversation'` returns 400. Still consumed by `VocabRepeatStep` (unchanged).

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/api/lesson/assess.test.ts`:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockTranscriptionCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ text: 'red' }))
const mockChatCreate = vi.hoisted(() => vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!"}' } }],
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = { transcriptions: { create: mockTranscriptionCreate } }
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

import { POST } from '@/app/api/lesson/assess/route'

function makeRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/assess', { method: 'POST', body: form })
}

describe('POST /api/lesson/assess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('still scores pronunciation attempts', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.assessment).toBe('correct')
    expect(body.score).toBe(0.9)
  })

  it('rejects type=conversation — that path moved to /api/conversation', async () => {
    const res = await POST(makeRequest({ type: 'conversation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects an unrecognized type', async () => {
    const res = await POST(makeRequest({ type: 'nonsense', target: 'red' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/api/lesson/assess.test.ts`
Expected: FAIL — `type: 'conversation'` currently returns 200, not 400

- [ ] **Step 3: Remove the conversation branch**

In `app/api/lesson/assess/route.ts`:

Change:

```typescript
  if (type !== 'pronunciation' && type !== 'conversation') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
```

to:

```typescript
  if (type !== 'pronunciation') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
```

Delete the `allowedVocabRaw`/`historyRaw` reads (no longer used) and the entire `// type === 'conversation'` block at the bottom of the file (everything from `const history: Array<...>` through the final `return NextResponse.json({ ...result, transcript })` / catch). The `if (type === 'pronunciation') { ... }` block's own `return` already ends the handler, so once the conversation block is deleted the function simply ends after it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/app/api/lesson/assess.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Regression-check `VocabRepeatStep` still works**

Run: `npm run test:run -- __tests__/components/lesson`
Expected: no failures (no existing test exercised `VocabRepeatStep` directly before this plan, so this just confirms nothing else in the directory broke)

- [ ] **Step 6: Commit**

```bash
git add app/api/lesson/assess/route.ts __tests__/app/api/lesson/assess.test.ts
git commit -m "refactor: remove /api/lesson/assess conversation branch (superseded by /api/conversation)"
```

---

### Task 10: `/api/lesson/generate` — produce a full structured lesson

**Files:**
- Modify: `app/api/lesson/generate/route.ts`
- Test: `__tests__/app/api/lesson/generate.test.ts` (new — none existed before)

**Interfaces:**
- Consumes: `getLessonShape(cefrLevel: CefrLevel): LessonShape` (Task 3), `getStudentContext` (unchanged), `selectNextTopic` (unchanged, kept in this file).
- Produces: session created with `mode: 'lesson'` and `lesson_plan_json` shaped as `GeneratedLesson & { topic_key, topic_label_pt, methodology, is_retry, is_review, generated_at }` — consumed by Task 12 (`useSession`), Task 13 (`AulaClient`/`LessonEngine`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app/api/lesson/generate.test.ts`:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/student-context', () => ({
  getStudentContext: vi.fn().mockResolvedValue({
    userId: 'user-1', name: 'Ana', cefrLevel: 'A1', personalContext: [], goal: null,
    focusAreas: [], taughtTopicIds: [], topicsNeedingReview: [], frequentErrors: [],
    recentSessionSummary: null, biggestDifficulty: null, streakDays: 0,
  }),
}))

import { POST } from '@/app/api/lesson/generate/route'

// Chainable + thenable — matches the convention already used in
// __tests__/app/api/session-report.test.ts. Thenable so `await`ing the chain
// directly (no trailing .single()/.maybeSingle(), e.g. the user_topic_progress
// and vocab_log reads below) resolves to { data, error } instead of returning
// the mock chain object itself.
const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

const validAiContent = {
  title_pt: 'Apresentação pessoal',
  objective_pt: 'Você vai aprender a se apresentar em inglês.',
  learning_objectives: [{ id: 'obj-1', description_pt: 'Dizer seu nome', vocab_words: ['name'] }],
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

describe('POST /api/lesson/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no teacher assigned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ teacher_id: null, cefr_level: 'A1' })
      return makeChain(null)
    })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('builds a full step sequence and creates a mode:"lesson" session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-99' })

    // First 'sessions' call closes any dangling open session (update), second inserts the new one
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
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.session_id).toBe('session-99')

    const insertedRow = insertChain.insert.mock.calls[0][0]
    expect(insertedRow.mode).toBe('lesson')
    expect(insertedRow.lesson_plan_json.title_pt).toBe('Apresentação pessoal')
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string }>
    expect(steps[0].type).toBe('intro')
    expect(steps.some(s => s.type === 'vocab_present')).toBe(true)
    expect(steps.some(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toBe(true)
    expect(steps.some(s => s.type === 'vocab_repeat')).toBe(true)
    expect(steps.filter(s => s.type === 'guided_convo')).toHaveLength(2)
    expect(steps[steps.length - 1].type).toBe('summary')
    // First lesson ever for this student (no recentSessionSummary/frequentErrors) — no warmup_review step
    expect(steps.some(s => s.type === 'warmup_review')).toBe(false)
  })

  it('falls back to a minimal deterministic lesson when the AI call throws', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockRejectedValue(new Error('network down'))

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    let sessionsCall = 0
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-fallback' })
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
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string }>
    expect(steps.length).toBeGreaterThanOrEqual(5)
    expect(steps[0].type).toBe('intro')
    expect(steps[steps.length - 1].type).toBe('summary')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/api/lesson/generate.test.ts`
Expected: FAIL — current route still returns the old flat `lesson_plan_json` shape and `mode: 'daily'`

- [ ] **Step 3: Rewrite the route**

Replace `app/api/lesson/generate/route.ts` in full:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'
import { getTopicsForLevel } from '@/lib/topics'
import { getLessonShape } from '@/lib/lesson-shape'
import { METHODOLOGY_INSTRUCTIONS, METHODOLOGY_NAMES_PT } from '@/lib/mastery'
import type { Topic } from '@/lib/topics'
import type { Methodology } from '@/lib/mastery'
import type { CefrLevel } from '@/types'
import type { GeneratedLesson, LessonStep, VocabItem, LearningObjective } from '@/types/lesson'

interface TopicProgress {
  topic_id: string
  mastery_status: string | null
  last_methodology: string | null
  next_review_at: string | null
}

function selectNextTopic(
  cefrLevel: string,
  allProgress: TopicProgress[],
): { topic: Topic; isRetry: boolean; isReview: boolean; methodology: Methodology } | null {
  const topics = getTopicsForLevel(cefrLevel)
  const progressMap = new Map(allProgress.map(p => [p.topic_id, p]))
  const now = new Date()

  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'learning') {
      const nextMethod = (p.last_methodology ?? 'conversation') as Methodology
      return { topic: t, isRetry: true, isReview: false, methodology: nextMethod }
    }
  }
  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'mastered' && p.next_review_at && new Date(p.next_review_at) <= now) {
      return { topic: t, isRetry: false, isReview: true, methodology: 'conversation' }
    }
  }
  for (const t of topics) {
    if (!progressMap.has(t.key)) {
      return { topic: t, isRetry: false, isReview: false, methodology: 'conversation' }
    }
  }
  const first = topics[0]
  return first
    ? { topic: first, isRetry: false, isReview: true, methodology: 'conversation' }
    : null
}

interface AiExercise {
  vocab_word: string
  question_pt: string
  correct_answer: string
  choices: string[]
  explanation_pt: string
  fill_blank_sentence: string
  fill_blank_hint_pt: string
}

interface AiLessonContent {
  title_pt: string
  objective_pt: string
  learning_objectives: LearningObjective[]
  vocabulary: Array<VocabItem & { example_sentence_en: string; example_sentence_pt: string; teacher_script: string }>
  exercises: AiExercise[]
  guided_convo_opening: string
  guided_convo_opening_pt: string
  challenge_opening: string
  challenge_opening_pt: string
}

function fallbackAiContent(topic: Topic): AiLessonContent {
  const word = topic.objectivesPt[0]?.split(' ')[0]?.toLowerCase() ?? 'hello'
  return {
    title_pt: topic.labelPt,
    objective_pt: topic.objectivesPt[0] ?? 'Praticar inglês',
    learning_objectives: [{ id: 'obj-1', description_pt: topic.objectivesPt[0] ?? 'Praticar inglês', vocab_words: [word] }],
    vocabulary: [{ word, translation_pt: word, emoji: '📘', pronunciation_hint: word, example_sentence_en: topic.starterPhrase, example_sentence_pt: topic.starterPhrase, teacher_script: topic.starterPhrase }],
    exercises: [{ vocab_word: word, question_pt: `O que significa "${word}"?`, correct_answer: word, choices: [word, 'other', 'more', 'less'], explanation_pt: topic.promptEn, fill_blank_sentence: `I say ___.`, fill_blank_hint_pt: topic.starterPhrase }],
    guided_convo_opening: topic.starterPhrase,
    guided_convo_opening_pt: topic.starterPhrase,
    challenge_opening: topic.starterPhrase,
    challenge_opening_pt: topic.starterPhrase,
  }
}

function buildSteps(
  content: AiLessonContent,
  shape: ReturnType<typeof getLessonShape>,
  warmup: { recentSummaryPt: string | null; frequentErrorsPt: string[]; recentWords: string[] } | null,
): LessonStep[] {
  const steps: LessonStep[] = []
  let idCounter = 0
  const nextId = (prefix: string) => `${prefix}-${idCounter++}`

  if (warmup) {
    steps.push({
      id: nextId('warmup'),
      type: 'warmup_review',
      recent_summary_pt: warmup.recentSummaryPt,
      frequent_errors_pt: warmup.frequentErrorsPt,
      recent_words: warmup.recentWords,
    })
  }

  steps.push({ id: nextId('intro'), type: 'intro', title_pt: content.title_pt, description_pt: content.objective_pt })

  content.vocabulary.forEach((vocab, i) => {
    steps.push({
      id: nextId('vp'),
      type: 'vocab_present',
      vocab_index: i,
      teacher_script: vocab.teacher_script,
      example_sentence_en: vocab.example_sentence_en,
      example_sentence_pt: vocab.example_sentence_pt,
    })
    const exercise = content.exercises[i] ?? content.exercises[0]
    if (exercise) {
      if (i % 2 === 0) {
        steps.push({
          id: nextId('ex'),
          type: 'exercise_choice',
          question_pt: exercise.question_pt,
          image_emoji: vocab.emoji,
          correct_answer: exercise.correct_answer,
          choices: exercise.choices,
          explanation_pt: exercise.explanation_pt,
        })
      } else {
        steps.push({
          id: nextId('ex'),
          type: 'exercise_fill_blank',
          sentence_pt_hint: exercise.fill_blank_hint_pt,
          sentence_with_blank: exercise.fill_blank_sentence,
          correct_answer: exercise.correct_answer,
          explanation_pt: exercise.explanation_pt,
        })
      }
    }
  })

  const lastVocab = content.vocabulary[content.vocabulary.length - 1]
  if (lastVocab) {
    steps.push({
      id: nextId('vr'),
      type: 'vocab_repeat',
      vocab_index: content.vocabulary.length - 1,
      instruction_pt: `Pratique a pronúncia de "${lastVocab.word}"`,
    })
  }

  const allowedVocabulary = content.vocabulary.map(v => v.word)

  steps.push({
    id: nextId('gc'),
    type: 'guided_convo',
    instruction_pt: 'Converse usando o que você aprendeu hoje.',
    teacher_opens_with: content.guided_convo_opening,
    teacher_opens_with_pt: content.guided_convo_opening_pt,
    allowed_vocabulary: allowedVocabulary,
    min_exchanges: shape.minExchangesPractice,
  })

  steps.push({
    id: nextId('gc'),
    type: 'guided_convo',
    instruction_pt: 'Use tudo que você aprendeu nesta aula para ir além.',
    teacher_opens_with: content.challenge_opening,
    teacher_opens_with_pt: content.challenge_opening_pt,
    allowed_vocabulary: allowedVocabulary,
    min_exchanges: shape.minExchangesChallenge,
    is_challenge: true,
  })

  steps.push({ id: nextId('summary'), type: 'summary' })

  return steps
}

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('teacher_id, cefr_level')
    .eq('id', user.id)
    .single()

  if (!userData?.teacher_id) return NextResponse.json({ error: 'No teacher assigned' }, { status: 400 })

  const [context, { data: allProgressRows }, { data: recentVocabRows }] = await Promise.all([
    getStudentContext(user.id, supabase),
    supabase
      .from('user_topic_progress')
      .select('topic_id, mastery_status, last_methodology, next_review_at')
      .eq('user_id', user.id),
    supabase
      .from('vocab_log')
      .select('word')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const allProgress = (allProgressRows ?? []) as TopicProgress[]
  const selection = selectNextTopic(context.cefrLevel, allProgress)
  if (!selection) return NextResponse.json({ error: 'No topic available' }, { status: 500 })

  const { topic, isRetry, isReview, methodology } = selection
  const cefrLevel = context.cefrLevel as CefrLevel
  const shape = getLessonShape(cefrLevel)

  const contextLines: string[] = []
  if (context.personalContext.length > 0) contextLines.push(context.personalContext.slice(0, 3).join('; '))
  if (context.goal) contextLines.push(`Goal: ${context.goal}`)
  if (context.biggestDifficulty) contextLines.push(`Biggest difficulty: ${context.biggestDifficulty}`)

  const retryNote = isRetry
    ? `\nIMPORTANT: The student already attempted this topic before. Use a COMPLETELY DIFFERENT teaching approach this time.\nMETHODOLOGY THIS SESSION: ${METHODOLOGY_NAMES_PT[methodology]} — ${METHODOLOGY_INSTRUCTIONS[methodology]}`
    : isReview
    ? `\nIMPORTANT: This is a REVIEW session — the student learned this topic before. Make it feel fresh. Test retention with new examples.`
    : ''

  const prompt = `Create the teaching content for one structured English lesson for a Brazilian student.

STUDENT:
- Name: ${context.name ?? 'Aluno'}
- CEFR Level: ${cefrLevel}
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}
${context.frequentErrors.length > 0 ? `- Frequent mistakes: ${context.frequentErrors.join(', ')}` : ''}

TODAY'S TOPIC: ${topic.labelPt} (${topic.promptEn})
OBJECTIVES: ${topic.objectivesPt.join(', ')}
VOCABULARY COUNT: exactly ${shape.vocabCount} words/phrases, appropriate for ${cefrLevel}
${retryNote}

Return ONLY valid JSON:
{
  "title_pt": "lesson title in Portuguese (max 5 words)",
  "objective_pt": "one sentence — what the student will achieve today (Portuguese)",
  "learning_objectives": [{"id":"obj-1","description_pt":"...","vocab_words":["word1"]}],
  "vocabulary": [{"word":"...","translation_pt":"...","emoji":"...","pronunciation_hint":"...","example_sentence_en":"...","example_sentence_pt":"...","teacher_script":"spoken intro of this word: say it, translate it, give one example"}],
  "exercises": [{"vocab_word":"...","question_pt":"...","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"a sentence with the word replaced by ___","fill_blank_hint_pt":"Portuguese translation of that full sentence"}],
  "guided_convo_opening": "teacher's opening question for guided practice, in English, using only today's vocabulary",
  "guided_convo_opening_pt": "Portuguese translation",
  "challenge_opening": "a harder closing question asking the student to combine everything learned, in English",
  "challenge_opening_pt": "Portuguese translation"
}
Provide exactly ${shape.vocabCount} vocabulary items and exactly ${shape.vocabCount} exercises (one per vocabulary item, in the same order).`

  let aiContent: AiLessonContent
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2200,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}') as Partial<AiLessonContent>
    if (!parsed.vocabulary?.length || !parsed.exercises?.length) throw new Error('Incomplete AI lesson content')
    aiContent = parsed as AiLessonContent
  } catch {
    aiContent = fallbackAiContent(topic)
  }

  const recentWords = ((recentVocabRows ?? []) as Array<{ word: string }>).map(r => r.word)

  const warmup = (context.recentSessionSummary || context.frequentErrors.length > 0 || recentWords.length > 0)
    ? {
        recentSummaryPt: context.recentSessionSummary,
        frequentErrorsPt: context.frequentErrors,
        recentWords,
      }
    : null

  const steps = buildSteps(aiContent, shape, warmup)

  const generatedLesson: GeneratedLesson = {
    title_pt: aiContent.title_pt,
    objective_pt: aiContent.objective_pt,
    vocabulary: aiContent.vocabulary.map(v => ({ word: v.word, translation_pt: v.translation_pt, emoji: v.emoji, pronunciation_hint: v.pronunciation_hint })),
    learning_objectives: aiContent.learning_objectives,
    steps,
  }

  const lessonPlanFull = {
    ...generatedLesson,
    topic_key: topic.key,
    topic_label_pt: topic.labelPt,
    topic_prompt_en: topic.promptEn,
    methodology,
    is_retry: isRetry,
    is_review: isReview,
    generated_at: new Date().toISOString(),
  }

  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: userData.teacher_id,
      mode: 'lesson',
      topic: topic.key,
      lesson_plan_json: lessonPlanFull,
      lesson_topic_id: topic.key,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Session creation failed' }, { status: 500 })
  }

  await supabase.rpc('increment_topic_progress', {
    p_user_id: user.id,
    p_topic_id: topic.key,
    p_cefr_level: cefrLevel,
  })

  return NextResponse.json({
    session_id: session.id,
    teacher_id: userData.teacher_id,
    lesson: {
      title_pt: generatedLesson.title_pt,
      objective_pt: generatedLesson.objective_pt,
      topic_key: topic.key,
      topic_label_pt: topic.labelPt,
      emoji: topic.emoji,
      methodology,
      is_retry: isRetry,
      is_review: isReview,
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/app/api/lesson/generate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/lesson/generate/route.ts __tests__/app/api/lesson/generate.test.ts
git commit -m "feat: generate a full structured step sequence in /api/lesson/generate"
```

---

### Task 11: `LessonEngine` — new home, session-driven instead of slug-driven

**Files:**
- Create: `components/lesson/LessonEngine.tsx`
- Delete (in this task): `app/licao/[slug]/LessonEngine.tsx`, `__tests__/components/lesson/LessonEngine.test.tsx` (old version — replaced below)
- Test: `__tests__/components/lesson/LessonEngine.test.tsx` (new version)

**Interfaces:**
- Consumes: `GeneratedLesson` type (Task 2), `WarmupReviewStep`/`ExerciseFillBlankStep` components (Tasks 4, 5), rewritten `VocabPresentStep` (Task 6), rewritten `GuidedConvoStep` (Task 8, needs `sessionId`).
- Produces: `export function LessonEngine({ lesson, sessionId, teacherName, teacherImageUrl, ttsVoice, onComplete }: LessonEngineProps): JSX.Element` — consumed by Task 13 (`AulaClient`).

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/components/lesson/LessonEngine.test.tsx` in full:

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)

import { LessonEngine } from '@/components/lesson/LessonEngine'
import type { GeneratedLesson } from '@/types/lesson'

const mockLesson: GeneratedLesson = {
  title_pt: 'Cumprimentos',
  objective_pt: 'Aprender a cumprimentar alguém.',
  vocabulary: [{ word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' }],
  learning_objectives: [{ id: 'obj-1', description_pt: 'Cumprimentar alguém em inglês', vocab_words: ['Hello'] }],
  steps: [
    { id: 'intro', type: 'intro', title_pt: 'Cumprimentos', description_pt: 'Hoje você vai aprender a cumprimentar.' },
    { id: 'summary', type: 'summary' },
  ],
}

describe('LessonEngine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the intro step first, with the step counter', () => {
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    expect(screen.getByText('Hoje você vai aprender a cumprimentar.')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('advances to the summary step when Começar is tapped', async () => {
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => expect(screen.getByText('Aula concluída!')).toBeInTheDocument())
  })

  it('calls onComplete (not any /api/lesson/complete call) when the summary is finished', async () => {
    const onComplete = vi.fn()
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => screen.getByText('Aula concluída!'))
    fireEvent.click(screen.getByText('Continuar aprendendo →'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(c => String(c[0]).includes('/api/lesson/complete'))).toBe(false)
  })

  it('renders a warmup_review step first when present, before intro', () => {
    const lessonWithWarmup: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'warmup', type: 'warmup_review', recent_summary_pt: 'Você praticou saudações.', frequent_errors_pt: [], recent_words: [] },
        ...mockLesson.steps,
      ],
    }
    render(<LessonEngine lesson={lessonWithWarmup} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    expect(screen.getByText('Você praticou saudações.')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/lesson/LessonEngine.test.tsx`
Expected: FAIL — `Cannot find module '@/components/lesson/LessonEngine'`

- [ ] **Step 3: Delete the old file and its stale test coverage**

```bash
git rm app/licao/\[slug\]/LessonEngine.tsx
```

(Its test file `__tests__/components/lesson/LessonEngine.test.tsx` is being replaced by Step 1 above, not deleted separately.)

- [ ] **Step 4: Implement the new component**

Create `components/lesson/LessonEngine.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { GeneratedLesson } from '@/types/lesson'
import { LessonProgressBar } from '@/components/lesson/LessonProgressBar'
import { WarmupReviewStep } from '@/components/lesson/WarmupReviewStep'
import { IntroStep } from '@/components/lesson/IntroStep'
import { SummaryStep } from '@/components/lesson/SummaryStep'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import { ExerciseFillBlankStep } from '@/components/lesson/ExerciseFillBlankStep'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'
import { ReviewStep } from '@/components/lesson/ReviewStep'

interface LessonEngineProps {
  lesson: GeneratedLesson
  sessionId: string
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  onComplete: () => void
}

export function LessonEngine({ lesson, sessionId, teacherName, teacherImageUrl, ttsVoice, onComplete }: LessonEngineProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [vocabScores, setVocabScores] = useState<Record<string, number>>({})
  const [isCompleted, setIsCompleted] = useState(false)

  const advance = (word?: string, score?: number) => {
    if (word !== undefined && score !== undefined) {
      setVocabScores(prev => ({ ...prev, [word]: score }))
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= lesson.steps.length) {
      setIsCompleted(true)
    } else {
      setCurrentStepIndex(nextIndex)
    }
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark overflow-y-auto">
        <SummaryStep
          vocabulary={lesson.vocabulary}
          vocabScores={vocabScores}
          learningObjectives={lesson.learning_objectives}
          xpEarned={0}
          lessonTitle={lesson.title_pt}
          onFinish={onComplete}
        />
      </div>
    )
  }

  const step = lesson.steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {lesson.steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={lesson.steps.length} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {step.type === 'warmup_review' && (
          <WarmupReviewStep key={step.id} step={step} onContinue={() => advance()} />
        )}
        {step.type === 'intro' && (
          <IntroStep key={step.id} step={step} vocabulary={lesson.vocabulary} learningObjectives={lesson.learning_objectives} onContinue={() => advance()} />
        )}
        {step.type === 'vocab_present' && (
          <VocabPresentStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            ttsVoice={ttsVoice}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score: number) => advance(lesson.vocabulary[step.vocab_index].word, score)}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep key={step.id} step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'exercise_fill_blank' && (
          <ExerciseFillBlankStep key={step.id} step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            key={step.id}
            step={step}
            sessionId={sessionId}
            teacherName={teacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            onComplete={() => advance()}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep key={step.id} step={step} vocabulary={lesson.vocabulary} onComplete={() => advance()} />
        )}
        {step.type === 'summary' && (
          <SummaryStep
            key={step.id}
            vocabulary={lesson.vocabulary}
            vocabScores={vocabScores}
            learningObjectives={lesson.learning_objectives}
            xpEarned={0}
            lessonTitle={lesson.title_pt}
            onFinish={() => advance()}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/lesson/LessonEngine.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add components/lesson/LessonEngine.tsx __tests__/components/lesson/LessonEngine.test.tsx
git rm app/licao/\[slug\]/LessonEngine.tsx
git commit -m "feat: rebuild LessonEngine to consume session-generated content instead of static slugs"
```

---

### Task 12: `useSession` — expose `mode` and the generated lesson

**Files:**
- Modify: `hooks/useSession.ts`
- Modify: `__tests__/hooks/useSession.test.tsx`

**Interfaces:**
- Produces: `UseSessionReturn` gains `mode: SessionMode | null` and `lessonPlan: GeneratedLesson | null` — consumed by Task 13 (`AulaClient`).

- [ ] **Step 1: Write the failing test**

Add this new test inside the existing `describe('useSession', ...)` block in `__tests__/hooks/useSession.test.tsx` (after the `'loads topic from existing session'` test):

```typescript
  it('exposes mode and lessonPlan from an existing lesson-mode session', async () => {
    mockFetchSequence({
      session: {
        id: 'existing-session',
        mode: 'lesson',
        topic: 'greetings',
        teacher: { id: 't1' },
        messages: [],
        lesson_plan_json: {
          title_pt: 'Cumprimentos',
          objective_pt: 'Aprender a cumprimentar.',
          vocabulary: [],
          learning_objectives: [],
          steps: [{ id: 'intro', type: 'intro', title_pt: 'Cumprimentos', description_pt: 'Vamos começar.' }],
        },
      },
    })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mode).toBe('lesson')
    expect(result.current.lessonPlan?.title_pt).toBe('Cumprimentos')
  })

  it('has a null lessonPlan for a free-chat session', async () => {
    mockFetchSequence({ session: { id: 'existing-session', mode: 'daily', topic: 'travel', teacher: { id: 't1' }, messages: [] } })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mode).toBe('daily')
    expect(result.current.lessonPlan).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`
Expected: FAIL — `result.current.mode` and `result.current.lessonPlan` are `undefined`, not matching

- [ ] **Step 3: Implement**

In `hooks/useSession.ts`, add the import and extend the return interface:

```typescript
import type { ConversationResponse, AudioFetchResponse, AvatarCreateResponse, AvatarPollResponse, AudioStatus, VideoStatus, SessionMode } from '@/types'
import type { GeneratedLesson } from '@/types/lesson'
```

```typescript
interface UseSessionReturn {
  sessionId: string | null
  topic: string | null
  mode: SessionMode | null
  lessonPlan: GeneratedLesson | null
  messages: SessionMessage[]
  ...
```

Add state and set it in both branches of the init effect:

```typescript
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [mode, setMode] = useState<SessionMode | null>(null)
  const [lessonPlan, setLessonPlan] = useState<GeneratedLesson | null>(null)
```

In the "existing session" branch (right after `setTopic((session.topic as string | null) ?? null)`):

```typescript
          setTopic((session.topic as string | null) ?? null)
          setMode((session.mode as SessionMode | null) ?? null)
          setLessonPlan(session.mode === 'lesson' ? (session.lesson_plan_json as GeneratedLesson ?? null) : null)
```

In the "new session" branch (right after `setTopic((newTopic as string | null) ?? null)`), a freshly-created plain session via `POST /api/session` is never `mode: 'lesson'` (only `/api/lesson/generate` creates those) so no lesson plan needs setting there — but set `mode` from the response for consistency:

```typescript
        const { session_id, topic: newTopic } = await postRes.json()
        if (mounted) {
          setSessionId(session_id)
          setTopic((newTopic as string | null) ?? null)
          setMode('daily')
        }
```

Finally, add both to the returned object at the bottom of the hook:

```typescript
  return { sessionId, topic, mode, lessonPlan, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, lastPromptHint, sendTurn, endSession, retryAudio }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`
Expected: PASS (all previous tests + 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add hooks/useSession.ts __tests__/hooks/useSession.test.tsx
git commit -m "feat: expose session mode and generated lesson plan from useSession"
```

---

### Task 13: `AulaClient` — branch on session mode

**Files:**
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `mode`/`lessonPlan` from `useSession` (Task 12), `LessonEngine` (Task 11).
- Produces: no new exports — `AulaClient`'s existing signature is unchanged (`{ teacher, cefrLevel }`).

- [ ] **Step 1: Add a top-level mock for `LessonEngine`, then write the failing test**

`AulaClient.test.tsx` already establishes its mocks as static top-level `vi.mock(...)` calls (see `useSession`, `useAudioRecorder`, `ThemeToggle` near the top of the file) rather than per-test `vi.doMock`/`vi.resetModules` — follow that same convention for consistency and to avoid resetting the file's other mocks mid-suite. Add this new mock alongside the existing ones, near the top of the file (after the `vi.mock('@/components/ThemeProvider', ...)` line):

```typescript
vi.mock('@/components/lesson/LessonEngine', () => ({
  LessonEngine: ({ lesson }: { lesson: { title_pt: string } }) => <div>Lesson engine: {lesson.title_pt}</div>,
}))
```

Then add this test inside the existing `describe('AulaClient', ...)` block (after the `'renders existing messages'` test):

```typescript
  it('renders LessonEngine instead of the chat UI when the session mode is "lesson"', async () => {
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: 'greetings',
      mode: 'lesson',
      lessonPlan: { title_pt: 'Cumprimentos', objective_pt: '', vocabulary: [], learning_objectives: [], steps: [] },
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(screen.getByText('Lesson engine: Cumprimentos')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/aula/AulaClient.test.tsx`
Expected: FAIL — `AulaClient` always renders the chat UI, ignoring `mode`

- [ ] **Step 3: Implement**

In `app/aula/AulaClient.tsx`, add the import:

```typescript
import { LessonEngine } from '@/components/lesson/LessonEngine'
```

Destructure `mode` and `lessonPlan` from `useSession(...)`:

```typescript
  const {
    sessionId,
    topic,
    mode,
    lessonPlan,
    messages,
    loading,
    sending,
    turnError,
    initError,
    quotaExceeded,
    lastPromptHint,
    sendTurn,
    endSession,
    retryAudio,
  } = useSession(teacher.id)
```

Add the branch right after the `loading` skeleton block and before the `// ── Chat screen ──` comment (i.e., after this existing block):

```typescript
  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading && messages.length === 0) {
    return (
      <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-surface-light-card dark:bg-surface-dark-card animate-pulse" />
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary animate-pulse">
          Conectando à aula...
        </p>
      </main>
    )
  }
```

insert immediately after it:

```typescript
  // ── Structured lesson ─────────────────────────────────────────────────────
  if (mode === 'lesson' && lessonPlan && sessionId) {
    return (
      <LessonEngine
        lesson={lessonPlan}
        sessionId={sessionId}
        teacherName={teacher.name}
        teacherImageUrl={teacher.avatar_image_url}
        ttsVoice={teacher.tts_voice}
        onComplete={handleEnd}
      />
    )
  }
```

(`handleEnd` is already defined earlier in the component — this reuses it as-is, so lesson completion goes through the exact same `endSession()` → `/report` + `/assess` → `SessionReport` flow that free-chat sessions already use.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/app/aula/AulaClient.test.tsx`
Expected: PASS (all previous tests + 1 new one)

- [ ] **Step 5: Commit**

```bash
git add app/aula/AulaClient.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: render LessonEngine in AulaClient for mode:lesson sessions"
```

---

### Task 14: Dashboard — route everyone through the lesson engine, add Prática Livre

**Files:**
- Create: `components/dashboard/FreePracticeButton.tsx`
- Test: `__tests__/components/dashboard/FreePracticeButton.test.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Produces: `export function FreePracticeButton(): JSX.Element` — self-contained, no props, consumed by `app/dashboard/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/dashboard/FreePracticeButton.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FreePracticeButton } from '@/components/dashboard/FreePracticeButton'

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

describe('FreePracticeButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts a free-practice session and navigates to /aula', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 'sess-free-1' }) })
    const user = userEvent.setup()
    render(<FreePracticeButton teacherId="teacher-1" />)
    await user.click(screen.getByText('Prática livre'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/aula'))
    expect(mockFetch).toHaveBeenCalledWith('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1', mode: 'free' }),
    })
  })

  it('shows an error and stays put when the request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const user = userEvent.setup()
    render(<FreePracticeButton teacherId="teacher-1" />)
    await user.click(screen.getByText('Prática livre'))
    await waitFor(() => expect(screen.getByText(/erro/i)).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
  })
})
```

(`POST /api/session` requires `teacher_id` in its body — `app/api/session/route.ts:52` — so `FreePracticeButton` takes it as a required prop rather than hardcoding it; `app/dashboard/page.tsx` already has `userData.teacher_id` available to pass down, wired in Step 5 below.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/components/dashboard/FreePracticeButton.test.tsx`
Expected: FAIL — `Cannot find module '@/components/dashboard/FreePracticeButton'`

- [ ] **Step 3: Implement**

Create `components/dashboard/FreePracticeButton.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FreePracticeButtonProps {
  teacherId: string
}

export function FreePracticeButton({ teacherId }: FreePracticeButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, mode: 'free' }),
      })
      if (!res.ok) {
        setError('Erro ao iniciar. Tente novamente.')
        return
      }
      router.push('/aula')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Preparando...' : '💬 Prática livre'}
      </button>
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/components/dashboard/FreePracticeButton.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into the dashboard, fix the CTA gap, and drop the dead-table progress link**

In `app/dashboard/page.tsx`, add the import:

```typescript
import { FreePracticeButton } from '@/components/dashboard/FreePracticeButton'
```

Replace this block (the `isBeginnerLevel`-gated lesson-progress query, around line 141-148):

```typescript
  // Lesson progress for A1/A2 users
  const isBeginnerLevel = u.cefr_level === 'A1' || u.cefr_level === 'A2'
  const { data: lessonProgressRows } = isBeginnerLevel
    ? await supabase
        .from('user_lesson_progress')
        .select('status')
        .eq('user_id', authUser.id)
    : { data: null }

  const completedLessons = (lessonProgressRows ?? []).filter(
    (r: { status: string }) => r.status === 'completed'
  ).length
```

with (querying the live `user_topic_progress` table instead — the same one `/licoes` already reads — for every level, not just beginners):

```typescript
  const { data: masteredTopicRows } = await supabase
    .from('user_topic_progress')
    .select('mastery_status')
    .eq('user_id', authUser.id)
    .eq('mastery_status', 'mastered')

  const completedLessons = (masteredTopicRows ?? []).length
```

Replace the CTA block:

```typescript
        {/* CTA */}
        {isBeginnerLevel ? (
          <Link
            href="/licoes"
            className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-center text-lg hover:opacity-90 transition-opacity"
          >
            Continuar lições
          </Link>
        ) : (
          <Link
            href="/aula"
            className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-center text-lg hover:opacity-90 transition-opacity"
          >
            Começar aula
          </Link>
        )}

        {isBeginnerLevel && (
          <Link
            href="/licoes"
            className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
          >
            <div>
              <p className="text-sm font-semibold text-content-light dark:text-content-dark">
                Suas lições
              </p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {completedLessons} {completedLessons === 1 ? 'lição concluída' : 'lições concluídas'}
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}
```

with (the structured lesson engine now applies to every level, so both the main CTA and the progress link go to `/licoes` for everyone; `<FreePracticeButton />` is the new secondary path to unstructured chat):

```typescript
        {/* CTA */}
        <Link
          href="/licoes"
          className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Continuar lições
        </Link>

        <FreePracticeButton teacherId={u.teacher_id!} />

        <Link
          href="/licoes"
          className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
        >
          <div>
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">
              Suas lições
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              {completedLessons} {completedLessons === 1 ? 'tópico dominado' : 'tópicos dominados'}
            </p>
          </div>
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
        </Link>
```

`types/index.ts:21` types `User.teacher_id` as `string | null`, but `app/dashboard/page.tsx:29` already redirects to `/cadastro/boas-vindas` before this point whenever `!userData?.teacher_id` — so by the time execution reaches the CTA section, it is guaranteed non-null at runtime even though the type is nullable; the `!` above is a legitimate assertion of that already-enforced invariant, not a new risk.

`isBeginnerLevel` (declared at `app/dashboard/page.tsx:142`) appears at exactly 4 lines in the file — 142 (declaration) and 143 (its own usage), both inside the first block replaced above, plus 216 and 232, both inside the second block replaced above. All four are covered by this step's two edits; no further edits needed elsewhere in the file.

- [ ] **Step 6: Typecheck and run the dashboard-adjacent test suite**

Run: `npx tsc --noEmit`
Expected: no errors from `app/dashboard/page.tsx` (if `isBeginnerLevel` is still referenced somewhere, the compiler will flag the unused/removed variable — resolve per the note above)

Run: `npm run test:run -- __tests__/app/dashboard`
Expected: PASS (no regressions — `sessao.test.tsx` doesn't touch this page)

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/FreePracticeButton.tsx __tests__/components/dashboard/FreePracticeButton.test.tsx app/dashboard/page.tsx
git commit -m "feat: route all levels through the lesson engine from the dashboard, add Prática Livre"
```

---

### Task 15: Delete the orphaned static-lesson system

**Files:**
- Delete: `app/licao/` (entire directory, including `page.tsx` and the now-empty dir after Task 11 removed `LessonEngine.tsx`)
- Delete: `lib/curriculum.ts`
- Delete: `content/curriculum/` (entire directory)
- Delete: `app/api/lesson/complete/route.ts`
- Delete: `app/api/lessons/route.ts`
- Delete: `app/api/lesson/progress/route.ts`
- Delete: `components/lesson/LessonCard.tsx`
- Delete: `__tests__/lib/curriculum.test.ts`
- Delete: `__tests__/components/lesson/LessonCard.test.tsx`
- Modify: `types/lesson.ts` (remove now-dead types)

**Interfaces:**
- Produces: nothing — pure removal. This task must run last among the deletions since Tasks 6–13 still depend on some of these files existing until their own rewrites land.

- [ ] **Step 1: Confirm nothing else references the files being deleted**

Run:
```bash
grep -rn "lib/curriculum\|from '@/app/licao\|api/lesson/complete\|api/lessons'\|api/lesson/progress\|components/lesson/LessonCard" --include="*.ts" --include="*.tsx" app lib components hooks __tests__
```
Expected: no matches outside the files this task deletes. If any match is found (e.g. a stray import in a file this plan didn't touch), stop and report it rather than deleting silently — it means an earlier task missed updating a consumer.

- [ ] **Step 2: Delete the files**

```bash
git rm -r app/licao
git rm lib/curriculum.ts
git rm -r content/curriculum
git rm app/api/lesson/complete/route.ts
git rm app/api/lessons/route.ts
git rm app/api/lesson/progress/route.ts
git rm components/lesson/LessonCard.tsx
git rm __tests__/lib/curriculum.test.ts
git rm __tests__/components/lesson/LessonCard.test.tsx
```

- [ ] **Step 3: Remove the now-dead types from `types/lesson.ts`**

Delete these four interfaces (and update any remaining imports of them — there should be none after Step 1's grep passed clean):

```typescript
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'
```
```typescript
export interface LessonContent {
  slug: string
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  order: number
  title_en: string
  title_pt: string
  emoji: string
  estimated_minutes: number
  unlock_after: string | null
  xp_reward: number
  vocabulary: VocabItem[]
  learning_objectives: LearningObjective[]
  steps: LessonStep[]
}
```
```typescript
export interface UserLessonProgress {
  lesson_slug: string
  status: LessonStatus
  current_step_index: number
  vocab_scores: Record<string, number>
  completed_at: string | null
  xp_earned: number
}
```
```typescript
export interface LessonWithProgress extends LessonContent {
  progress: UserLessonProgress | null
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If any surface (e.g. a test file still importing one of the deleted types), fix that file directly — the plan intends for zero remaining references at this point.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:run`
Expected: PASS — file count should have decreased (old `LessonCard.test.tsx`/`curriculum.test.ts` gone), no failures.

- [ ] **Step 6: Commit**

```bash
git add types/lesson.ts
git commit -m "chore: remove the orphaned static-lesson system (app/licao, lib/curriculum, and dead types)"
```

---

### Task 16: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: all tests pass, including every new/modified file from Tasks 1–15.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly (confirms no server/client component boundary issues from moving `LessonEngine` and deleting `app/licao`).

- [ ] **Step 4: Manual smoke-test checklist**

Since this touches the core lesson-start flow across every CEFR level, before merging verify by hand (dev server, a real logged-in account, at least two different CEFR levels if test accounts at different levels exist):
- Dashboard → "Continuar lições" → `/licoes` → tap the next-topic card's start button → lands on `/aula` showing the step engine (not free chat), starting with either `warmup_review` (if the student has prior session history) or `intro`.
- Progress through at least one `vocab_present`, one `exercise_choice`, one `exercise_fill_blank`, the `vocab_repeat`, both `guided_convo` steps (confirm the second shows "🏆 Desafio final" and that recorded speech gets a real teacher reply, not a canned one), and the `summary` step.
- Tap "Continuar aprendendo →" on the summary — confirm `SessionReport` appears afterward with real competency scores (not stuck loading, not a `too_short` fallback) and that `/licoes`'s topic map reflects the new `mastery_status` after returning to the dashboard.
- From the dashboard, tap "💬 Prática livre" — confirm it lands on `/aula` showing the unstructured chat UI (not the step engine), and that the Daily Mission card's "Começar aula focada →" still works unaffected (still free-chat, unaffected by this plan).
- Confirm `/licao/anything` now 404s (route deleted) and no console errors reference `lib/curriculum` or `/api/lessons`.

Report the outcome of this manual pass in the final task summary — do not claim the feature works end-to-end without having actually driven it once.

---

## Verification Summary

After Task 16: every topic-based lesson — at every CEFR level — takes the student through an explicit, AI-generated sequence (review → objective → teach → examples → guided practice → varied exercises → restricted guided conversation → a harder final challenge → real 7-competency assessment → summary), reusing the exact mastery/spaced-repetition engine that was already live, while free-form chat remains one tap away as "Prática livre." The previously-orphaned step engine, its static JSON content, and its disconnected XP-only completion path are gone — assessment happens exactly once per lesson, in exactly one place (`/api/session/[id]/assess`), regardless of which UI produced the conversation.
