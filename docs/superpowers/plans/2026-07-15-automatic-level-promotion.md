# Automatic Level Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student has mastered every topic of their current CEFR level (and isn't currently in reinforcement mode), automatically promote them to the next level and celebrate it in the session report shown right after the triggering lesson.

**Architecture:** `checkAndApplyLevelPromotion()` in `lib/levels.ts` is a structural mirror of the already-shipped `checkAndApplyReinforcementReturn()` — same "every topic mastered" check, opposite direction (`levelAbove()` instead of a stored reinforcement target), and both are called unconditionally after every lesson assessment since they're mutually exclusive by construction. The result flows through the existing assess-response → `AulaClient` → `SessionReport` pipeline that already carries the mastery assessment back to the student.

**Tech Stack:** Next.js App Router, Supabase (Postgres + `@supabase/supabase-js`), React (client components), Vitest + Testing Library, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-15-automatic-level-promotion-design.md`

## Global Constraints

- All new/changed user-facing copy is in Portuguese (pt-BR).
- Tests use Vitest (`npm run test:run`), with `// @vitest-environment node` for API routes and `// @vitest-environment jsdom` for components, matching existing test files exactly.
- Promotion never fires while `reinforcement_target_level` is set — the two flows are mutually exclusive and must stay that way.
- No changes to `placement_results`/`learning_plans` — `users.cefr_level` remains the single live source of truth.
- Reuses the exact "every topic mastered" check `checkAndApplyReinforcementReturn()` already uses — no new/different mastery bar.

---

## Task 1: `lib/levels.ts` — `levelAbove()` + `checkAndApplyLevelPromotion()`

**Files:**
- Create: `supabase/migrations/20260715000001_level_promotion.sql`
- Modify: `lib/levels.ts`
- Modify: `__tests__/lib/levels.test.ts`

**Interfaces:**
- Produces: `levelAbove(level: CefrLevel): CefrLevel | null` and `checkAndApplyLevelPromotion(supabase: SupabaseClient, userId: string): Promise<CefrLevel | null>` — both consumed by Task 2 (`app/api/session/[id]/assess/route.ts`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260715000001_level_promotion.sql

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

The constraint name `level_history_reason_check` is Postgres's default auto-generated name for an unnamed inline `CHECK` on the `reason` column of `level_history` (confirmed against `supabase/migrations/20260713000002_level_state_machine.sql`, which created the column with an inline, unnamed `CHECK`). Before applying, verify this is still the actual constraint name against the live schema (e.g. via the Supabase MCP `list_migrations`/schema inspection, or `SELECT conname FROM pg_constraint WHERE conrelid = 'level_history'::regclass`) — if it differs, use the real name instead.

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `level_promotion`) or the project's normal migration-apply command.
Expected: migration applies with no errors; a row insert into `level_history` with `reason = 'auto_promotion'` succeeds.

- [ ] **Step 3: Write the failing tests**

Append to `__tests__/lib/levels.test.ts`:

```ts
import { checkAndApplyLevelPromotion, levelAbove } from '@/lib/levels'

describe('levelAbove', () => {
  it('returns the next level for a mid-range level', () => {
    expect(levelAbove('B1')).toBe('B2')
  })

  it('returns null for C2 (nothing above the ceiling)', () => {
    expect(levelAbove('C2')).toBeNull()
  })

  it('returns the level above A1', () => {
    expect(levelAbove('A1')).toBe('A2')
  })
})

describe('checkAndApplyLevelPromotion', () => {
  it('returns null when the user is in reinforcement mode', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'A1', reinforcement_target_level: 'A2' }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when already at the ceiling level C2', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'C2', reinforcement_target_level: null }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when not all current-level topics are mastered', async () => {
    inserted = []
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: null },
      [{ topic_id: 'introductions', mastery_status: 'mastered' }], // only 1 of 8 A1 topics
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('promotes to the next level once every current-level topic is mastered', async () => {
    inserted = []
    const a1TopicIds = ['introductions', 'family', 'numbers-dates', 'colors', 'daily-routine', 'food', 'greetings', 'home']
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: null },
      a1TopicIds.map((topic_id) => ({ topic_id, mastery_status: 'mastered' })),
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBe('A2')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'A1', to_level: 'A2', reason: 'auto_promotion',
    }])
  })
})
```

