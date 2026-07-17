# Menos Português ao Longo do Tempo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grammar/exercise explanations (`lesson/generate`) and post-session feedback (`session/assess`) progressively shorter and more English as a student's CEFR level rises, reusing the same three-tier grouping (A1/A2, B1/B2, C1/C2) already used by `interventionBlock` in `conversation/route.ts`.

**Architecture:** A new pure function, `getPortugueseTier(cefrLevel)` in `lib/language-mix.ts`, centralizes the three-tier boundary so it can't drift between the two consuming routes. Each route keeps its own tier-keyed instruction-text table (the wording differs by context) and interpolates the right entry into its existing AI prompt based on the tier. No new AI call, no schema change — purely a prompt-content change to two calls that already exist.

**Tech Stack:** Next.js App Router (API routes), TypeScript, Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-17-menos-portugues-design.md`

## Global Constraints

- Exactly 3 tiers: `full` (A1, A2), `reduced` (B1, B2), `minimal` (C1, C2) — matches `interventionBlock`'s existing grouping in `app/api/conversation/route.ts` verbatim; do not introduce a different boundary.
- `reply_pt` (conversation route's opt-in translation toggle) and `translation_pt` (new-vocabulary teaching) are untouched by this plan — no task modifies them.
- No new AI call anywhere in this plan — every change interpolates different text into a prompt an existing call already sends.
- No new database column, no new table, no feature flag.
- At every tier, the underlying pedagogical framing in `session/assess`'s feedback instructions stays intact: always positive, never says "reprovado", "falhou", or "errado" — only length and language mix change.

---

## Task 1: `lib/language-mix.ts` — shared tier function

**Files:**
- Create: `lib/language-mix.ts`
- Test: `__tests__/lib/language-mix.test.ts`

**Interfaces:**
- Produces: `PortugueseTier` type (`'full' | 'reduced' | 'minimal'`), `getPortugueseTier(cefrLevel: string): PortugueseTier` — consumed by Task 2 (`lesson/generate`) and Task 3 (`session/assess`).

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/language-mix.test.ts
import { describe, it, expect } from 'vitest'
import { getPortugueseTier } from '@/lib/language-mix'

describe('getPortugueseTier', () => {
  it('returns full for A1 and A2', () => {
    expect(getPortugueseTier('A1')).toBe('full')
    expect(getPortugueseTier('A2')).toBe('full')
  })

  it('returns reduced for B1 and B2', () => {
    expect(getPortugueseTier('B1')).toBe('reduced')
    expect(getPortugueseTier('B2')).toBe('reduced')
  })

  it('returns minimal for C1 and C2', () => {
    expect(getPortugueseTier('C1')).toBe('minimal')
    expect(getPortugueseTier('C2')).toBe('minimal')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/language-mix.test.ts`
Expected: FAIL — `@/lib/language-mix` module not found

- [ ] **Step 3: Write the implementation**

```typescript
// lib/language-mix.ts
export type PortugueseTier = 'full' | 'reduced' | 'minimal'

export function getPortugueseTier(cefrLevel: string): PortugueseTier {
  if (cefrLevel === 'A1' || cefrLevel === 'A2') return 'full'
  if (cefrLevel === 'B1' || cefrLevel === 'B2') return 'reduced'
  return 'minimal'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/language-mix.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/language-mix.ts __tests__/lib/language-mix.test.ts
git commit -m "feat: add getPortugueseTier, a shared CEFR-to-language-mix boundary"
```

---

## Task 2: Tiered explanation language in `/api/lesson/generate`

**Files:**
- Modify: `app/api/lesson/generate/route.ts`
- Modify: `__tests__/app/api/lesson/generate.test.ts`

**Interfaces:**
- Consumes: `getPortugueseTier` (Task 1).

- [ ] **Step 1: Add the failing test cases**

