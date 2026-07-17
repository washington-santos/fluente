# Religar o ReviewStep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `buildSteps()` in `app/api/lesson/generate/route.ts` emit a `review` step (active-recall vocabulary flashcards) right after the last `vocab_repeat` step and before `listening_present`, reaching the already-built, already-tested `ReviewStep` component that `LessonEngine.tsx` has been able to render since it was written but that no generated lesson has ever reached.

**Architecture:** A single new `steps.push(...)` call in the existing `buildSteps()` function, using the `ReviewStep` type that already exists in `types/lesson.ts`. No new files, no new AI-generated content, no component changes — `components/lesson/ReviewStep.tsx` and `LessonEngine.tsx`'s render case are already correct and already tested.

**Tech Stack:** Next.js App Router (API route), TypeScript, Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-17-review-step-design.md`

## Global Constraints

- The step is unconditional — every generated lesson gets it, no threshold/conditional-skip logic (every CEFR level generates at least 3 vocabulary words, so the flashcard is never degenerate).
- `instruction_pt` is a fixed Portuguese string, not AI-generated — matches the existing precedent of `guided_convo`'s two hardcoded `instruction_pt` values.
- No changes to `components/lesson/ReviewStep.tsx`, `types/lesson.ts`, or `LessonEngine.tsx` — all three are already correct and already covered by existing tests.
- No new database column, no new table, no feature flag.

---

## Task 1: Insert the `review` step into `buildSteps()`

**Files:**
- Modify: `app/api/lesson/generate/route.ts`
- Modify: `__tests__/app/api/lesson/generate.test.ts`

**Interfaces:**
- Consumes: the existing `ReviewStep` type from `types/lesson.ts` (`{ id: string; type: 'review'; instruction_pt: string }`), already part of the `LessonStep` union `buildSteps()` returns — no import changes needed since `LessonStep` is already imported in this file.

- [ ] **Step 1: Update the existing sequencing assertions to expect the new step**

Two existing tests in `__tests__/app/api/lesson/generate.test.ts` assert exact step positions relative to `vocab_repeat`, assuming `listening_present` comes immediately after it. Both need updating first so the RED step (Step 2) fails for the *right* reason — a missing `review` step, not a coincidentally-already-broken assertion.

Find this block (inside the test `'builds a full step sequence and creates a mode:"lesson" session'`):

```typescript
    // listening_present + its 2 comprehension questions sit right after vocab_repeat, before the first guided_convo
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    const firstGuidedConvoIndex = steps.findIndex(s => s.type === 'guided_convo')
    expect(steps[vocabRepeatIndex + 1].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 2].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('guided_convo')
    expect(firstGuidedConvoIndex).toBe(vocabRepeatIndex + 4)
```

Replace with:

```typescript
    // review sits right after vocab_repeat; listening_present + its 2 comprehension
    // questions come after that, before the first guided_convo
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    const firstGuidedConvoIndex = steps.findIndex(s => s.type === 'guided_convo')
    expect(steps[vocabRepeatIndex + 1].type).toBe('review')
    expect(steps[vocabRepeatIndex + 2].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 5].type).toBe('guided_convo')
    expect(firstGuidedConvoIndex).toBe(vocabRepeatIndex + 5)
```

Find this block (inside the test `'truncates listening_questions to exactly 2 when AI returns 3+'`):

```typescript
    // Verify exactly 2 listening questions appear in steps
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    expect(steps[vocabRepeatIndex + 1].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 2].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('guided_convo')
```

Replace with:

```typescript
    // Verify exactly 2 listening questions appear in steps
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    expect(steps[vocabRepeatIndex + 1].type).toBe('review')
    expect(steps[vocabRepeatIndex + 2].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 5].type).toBe('guided_convo')
```

- [ ] **Step 2: Add a new failing test dedicated to the review step's content**

Add this test case at the end of the file's `describe('POST /api/lesson/generate', ...)` block, right before its closing `})`:

```typescript
  it('includes a review flashcard step right after vocab_repeat, with a fixed Portuguese instruction', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-review' })

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
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string; instruction_pt?: string }>

    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    const reviewStep = steps[vocabRepeatIndex + 1]
    expect(reviewStep.type).toBe('review')
    expect(reviewStep.instruction_pt).toBe('Vamos revisar o que você aprendeu! Tente lembrar antes de ver a tradução.')
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: FAIL — 3 failures (the 2 updated sequencing assertions, since no `review` step exists yet, plus the new dedicated test)

- [ ] **Step 4: Write the implementation**

In `app/api/lesson/generate/route.ts`, find this block inside `buildSteps()`:

```typescript
  const lastVocab = content.vocabulary[content.vocabulary.length - 1]
  if (lastVocab) {
    steps.push({
      id: nextId('vr'),
      type: 'vocab_repeat',
      vocab_index: content.vocabulary.length - 1,
      instruction_pt: `Pratique a pronúncia de "${lastVocab.word}"`,
    })
  }

  steps.push({
    id: nextId('ln'),
    type: 'listening_present',
```

Insert a new `steps.push` between the `vocab_repeat` block and the `listening_present` push:

```typescript
  const lastVocab = content.vocabulary[content.vocabulary.length - 1]
  if (lastVocab) {
    steps.push({
      id: nextId('vr'),
      type: 'vocab_repeat',
      vocab_index: content.vocabulary.length - 1,
      instruction_pt: `Pratique a pronúncia de "${lastVocab.word}"`,
    })
  }

  steps.push({
    id: nextId('rv'),
    type: 'review',
    instruction_pt: 'Vamos revisar o que você aprendeu! Tente lembrar antes de ver a tradução.',
  })

  steps.push({
    id: nextId('ln'),
    type: 'listening_present',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: PASS (all pre-existing tests, including the 2 updated ones, plus the 1 new one)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Run the full suite**

Run: `npm run test:run`
Expected: PASS — no regressions. `__tests__/components/lesson/ReviewStep.test.tsx` and any `LessonEngine.test.tsx` cases touching `'review'` steps were already passing before this change (they construct their own fixture `lesson.steps` arrays directly and don't call `buildSteps()`); confirm they remain green, proving the already-built component and render case work correctly now that they're actually reachable.

- [ ] **Step 8: Commit**

```bash
git add app/api/lesson/generate/route.ts __tests__/app/api/lesson/generate.test.ts
git commit -m "feat: wire the ReviewStep flashcard into every generated lesson

ReviewStep and LessonEngine's render case for it have existed since
July 4, fully built and tested, but buildSteps() never emitted a
'review' step, so no student could ever reach it. Inserts it right
after vocab_repeat, before listening_present."
```

---

## Final Check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Manual pass: complete a generated lesson end-to-end and confirm the flashcard review screen (word shown, "Ver tradução" button, "Sabia!"/"Não sabia" buttons, ending "Revisão completa!" summary) appears right after finishing the last vocabulary word's pronunciation practice (`vocab_repeat`), before the listening passage.
- [ ] No database migration and no Vercel-specific changes are introduced by this plan — after merging, a normal `vercel --prod` picks up the change.