This reuses the `makeReturnChain` helper and the module-level `inserted` array already defined earlier in this test file (from `checkAndApplyReinforcementReturn`'s tests) — no new test helpers needed.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: FAIL — `checkAndApplyLevelPromotion`/`levelAbove` are not exported from `@/lib/levels`

- [ ] **Step 5: Write the implementation**

Append to `lib/levels.ts`:

```ts
export function levelAbove(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx < CEFR_ORDER.length - 1 ? CEFR_ORDER[idx + 1] : null
}

export async function checkAndApplyLevelPromotion(
  supabase: SupabaseClient,
  userId: string,
): Promise<CefrLevel | null> {
  const { data: userRow } = await supabase
    .from('users')
    .select('cefr_level, reinforcement_target_level')
    .eq('id', userId)
    .single()

  const cefrLevel = (userRow as { cefr_level?: CefrLevel | null } | null)?.cefr_level
  const reinforcementTargetLevel = (userRow as { reinforcement_target_level?: CefrLevel | null } | null)
    ?.reinforcement_target_level

  if (!cefrLevel || reinforcementTargetLevel) return null

  const target = levelAbove(cefrLevel)
  if (!target) return null

  const topics = getTopicsForLevel(cefrLevel)
  if (topics.length === 0) return null

  const { data: progressRows } = await supabase
    .from('user_topic_progress')
    .select('topic_id, mastery_status')
    .eq('user_id', userId)
    .eq('cefr_level', cefrLevel)

  const masteredTopicIds = new Set(
    ((progressRows ?? []) as { topic_id: string; mastery_status: string }[])
      .filter((r) => r.mastery_status === 'mastered')
      .map((r) => r.topic_id),
  )

  const allMastered = topics.every((t) => masteredTopicIds.has(t.key))
  if (!allMastered) return null

  await supabase.from('users').update({
    cefr_level: target,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId,
    from_level: cefrLevel,
    to_level: target,
    reason: 'auto_promotion',
  })

  return target
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/levels.test.ts`
Expected: PASS (25 tests — 21 pre-existing + 4 new)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260715000001_level_promotion.sql lib/levels.ts __tests__/lib/levels.test.ts
git commit -m "feat: add automatic level promotion when every current-level topic is mastered"
```

---

## Task 2: Wire promotion into `/api/session/[id]/assess`

**Files:**
- Modify: `app/api/session/[id]/assess/route.ts`
- Modify: `__tests__/app/api/session/assess.test.ts`

**Interfaces:**
- Consumes: `checkAndApplyLevelPromotion(supabase, userId)` (Task 1).
- Produces: the route's JSON response gains `level_promotion: { from: CefrLevel; to: CefrLevel } | null` — consumed by Task 4 (`AulaClient`).

- [ ] **Step 1: Update the test mocks and write the failing tests**

In `__tests__/app/api/session/assess.test.ts`, change the existing `@/lib/levels` mock:

```ts
const mockCheckReinforcementReturn = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const mockCheckLevelPromotion = vi.hoisted(() => vi.fn().mockResolvedValue(null))
vi.mock('@/lib/levels', () => ({
  checkAndApplyReinforcementReturn: mockCheckReinforcementReturn,
  checkAndApplyLevelPromotion: mockCheckLevelPromotion,
}))
```

Append two new tests inside the `describe('POST /api/session/[id]/assess', ...)` block, after the existing `'checks for reinforcement auto-return after recording the assessment'` test:

```ts
  it('checks for level promotion after recording the assessment', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'travel', lesson_topic_id: 'travel' })
    const userChain = makeChain({ name: 'Maria', cefr_level: 'A1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'I went to Portugal last year.' },
      { role: 'assistant', text: 'That sounds amazing! Tell me more.' },
      { role: 'user', text: 'I visited Lisbon and Porto.' },
      { role: 'assistant', text: 'Did you enjoy the food?' },
      { role: 'user', text: 'Yes, I loved it a lot.' },
    ])
    const progressChain = makeChain(null)
    const assessmentsInsertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return assessmentsInsertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78,
            grammar: 72, confidence: 80, fluency: 74,
            feedback_pt: 'Você foi muito bem!', highlight_pt: 'Ótimo vocabulário.',
          }),
        },
      }],
    })

    await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )

    expect(mockCheckLevelPromotion).toHaveBeenCalledWith(expect.anything(), 'u1')
  })

  it('includes level_promotion in the response when a promotion occurs', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckLevelPromotion.mockResolvedValueOnce('A2')

    const sessionChain = makeChain({ id: 'sess-1', user_id: 'u1', topic: 'travel', lesson_topic_id: 'travel' })
    const userChain = makeChain({ name: 'Maria', cefr_level: 'A1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'I went to Portugal last year.' },
      { role: 'assistant', text: 'That sounds amazing! Tell me more.' },
      { role: 'user', text: 'I visited Lisbon and Porto.' },
      { role: 'assistant', text: 'Did you enjoy the food?' },
      { role: 'user', text: 'Yes, I loved it a lot.' },
    ])
    const progressChain = makeChain(null)
    const assessmentsInsertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return assessmentsInsertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78,
            grammar: 72, confidence: 80, fluency: 74,
            feedback_pt: 'Você foi muito bem!', highlight_pt: 'Ótimo vocabulário.',
          }),
        },
      }],
    })

    const res = await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )
    const body = await res.json()

    expect(body.level_promotion).toEqual({ from: 'A1', to: 'A2' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: FAIL — `mockCheckLevelPromotion` was never called; `body.level_promotion` is `undefined`

- [ ] **Step 3: Update the route**

In `app/api/session/[id]/assess/route.ts`, change the import:

```ts
import { checkAndApplyReinforcementReturn, checkAndApplyLevelPromotion } from '@/lib/levels'
```

Change the line that currently reads:

```ts
  await checkAndApplyReinforcementReturn(supabase, user.id)

  return NextResponse.json({
    scores,
    final_score: finalScore,
    passed,
    failed_competencies: failedCompetencies,
    feedback_pt: feedbackPt,
    highlight_pt: highlightPt,
    attempt_count: attemptCount,
    next_methodology: newLastMethodology,
  })
```

to:

```ts
  await checkAndApplyReinforcementReturn(supabase, user.id)
  const promotedTo = await checkAndApplyLevelPromotion(supabase, user.id)

  return NextResponse.json({
    scores,
    final_score: finalScore,
    passed,
    failed_competencies: failedCompetencies,
    feedback_pt: feedbackPt,
    highlight_pt: highlightPt,
    attempt_count: attemptCount,
    next_methodology: newLastMethodology,
    level_promotion: promotedTo ? { from: cefrLevel, to: promotedTo } : null,
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/session/assess.test.ts`
Expected: PASS (5 tests — 3 pre-existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add app/api/session/\[id\]/assess/route.ts __tests__/app/api/session/assess.test.ts
git commit -m "feat: check for level promotion and surface it in the assess response"
```

---

## Task 3: `SessionReport` — celebration banner

**Files:**
- Modify: `components/aula/SessionReport.tsx`
- Modify: `__tests__/components/aula/SessionReport.test.tsx`

**Interfaces:**
- Produces: new prop `levelPromotion?: { from: CefrLevel; to: CefrLevel } | null` — consumed by Task 4 (`AulaClient`).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/aula/SessionReport.test.tsx`:

```tsx
  it('shows the level promotion banner when levelPromotion is provided', () => {
    render(<SessionReport {...defaultProps} levelPromotion={{ from: 'A2', to: 'B1' }} />)
    expect(screen.getByText('🎉 Você subiu de nível!')).toBeInTheDocument()
    expect(screen.getByText('Parabéns! Você dominou tudo do A2 e agora está no B1.')).toBeInTheDocument()
  })

  it('does not show the level promotion banner when levelPromotion is absent', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.queryByText('🎉 Você subiu de nível!')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/aula/SessionReport.test.tsx`
Expected: FAIL — the banner text never renders (prop doesn't exist yet)

- [ ] **Step 3: Update the component**

In `components/aula/SessionReport.tsx`, add the import:

```tsx
import type { CefrLevel } from '@/types'
```

Add the new prop to `SessionReportProps`:

```ts
interface SessionReportProps {
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
  assessment?: AssessmentData | null
  levelPromotion?: { from: CefrLevel; to: CefrLevel } | null
  onClose: () => void
}
```

Destructure it in the component signature:

```tsx
export function SessionReport({
  userMessages,
  corrections,
  pronunciationHints,
  durationSeconds,
  missionCompleted,
  missionTitle,
  assessment,
  levelPromotion,
  onClose,
}: SessionReportProps) {
```

Add the banner as the first child inside the modal's inner `<div>`, right before the existing `"Resumo da aula"` header block:

```tsx
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5 my-4">
        {levelPromotion && (
          <div className="rounded-xl p-4 bg-gradient-to-r from-brand-cta to-brand-interactive text-center">
            <p className="text-lg font-black text-content-dark">🎉 Você subiu de nível!</p>
            <p className="text-sm text-content-dark mt-1">
              Parabéns! Você dominou tudo do {levelPromotion.from} e agora está no {levelPromotion.to}.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
```

(Only the `{levelPromotion && (...)}` block is new — the existing `<div className="flex items-center justify-between">` line and everything after it stays exactly as it is today.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/aula/SessionReport.test.tsx`
Expected: PASS (7 tests — 5 pre-existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add components/aula/SessionReport.tsx __tests__/components/aula/SessionReport.test.tsx
git commit -m "feat: show a celebration banner in SessionReport on level promotion"
```

---

## Task 4: `AulaClient` — thread `level_promotion` through to the report

**Files:**
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `level_promotion` field on the `/api/session/[id]/assess` response (Task 2); `SessionReport`'s `levelPromotion` prop (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/app/aula/AulaClient.test.tsx`, inside the `describe('AulaClient', ...)` block, after the existing `'shows session report modal after ending session'` test:

```tsx
  it('shows the level promotion banner when the assess response includes level_promotion', async () => {
    const endSessionMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: endSessionMock,
      retryAudio: vi.fn(),
    })

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/assess')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scores: { speaking: 75, listening: 80, pronunciation: 70, vocabulary: 78, grammar: 72, confidence: 80, fluency: 74 },
            final_score: 75,
            passed: true,
            failed_competencies: [],
            feedback_pt: 'Muito bem!',
            highlight_pt: 'Ótimo!',
            attempt_count: 1,
            level_promotion: { from: 'A2', to: 'B1' },
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          userMessages: 3,
          corrections: 1,
          pronunciationHints: 0,
          durationSeconds: 120,
          missionCompleted: false,
          missionTitle: 'Apresentação completa',
        }),
      })
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    const endButton = screen.getByText(/encerrar aula/i)
    await act(async () => { fireEvent.click(endButton) })
    await waitFor(() => expect(screen.getByText('🎉 Você subiu de nível!')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/aula/AulaClient.test.tsx`
Expected: FAIL — the banner text never appears (`level_promotion` isn't threaded through to `SessionReport` yet)

- [ ] **Step 3: Update the component**

In `app/aula/AulaClient.tsx`, update the `reportData` state type (around line 57) to add `levelPromotion`:

```ts
  const [reportData, setReportData] = useState<{
    userMessages: number
    corrections: number
    pronunciationHints: number
    durationSeconds: number
    missionCompleted: boolean
    missionTitle: string
    assessment?: {
      scores: CompetencyScores
      final_score: number
      passed: boolean
      failed_competencies: string[]
      feedback_pt: string
      highlight_pt: string
      attempt_count: number
    } | null
    levelPromotion?: { from: CefrLevel; to: CefrLevel } | null
  } | null>(null)
```

`CefrLevel` is already imported at `app/aula/AulaClient.tsx:27` (`import type { Teacher, ConversationResponse, CefrLevel } from '@/types'`) — no new import needed.

Update `handleEnd()` (around line 247) — change:

```ts
      if (reportRes.status === 'fulfilled' && reportRes.value.ok) {
        const data = await reportRes.value.json()
        let assessment = null
        if (assessRes.status === 'fulfilled' && assessRes.value.ok) {
          const a = await assessRes.value.json()
          if (!a.too_short && !a.error) assessment = a
        }
        setReportData({ ...data, assessment })
        setShowReport(true)
        return
      }
```

to:

```ts
      if (reportRes.status === 'fulfilled' && reportRes.value.ok) {
        const data = await reportRes.value.json()
        let assessment = null
        let levelPromotion = null
        if (assessRes.status === 'fulfilled' && assessRes.value.ok) {
          const a = await assessRes.value.json()
          if (!a.too_short && !a.error) assessment = a
          levelPromotion = a.level_promotion ?? null
        }
        setReportData({ ...data, assessment, levelPromotion })
        setShowReport(true)
        return
      }
```

Update the `<SessionReport>` JSX (around line 369) to pass the new prop:

```tsx
        {showReport && reportData && (
          <SessionReport
            userMessages={reportData.userMessages}
            corrections={reportData.corrections}
            pronunciationHints={reportData.pronunciationHints}
            durationSeconds={reportData.durationSeconds}
            missionCompleted={reportData.missionCompleted}
            missionTitle={reportData.missionTitle}
            assessment={reportData.assessment}
            levelPromotion={reportData.levelPromotion}
            onClose={handleReportClose}
          />
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/aula/AulaClient.test.tsx`
Expected: PASS (all pre-existing tests plus the new one)

- [ ] **Step 5: Run the full related test set**

Run: `npx vitest run __tests__/lib/levels.test.ts __tests__/app/api/session/ __tests__/components/aula/ __tests__/app/aula/`
Expected: PASS — every test touched across Tasks 1-4, no regressions.

- [ ] **Step 6: Commit**

```bash
git add app/aula/AulaClient.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: thread level_promotion from the assess response into the session report"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files (standing final-check habit from the two prior features).
- [ ] Confirm the migration applied to the live Supabase project (`list_migrations`) — this feature, unlike the two prior ones, does touch the database.
- [ ] Manual pass: get a test account's `user_topic_progress` to `mastery_status = 'mastered'` on every topic of its current level (not in reinforcement mode — `reinforcement_target_level` must be `null`), complete one more lesson, confirm the session report shows the "🎉 Você subiu de nível!" banner and the profile's `LevelCard` reflects the new level afterward.