Open `__tests__/app/api/lesson/generate.test.ts`. It already imports `getStudentContext` from `@/lib/student-context` (added by an earlier feature) — reuse that import as-is, do not add it again. Add these two test cases at the end of the file's `describe('POST /api/lesson/generate', ...)` block, right before its closing `})`:

```typescript
  it('includes the full-Portuguese explanation instruction in the prompt for an A1 student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })
    // The file's default getStudentContext mock already returns cefrLevel: 'A1'.

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-lang-a1' })

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

    const promptArg = mockChatCreate.mock.calls[0][0]
    expect(promptArg.messages[0].content).toContain('Write every "explanation_pt" field as 1-2 full sentences in Portuguese.')
  })

  it('includes the minimal-Portuguese explanation instruction in the prompt for a C1 student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })
    vi.mocked(getStudentContext).mockResolvedValueOnce({
      userId: 'user-1', name: 'Ana', cefrLevel: 'C1', personalContext: [], goal: null,
      focusAreas: [], taughtTopicIds: [], topicsNeedingReview: [], frequentErrors: [],
      recentSessionSummary: null, biggestDifficulty: null, streakDays: 0,
    })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'C1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-lang-c1' })

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

    const promptArg = mockChatCreate.mock.calls[0][0]
    expect(promptArg.messages[0].content).toContain('Write every "explanation_pt" field mostly in English')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: FAIL — the prompt does not yet contain either instruction string

- [ ] **Step 3: Write the implementation**

In `app/api/lesson/generate/route.ts`, add the import alongside the existing ones:

```typescript
import { getPortugueseTier, type PortugueseTier } from '@/lib/language-mix'
```

Add this constant after the `AiLessonContent` interface (before `fallbackAiContent`):

```typescript
const EXPLANATION_INSTRUCTIONS: Record<PortugueseTier, string> = {
  full: 'Write every "explanation_pt" field as 1-2 full sentences in Portuguese.',
  reduced: 'Write every "explanation_pt" field as 1 short sentence, mixing in English grammar/vocabulary terms naturally.',
  minimal: 'Write every "explanation_pt" field mostly in English, with at most a couple of Portuguese words only if a term has no clear English equivalent.',
}
```

Find this block in the prompt template (inside `POST()`):

```typescript
VOCABULARY COUNT: exactly ${shape.vocabCount} words/phrases, appropriate for ${cefrLevel}
${retryNote}

Return ONLY valid JSON:
```

Change to:

```typescript
VOCABULARY COUNT: exactly ${shape.vocabCount} words/phrases, appropriate for ${cefrLevel}
${retryNote}

LANGUAGE MIX: ${EXPLANATION_INSTRUCTIONS[getPortugueseTier(cefrLevel)]}

Return ONLY valid JSON:
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/app/api/lesson/generate.test.ts`
Expected: PASS (all pre-existing tests plus the 2 new ones)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/api/lesson/generate/route.ts __tests__/app/api/lesson/generate.test.ts
git commit -m "feat: tier grammar/exercise explanation language by CEFR level"
```

---

## Task 3: Tiered feedback language in `/api/session/[id]/assess`

**Files:**
- Modify: `app/api/session/[id]/assess/route.ts`
- Modify: `__tests__/app/api/session/assess.test.ts`

**Interfaces:**
- Consumes: `getPortugueseTier` (Task 1).

- [ ] **Step 1: Add the failing test cases**

Open `__tests__/app/api/session/assess.test.ts`. Add these two test cases at the end of the file's `describe('POST /api/session/[id]/assess', ...)` block, right before its closing `})`:

```typescript
  it('includes the full-Portuguese feedback instruction in the prompt for an A1 student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'travel', lesson_topic_id: 'travel' })
    const userChain = makeChain({ name: 'Ana', cefr_level: 'A1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'How are you' }, { role: 'assistant', text: 'Good' },
      { role: 'user', text: 'Great' },
    ])
    const progressChain = makeChain(null)
    const insertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return insertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78, grammar: 72, confidence: 80, fluency: 74,
        feedback_pt: 'Muito bem!', highlight_pt: 'Ótimo!',
      }) } }],
    })

    await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )

    const promptArg = mockChatCreate.mock.calls[0][0]
    expect(promptArg.messages[0].content).toContain('feedback_pt: 2-3 motivating Portuguese sentences.')
  })

  it('includes the minimal-Portuguese feedback instruction in the prompt for a C1 student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'travel', lesson_topic_id: 'travel' })
    const userChain = makeChain({ name: 'Ana', cefr_level: 'C1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'How are you' }, { role: 'assistant', text: 'Good' },
      { role: 'user', text: 'Great' },
    ])
    const progressChain = makeChain(null)
    const insertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return insertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        speaking: 85, listening: 88, pronunciation: 82, vocabulary: 90, grammar: 87, confidence: 85, fluency: 86,
        feedback_pt: 'Great job!', highlight_pt: 'Excellent fluency!',
      }) } }],
    })

    await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )

    const promptArg = mockChatCreate.mock.calls[0][0]
    expect(promptArg.messages[0].content).toContain('feedback_pt: 1 short sentence, mostly in English')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: FAIL — the prompt still contains the old fixed feedback instruction lines, not the tiered ones

- [ ] **Step 3: Write the implementation**

In `app/api/session/[id]/assess/route.ts`, add the import alongside the existing ones:

```typescript
import { getPortugueseTier, type PortugueseTier } from '@/lib/language-mix'
```

Add this constant after the imports, before `export async function POST(...)`:

```typescript
const FEEDBACK_INSTRUCTIONS: Record<PortugueseTier, string> = {
  full: 'feedback_pt: 2-3 motivating Portuguese sentences. Highlight progress, frame weaknesses positively. NEVER say "reprovado", "falhou", "errado".\nhighlight_pt: Their single biggest strength, 1 sentence in Portuguese.',
  reduced: 'feedback_pt: 1-2 short sentences mixing Portuguese and English naturally. Highlight progress, frame weaknesses positively. NEVER say "reprovado", "falhou", "errado".\nhighlight_pt: Their single biggest strength, 1 short sentence mixing Portuguese and English.',
  minimal: 'feedback_pt: 1 short sentence, mostly in English, with Portuguese only for a word of encouragement if natural. Frame weaknesses positively. NEVER say "reprovado", "falhou", "errado".\nhighlight_pt: Their single biggest strength, 1 short sentence mostly in English.',
}
```

Find this block in the prompt template (inside `POST()`):

```typescript
feedback_pt: 2-3 motivating Portuguese sentences. Highlight progress, frame weaknesses positively. NEVER say "reprovado", "falhou", "errado".
highlight_pt: Their single biggest strength, 1 sentence in Portuguese.

Respond ONLY valid JSON:
```

Change to:

```typescript
${FEEDBACK_INSTRUCTIONS[getPortugueseTier(cefrLevel)]}

Respond ONLY valid JSON:
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: PASS (all pre-existing tests plus the 2 new ones)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full suite**

Run: `npm run test:run`
Expected: PASS — every test file from Tasks 1-3 plus the full pre-existing suite, no regressions.

- [ ] **Step 7: Commit**

```bash
git add app/api/session/[id]/assess/route.ts __tests__/app/api/session/assess.test.ts
git commit -m "feat: tier post-session feedback language by CEFR level"
```

---

## Final Check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Manual pass: as a low-level (A1/A2) student, generate a lesson and confirm the grammar explanation and exercise feedback still read as full Portuguese sentences, matching pre-existing behavior. As a high-level (C1/C2) student (or by temporarily editing a test account's `cefr_level`), generate a lesson and complete an assessed session, confirming the explanations and session feedback now read mostly in English with Portuguese used sparingly.
- [ ] No database migration and no Vercel-specific changes are introduced by this plan — after merging, a normal `vercel --prod` picks up the change (no `apply_migration` step needed, unlike prior features this cycle).
