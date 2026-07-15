# In-Lesson Adaptive Difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, during a single guided lesson, when a student is struggling (wrong exercise answers, poor pronunciation scores, heavily-corrected guided conversation) and, once detected, simplify the rest of that lesson: slower speech, pre-revealed translations, shorter dialogues, an extra practice repetition on missed exercises, and one AI-generated extra example for the next new vocabulary word.

**Architecture:** A new pure module, `lib/adaptive-difficulty.ts`, holds the struggle-detection threshold. `LessonEngine` becomes the single owner of struggle state (`struggleEvents`, `strugglingMode`) and of a mutable local copy of the step array (so it can patch not-yet-seen steps and splice in a retry). Every other touched component gains either a `strugglingMode` prop (to change its own rendering/requests) or a richer callback signature (to report a correctness/correction signal upward) — none of them own any adaptive logic themselves.

**Tech Stack:** Next.js App Router, React (client components), OpenAI (`gpt-4o-mini` for content, `tts-1` for speech), Vitest + Testing Library, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-14-adaptive-lesson-difficulty-design.md`

## Corrections made while planning (vs. the design doc)

Two points in the design doc turned out to be imprecise once the exact generated-lesson shape was inspected file-by-file while writing this plan. Both are corrected here; the *intent* of each adaptation is unchanged:

1. **Adaptation #4 ("extra guided practice") clones the missed exercise step itself, not a `vocab_repeat` step.** `app/api/lesson/generate/route.ts`'s `buildSteps()` only ever emits ONE `vocab_repeat` step total (for the last vocabulary word) — most words never get one, so "clone that word's `vocab_repeat` step" is impossible in the general case. Instead, when an `exercise_choice`/`exercise_fill_blank` step is answered wrong, the engine clones *that exact step* (same content, new id) and splices the copy in immediately after — the student gets the identical question again as a second attempt.
2. **The extra-example endpoint derives `cefr_level` server-side** (via `users.cefr_level`, looked up with the authenticated user's id) instead of accepting it as a client-supplied field, matching the security posture established in the level state machine work (never trust a client-sent value the server can look up itself). The client only sends `{ word }`.

## Global Constraints

- All new/changed user-facing copy is in Portuguese (pt-BR).
- Tests use Vitest (`npm run test:run`), with `// @vitest-environment node` for API routes and `// @vitest-environment jsdom` for components, matching existing test files exactly.
- This feature applies **only** to guided lessons (`LessonEngine`) — Prática Livre / free conversation is untouched.
- Once `strugglingMode` becomes `true` for a lesson, it never reverts to `false` within that lesson.
- No new Supabase tables or columns — all struggle state lives in `LessonEngine`'s React state for the duration of the browser tab, consistent with the rest of `LessonEngine`'s progress not surviving a page reload today.
- TTS `speed` values must stay within OpenAI's supported range `[0.25, 4.0]`.
- Follow existing patterns exactly: FormData-based TTS requests, `gpt-4o-mini` + `response_format: { type: 'json_object' }` for generated content, the auth-check-then-401 pattern (`createSupabaseServer()` + `auth.getUser()`) on every new/modified API route.

---

## Task 1: `lib/adaptive-difficulty.ts` — struggle-mode threshold

**Files:**
- Create: `lib/adaptive-difficulty.ts`
- Test: `__tests__/lib/adaptive-difficulty.test.ts`

**Interfaces:**
- Produces: `shouldEnterStruggleMode(struggleEvents: number): boolean` — consumed by Task 10 (`LessonEngine`).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/adaptive-difficulty.test.ts
import { describe, it, expect } from 'vitest'
import { shouldEnterStruggleMode } from '@/lib/adaptive-difficulty'

describe('shouldEnterStruggleMode', () => {
  it('is false with zero events', () => {
    expect(shouldEnterStruggleMode(0)).toBe(false)
  })

  it('is false with one event', () => {
    expect(shouldEnterStruggleMode(1)).toBe(false)
  })

  it('is true with exactly two events', () => {
    expect(shouldEnterStruggleMode(2)).toBe(true)
  })

  it('stays true with more than two events', () => {
    expect(shouldEnterStruggleMode(3)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/adaptive-difficulty.test.ts`
Expected: FAIL — `Cannot find module '@/lib/adaptive-difficulty'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/adaptive-difficulty.ts
export function shouldEnterStruggleMode(struggleEvents: number): boolean {
  return struggleEvents >= 2
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/adaptive-difficulty.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/adaptive-difficulty.ts __tests__/lib/adaptive-difficulty.test.ts
git commit -m "feat: add struggle-mode detection threshold"
```

---

## Task 2: `lib/tts.ts` — add a `speed` parameter

**Files:**
- Modify: `lib/tts.ts:3-16`
- Modify: `__tests__/lib/tts.test.ts`

**Interfaces:**
- Produces: `synthesizeTts(text: string, voice: string, speed?: number): Promise<{ dataUrl: string; buffer: Buffer }>` (default `speed = 1.0`) — consumed by Task 3 (`/api/lesson/tts`).

- [ ] **Step 1: Add a failing test**

Append to `__tests__/lib/tts.test.ts`, inside the `describe('synthesizeTts', ...)` block:

```ts
  it('defaults to speed 1.0 when not specified', async () => {
    await synthesizeTts('Hello', 'alloy')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ speed: 1.0 }))
  })

  it('passes a custom speed through to the OpenAI call', async () => {
    await synthesizeTts('Hello', 'alloy', 0.85)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ speed: 0.85 }))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/tts.test.ts`
Expected: FAIL — `mockCreate` was called without a `speed` field (`expect.objectContaining({ speed: 1.0 })` doesn't match)

- [ ] **Step 3: Add the parameter**

In `lib/tts.ts`, change the `synthesizeTts` signature and pass `speed` through:

```ts
export async function synthesizeTts(text: string, voice: string, speed = 1.0): Promise<{ dataUrl: string; buffer: Buffer }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'mp3',
    speed,
  })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))
  return { dataUrl: `data:audio/mp3;base64,${buffer.toString('base64')}`, buffer }
}
```

`synthesizeTtsWithRetry` is unchanged — it isn't on the call path for lesson TTS (only `/api/conversation/audio` uses it, which is out of scope for this feature).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/tts.test.ts`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/tts.ts __tests__/lib/tts.test.ts
git commit -m "feat: add optional speed parameter to synthesizeTts"
```

---

## Task 3: `/api/lesson/tts` — accept a `speed` field

**Files:**
- Modify: `app/api/lesson/tts/route.ts`
- Create: `__tests__/app/api/lesson/tts.test.ts`

**Interfaces:**
- Consumes: `synthesizeTts(text, voice, speed?)` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/api/lesson/tts.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockSynthesizeTts = vi.hoisted(() => vi.fn().mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,AAAA', buffer: Buffer.from('x') }))

vi.mock('@/lib/tts', () => ({ synthesizeTts: mockSynthesizeTts }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

import { POST } from '@/app/api/lesson/tts/route'

function makeRequest(fields: Record<string, string>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/tts', { method: 'POST', body: form })
}

describe('POST /api/lesson/tts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to speed 1.0 when no speed field is sent', async () => {
    const res = await POST(makeRequest({ text: 'Hello', voice: 'alloy' }))
    expect(res.status).toBe(200)
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 1.0)
  })

  it('passes a custom speed through', async () => {
    const res = await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '0.85' }))
    expect(res.status).toBe(200)
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 0.85)
  })

  it('clamps an out-of-range speed to the valid OpenAI bounds', async () => {
    await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '10' }))
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 4.0)

    await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '0.01' }))
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 0.25)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/lesson/tts.test.ts`
Expected: FAIL — `mockSynthesizeTts` called with only 2 arguments (no speed)

- [ ] **Step 3: Update the route**

```ts
// app/api/lesson/tts/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { synthesizeTts } from '@/lib/tts'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const text = formData.get('text') as string | null
  const voice = (formData.get('voice') as string | null) ?? 'alloy'
  const speedRaw = formData.get('speed') as string | null
  const speed = speedRaw ? Math.min(4.0, Math.max(0.25, parseFloat(speedRaw))) : 1.0

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const { dataUrl } = await synthesizeTts(text, voice, speed)
    return NextResponse.json({ audio_url: dataUrl })
  } catch (err) {
    console.error('TTS error:', err)
    return NextResponse.json({ error: 'TTS failed' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/lesson/tts.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/lesson/tts/route.ts __tests__/app/api/lesson/tts.test.ts
git commit -m "feat: accept a speed field in /api/lesson/tts"
```

---

## Task 4: `ExerciseChoiceStep` — report correctness

**Files:**
- Modify: `components/lesson/ExerciseChoiceStep.tsx`
- Modify: `__tests__/components/lesson/ExerciseChoiceStep.test.tsx`

**Interfaces:**
- Produces: `onSuccess: (isCorrect: boolean) => void` (was `() => void`) — consumed by Task 10 (`LessonEngine`).

- [ ] **Step 1: Update the test**

Replace the existing `'calls onSuccess when Continuar is clicked after any answer'` test in `__tests__/components/lesson/ExerciseChoiceStep.test.tsx` with two tests:

```tsx
  it('calls onSuccess(true) when Continuar is clicked after a correct answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseChoiceStep step={step} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Obrigado'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(true)
  })

  it('calls onSuccess(false) when Continuar is clicked after a wrong answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseChoiceStep step={step} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Por favor'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(false)
  })
```

Leave every other test in the file unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/ExerciseChoiceStep.test.tsx`
Expected: FAIL — `onSuccess` was called with no arguments, `toHaveBeenCalledWith(true)`/`(false)` don't match

- [ ] **Step 3: Update the component**

In `components/lesson/ExerciseChoiceStep.tsx`, change the prop type and the button:

```tsx
interface ExerciseChoiceStepProps {
  step: StepType
  onSuccess: (isCorrect: boolean) => void
}
```

```tsx
      {answered && (
        <button
          onClick={() => onSuccess(isCorrect)}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/ExerciseChoiceStep.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/ExerciseChoiceStep.tsx __tests__/components/lesson/ExerciseChoiceStep.test.tsx
git commit -m "feat: report answer correctness from ExerciseChoiceStep"
```

---

## Task 5: `ExerciseFillBlankStep` — report correctness

**Files:**
- Modify: `components/lesson/ExerciseFillBlankStep.tsx`
- Modify: `__tests__/components/lesson/ExerciseFillBlankStep.test.tsx`

**Interfaces:**
- Produces: `onSuccess: (isCorrect: boolean) => void` (was `() => void`) — consumed by Task 10.

- [ ] **Step 1: Update the test**

Replace the existing `'calls onSuccess when Continuar is tapped after answering'` test in `__tests__/components/lesson/ExerciseFillBlankStep.test.tsx` with two tests:

```tsx
  it('calls onSuccess(true) when Continuar is tapped after a correct answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'name' } })
    fireEvent.click(screen.getByText('Verificar'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(true)
  })

  it('calls onSuccess(false) when Continuar is tapped after a wrong answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'age' } })
    fireEvent.click(screen.getByText('Verificar'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/ExerciseFillBlankStep.test.tsx`
Expected: FAIL — same reason as Task 4

- [ ] **Step 3: Update the component**

```tsx
interface ExerciseFillBlankStepProps {
  step: StepType
  onSuccess: (isCorrect: boolean) => void
}
```

```tsx
      {checked && (
        <button
          onClick={() => onSuccess(isCorrect)}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/ExerciseFillBlankStep.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/ExerciseFillBlankStep.tsx __tests__/components/lesson/ExerciseFillBlankStep.test.tsx
git commit -m "feat: report answer correctness from ExerciseFillBlankStep"
```

---

## Task 6: `GuidedConvoStep` — speed + correction-rate reporting

**Files:**
- Modify: `components/lesson/GuidedConvoStep.tsx`
- Modify: `__tests__/components/lesson/GuidedConvoStep.test.tsx`

**Interfaces:**
- Consumes: nothing new (speed is just a request field, same TTS endpoint from Task 3).
- Produces: new prop `strugglingMode?: boolean` (default `false`); `onComplete: (correctionRate: number) => void` (was `() => void`) — both consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/components/lesson/GuidedConvoStep.test.tsx`:

```tsx
  it('sends speed=0.85 in TTS requests when strugglingMode is on', async () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" strugglingMode onComplete={vi.fn()} />
    )
    await waitFor(() => {
      const ttsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/lesson/tts')
      expect(ttsCall).toBeTruthy()
      const body = ttsCall![1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('sends speed=1.0 by default', async () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    await waitFor(() => {
      const ttsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/lesson/tts')
      expect(ttsCall).toBeTruthy()
      const body = ttsCall![1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('reports the correction rate to onComplete when the conversation finishes', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' }, // initial TTS
      { message_id: 'm1', text: 'Try again', reply_pt: 'Tente de novo', transcript: 'bad answer', had_correction: true, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' }, // reply TTS after 1st exchange
      { message_id: 'm2', text: 'Great!', reply_pt: 'Ótimo!', transcript: 'good answer', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,CCCC' }, // reply TTS after 2nd exchange
    )
    const onComplete = vi.fn()
    render(
      <GuidedConvoStep step={{ ...baseStep, min_exchanges: 1 }} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={onComplete} />
    )
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => expect(screen.getByText('Pronto para continuar!')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finalizar conversa →'))
    expect(onComplete).toHaveBeenCalledWith(0.5)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/GuidedConvoStep.test.tsx`
Expected: FAIL — no `speed` field sent, `onComplete` called with no arguments

- [ ] **Step 3: Update the component**

In `components/lesson/GuidedConvoStep.tsx`:

Add `strugglingMode` to the props interface and destructure with a default:

```tsx
interface GuidedConvoStepProps {
  step: StepType
  sessionId: string
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  strugglingMode?: boolean
  onComplete: (correctionRate: number) => void
}

export function GuidedConvoStep({ step, sessionId, teacherName, teacherImageUrl, ttsVoice, strugglingMode = false, onComplete }: GuidedConvoStepProps) {
```

Add `speed` to both TTS fetch calls — in `playCurrentTts`:

```ts
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
```

and in `replayTts`:

```ts
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
```

Compute the correction rate and pass it to `onComplete`. Add this near `canComplete`:

```ts
  const canComplete = exchangeCount >= step.min_exchanges
  const studentMessages = messages.filter(m => m.role === 'student')
  const correctionRate = studentMessages.length > 0
    ? studentMessages.filter(m => m.correct === false).length / studentMessages.length
    : 0
```

And update the finish button:

```tsx
        {canComplete && (
          <button
            onClick={() => onComplete(correctionRate)}
            className="w-full py-3 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Finalizar conversa →
          </button>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/GuidedConvoStep.test.tsx`
Expected: PASS (7 tests). If the new "reports the correction rate" test's `waitFor` timing doesn't settle as written, adjust the intermediate `waitFor` assertions (not the underlying component logic) — the mock `MockAudio`/fetch-sequence pattern already used by this file's other tests is the source of truth for how the async flow actually resolves.

- [ ] **Step 5: Commit**

```bash
git add components/lesson/GuidedConvoStep.tsx __tests__/components/lesson/GuidedConvoStep.test.tsx
git commit -m "feat: add strugglingMode speed control and correction-rate reporting to GuidedConvoStep"
```

---

## Task 7: `ReviewStep` — pre-reveal translation in struggling mode

**Files:**
- Modify: `components/lesson/ReviewStep.tsx`
- Create: `__tests__/components/lesson/ReviewStep.test.tsx`

**Interfaces:**
- Produces: new prop `strugglingMode?: boolean` (default `false`) — consumed by Task 10.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/lesson/ReviewStep.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReviewStep } from '@/components/lesson/ReviewStep'

const mockStep = { id: 'rv-1', type: 'review' as const, instruction_pt: 'Revise o vocabulário de hoje.' }
const mockVocabulary = [
  { word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' },
  { word: 'Bye', translation_pt: 'Tchau', emoji: '👋', pronunciation_hint: 'bahy' },
]

describe('ReviewStep', () => {
  it('starts with translation hidden by default', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} onComplete={vi.fn()} />)
    expect(screen.queryByText('Olá')).not.toBeInTheDocument()
    expect(screen.getByText('Ver tradução')).toBeInTheDocument()
  })

  it('reveals translation on tap', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Ver tradução'))
    expect(screen.getByText('Olá')).toBeInTheDocument()
  })

  it('starts with translation already revealed when strugglingMode is on', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} strugglingMode onComplete={vi.fn()} />)
    expect(screen.getByText('Olá')).toBeInTheDocument()
    expect(screen.queryByText('Ver tradução')).not.toBeInTheDocument()
  })

  it('keeps translation pre-revealed on the next card too when strugglingMode is on', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} strugglingMode onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('✅ Sabia!'))
    expect(screen.getByText('Tchau')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/ReviewStep.test.tsx`
Expected: FAIL — 2 of the 4 tests fail (`revealed` always starts `false`, `strugglingMode` prop doesn't exist)

- [ ] **Step 3: Update the component**

```tsx
interface ReviewStepProps {
  step: StepType
  vocabulary: VocabItem[]
  strugglingMode?: boolean
  onComplete: () => void
}

export function ReviewStep({ step, vocabulary, strugglingMode = false, onComplete }: ReviewStepProps) {
  const [cardIndex, setCardIndex] = useState(0)
  const [revealed, setRevealed] = useState(strugglingMode)
  const [knewCount, setKnewCount] = useState(0)
  const [done, setDone] = useState(false)

  const current = vocabulary[cardIndex]
  const isLast = cardIndex === vocabulary.length - 1

  const mark = (knew: boolean) => {
    if (knew) setKnewCount(c => c + 1)
    if (isLast) {
      setDone(true)
    } else {
      setCardIndex(i => i + 1)
      setRevealed(strugglingMode)
    }
  }
```

(Only the two `useState(false)` occurrences for `revealed`'s initial and reset values change — everything else in the file stays the same.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/ReviewStep.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/ReviewStep.tsx __tests__/components/lesson/ReviewStep.test.tsx
git commit -m "feat: pre-reveal ReviewStep translations in struggling mode"
```

---

## Task 8: `/api/lesson/extra-example` endpoint + `ExtraExample` type

**Files:**
- Modify: `types/lesson.ts`
- Create: `app/api/lesson/extra-example/route.ts`
- Test: `__tests__/app/api/lesson/extra-example.test.ts`

**Interfaces:**
- Produces: `ExtraExample { example_sentence_en: string; example_sentence_pt: string; explanation_pt: string }` (in `types/lesson.ts`) and `POST /api/lesson/extra-example` returning that shape — both consumed by Task 9 (`VocabPresentStep`) and Task 10 (`LessonEngine`).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/app/api/lesson/extra-example.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { POST } from '@/app/api/lesson/extra-example/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/lesson/extra-example', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  return chain
}

describe('POST /api/lesson/extra-example', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(401)
  })

  it('requires a word', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("generates an extra example using the user's CEFR level", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: 'A2' }))
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            example_sentence_en: 'Hello, how are you today?',
            example_sentence_pt: 'Olá, como você está hoje?',
            explanation_pt: '"Hello" é usado para cumprimentar alguém a qualquer hora do dia.',
          }),
        },
      }],
    })
    const res = await POST(makeRequest({ word: 'hello' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.example_sentence_en).toBe('Hello, how are you today?')
    expect(json.explanation_pt).toContain('cumprimentar')
    expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ content: expect.stringContaining('A2') })],
    }))
  })

  it('falls back to A1 when the user has no cefr_level set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: null }))
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ example_sentence_en: 'x', example_sentence_pt: 'y', explanation_pt: 'z' }) } }],
    })
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(200)
    expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ content: expect.stringContaining('A1') })],
    }))
  })

  it('returns 500 when generation fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: 'A2' }))
    mockChatCreate.mockRejectedValue(new Error('rate limited'))
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/lesson/extra-example.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add the type**

Add to `types/lesson.ts`, anywhere after `VocabItem`:

```ts
export interface ExtraExample {
  example_sentence_en: string
  example_sentence_pt: string
  explanation_pt: string
}
```

- [ ] **Step 4: Write the route**

```ts
// app/api/lesson/extra-example/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import type { CefrLevel } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { word } = await request.json() as { word?: string }
  if (!word) return NextResponse.json({ error: 'word required' }, { status: 400 })

  const { data: userData } = await supabase.from('users').select('cefr_level').eq('id', user.id).single()
  const cefrLevel = (userData as { cefr_level?: CefrLevel | null } | null)?.cefr_level ?? 'A1'

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `You are an English teacher helping a Brazilian student (CEFR ${cefrLevel}) who is struggling with the word "${word}".
Give ONE additional example sentence using "${word}" (different from a typical textbook example), plus a slightly more detailed Portuguese explanation of how/when to use the word.
Respond ONLY with JSON:
{"example_sentence_en":"...","example_sentence_pt":"...","explanation_pt":"..."}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}') as Record<string, unknown>
    return NextResponse.json({
      example_sentence_en: String(parsed.example_sentence_en ?? ''),
      example_sentence_pt: String(parsed.example_sentence_pt ?? ''),
      explanation_pt: String(parsed.explanation_pt ?? ''),
    })
  } catch (err) {
    console.error('[lesson/extra-example] generation failed:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/lesson/extra-example.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add types/lesson.ts app/api/lesson/extra-example/route.ts __tests__/app/api/lesson/extra-example.test.ts
git commit -m "feat: add /api/lesson/extra-example endpoint"
```

---

## Task 9: `VocabPresentStep` — speed + extra-example panel

**Files:**
- Modify: `components/lesson/VocabPresentStep.tsx`
- Modify: `__tests__/components/lesson/VocabPresentStep.test.tsx`

**Interfaces:**
- Consumes: `ExtraExample` type (Task 8).
- Produces: new props `strugglingMode?: boolean` (default `false`), `extraExample?: ExtraExample | null` (default `null`) — consumed by Task 10.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/lesson/VocabPresentStep.test.tsx`:

```tsx
  it('sends speed=1.0 by default', async () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('sends speed=0.85 when strugglingMode is on', async () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" strugglingMode onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('shows the extra example panel when provided', () => {
    const extraExample = { example_sentence_en: 'Hello again!', example_sentence_pt: 'Olá de novo!', explanation_pt: 'Outra forma de usar.' }
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" extraExample={extraExample} onContinue={vi.fn()} />)
    expect(screen.getByText('Hello again!')).toBeInTheDocument()
    expect(screen.getByText('💡 Dica extra')).toBeInTheDocument()
  })

  it('does not show the extra example panel when not provided', () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.queryByText('💡 Dica extra')).not.toBeInTheDocument()
  })
```

Add `waitFor` to the existing `import { render, screen } from '@testing-library/react'` line, changing it to `import { render, screen, waitFor } from '@testing-library/react'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/VocabPresentStep.test.tsx`
Expected: FAIL — no `speed` field sent, no extra-example panel rendered

- [ ] **Step 3: Update the component**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { VocabPresentStep as StepType, VocabItem, ExtraExample } from '@/types/lesson'

interface VocabPresentStepProps {
  step: StepType
  vocab: VocabItem
  ttsVoice: string
  strugglingMode?: boolean
  extraExample?: ExtraExample | null
  onContinue: () => void
}

export function VocabPresentStep({ step, vocab, ttsVoice, strugglingMode = false, extraExample = null, onContinue }: VocabPresentStepProps) {
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
      <span className="text-8xl" aria-hidden>{vocab.emoji}</span>
      <div className="text-center">
        <p className="text-5xl font-bold text-content-light dark:text-content-dark">{vocab.word}</p>
        <p className="text-base text-content-light-secondary dark:text-content-dark-secondary mt-2">
          {vocab.translation_pt}
        </p>
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>
      <div className="w-full p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
        <p className="text-base text-content-light dark:text-content-dark">{step.example_sentence_en}</p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1 italic">{step.example_sentence_pt}</p>
      </div>
      {extraExample && (
        <div className="w-full p-4 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-center">
          <p className="text-xs font-semibold text-brand-interactive mb-1">💡 Dica extra</p>
          <p className="text-sm text-content-light dark:text-content-dark">{extraExample.example_sentence_en}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary italic mt-1">{extraExample.example_sentence_pt}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-2">{extraExample.explanation_pt}</p>
        </div>
      )}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/VocabPresentStep.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/lesson/VocabPresentStep.tsx __tests__/components/lesson/VocabPresentStep.test.tsx
git commit -m "feat: add speed control and extra-example panel to VocabPresentStep"
```

---

## Task 10: `LessonEngine` — struggle detection and wiring

**Files:**
- Modify: `components/lesson/LessonEngine.tsx`
- Modify: `__tests__/components/lesson/LessonEngine.test.tsx`

**Interfaces:**
- Consumes: `shouldEnterStruggleMode()` (Task 1); the updated prop signatures from Tasks 4-9 (`ExerciseChoiceStep`/`ExerciseFillBlankStep`'s `onSuccess(isCorrect)`, `GuidedConvoStep`'s `strugglingMode`/`onComplete(correctionRate)`, `ReviewStep`'s `strugglingMode`, `VocabPresentStep`'s `strugglingMode`/`extraExample`); `POST /api/lesson/extra-example` (Task 8).

- [ ] **Step 1: Write the failing test**

Add these two blocks near the top of `__tests__/components/lesson/LessonEngine.test.tsx` (after the existing `global.fetch`/`window.HTMLMediaElement.prototype.play` lines, before `import { LessonEngine } ...`):

```tsx
vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

// jsdom never fires real 'ended'/'playing' events on HTMLMediaElement — this
// mock auto-fires onended on the next microtask, matching the pattern already
// used in GuidedConvoStep.test.tsx for the same reason.
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
```

Then add this test to the `describe('LessonEngine', ...)` block:

```tsx
  it('accumulates struggle events from wrong exercise answers, clones the missed exercise for a retry, and shortens the next guided-convo step once struggling mode is on', async () => {
    const lesson: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'ex-1', type: 'exercise_choice', question_pt: 'Q1?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp1' },
        { id: 'ex-2', type: 'exercise_choice', question_pt: 'Q2?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp2' },
        { id: 'gc-1', type: 'guided_convo', instruction_pt: 'inst', teacher_opens_with: 'Hi', allowed_vocabulary: ['Hello'], min_exchanges: 3 },
        { id: 'summary', type: 'summary' },
      ],
    }
    render(<LessonEngine lesson={lesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)

    // Wrong answer on ex-1 — 1st struggle event, not enough to trigger struggling mode yet
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Wrong answer on ex-2 — 2nd struggle event, crosses the threshold
    await waitFor(() => screen.getByText('Q2?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // ex-2 was cloned as an immediate retry — the same question appears again
    await waitFor(() => expect(screen.getByText('Q2?')).toBeInTheDocument())
    fireEvent.click(screen.getByText('A'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Now on the guided_convo step: min_exchanges was reduced from 3 to 2
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))
    await waitFor(() => expect(screen.getByText('0 / 2 trocas')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/LessonEngine.test.tsx`
Expected: FAIL — `ExerciseChoiceStep`'s `onSuccess` prop doesn't yet distinguish correct/incorrect at the `LessonEngine` call site (still `() => advance()`), so nothing tracks struggle events yet; the new test fails on the retry-clone or trocas assertions.

- [ ] **Step 3: Update the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { GeneratedLesson, LessonStep, ExtraExample } from '@/types/lesson'
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
import { shouldEnterStruggleMode } from '@/lib/adaptive-difficulty'

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
  const [steps, setSteps] = useState<LessonStep[]>(lesson.steps)
  const [struggleEvents, setStruggleEvents] = useState(0)
  const [strugglingMode, setStrugglingMode] = useState(false)
  const [extraExample, setExtraExample] = useState<(ExtraExample & { word: string }) | null>(null)

  // Applies the one-time structural adaptations (shorter dialogues ahead, an
  // extra worked example for the next new word) exactly once, right when
  // struggling mode first turns on.
  useEffect(() => {
    if (!strugglingMode) return

    setSteps(prevSteps => prevSteps.map((s, i) => {
      if (i <= currentStepIndex) return s
      return s.type === 'guided_convo' ? { ...s, min_exchanges: Math.max(1, s.min_exchanges - 1) } : s
    }))

    let nextVocabWord: string | null = null
    for (const s of steps.slice(currentStepIndex + 1)) {
      if (s.type === 'vocab_present') { nextVocabWord = lesson.vocabulary[s.vocab_index].word; break }
    }
    if (nextVocabWord) {
      const word = nextVocabWord
      fetch('/api/lesson/extra-example', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data) setExtraExample({ word, ...data }) })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strugglingMode])

  const registerStruggleEvent = (): boolean => {
    const next = struggleEvents + 1
    setStruggleEvents(next)
    const enteringNow = !strugglingMode && shouldEnterStruggleMode(next)
    if (enteringNow) setStrugglingMode(true)
    return strugglingMode || enteringNow
  }

  const advance = (word?: string, score?: number) => {
    if (word !== undefined && score !== undefined) {
      setVocabScores(prev => ({ ...prev, [word]: score }))
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= steps.length) {
      setIsCompleted(true)
    } else {
      setCurrentStepIndex(nextIndex)
    }
  }

  const advanceExercise = (isCorrect: boolean) => {
    if (!isCorrect) {
      const active = registerStruggleEvent()
      if (active) {
        const current = steps[currentStepIndex]
        const clone: LessonStep = { ...current, id: `${current.id}-retry` }
        setSteps(prevSteps => {
          const next = [...prevSteps]
          next.splice(currentStepIndex + 1, 0, clone)
          return next
        })
      }
    }
    advance()
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

  const step = steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={steps.length} />
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
            strugglingMode={strugglingMode}
            extraExample={extraExample?.word === lesson.vocabulary[step.vocab_index].word ? extraExample : null}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score: number) => {
              if (score < 60) registerStruggleEvent()
              advance(lesson.vocabulary[step.vocab_index].word, score)
            }}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep key={step.id} step={step} onSuccess={(isCorrect: boolean) => advanceExercise(isCorrect)} />
        )}
        {step.type === 'exercise_fill_blank' && (
          <ExerciseFillBlankStep key={step.id} step={step} onSuccess={(isCorrect: boolean) => advanceExercise(isCorrect)} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            key={step.id}
            step={step}
            sessionId={sessionId}
            teacherName={teacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            onComplete={(correctionRate: number) => {
              if (correctionRate > 0.5) registerStruggleEvent()
              advance()
            }}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep key={step.id} step={step} vocabulary={lesson.vocabulary} strugglingMode={strugglingMode} onComplete={() => advance()} />
        )}
        {step.type === 'summary' && (
          <SummaryStep
            key={step.id}
            vocabulary={lesson.vocabulary}
            vocabScores={vocabScores}
            learningObjectives={lesson.learning_objectives}
            xpEarned={0}
            lessonTitle={lesson.title_pt}
            onFinish={onComplete}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/LessonEngine.test.tsx`
Expected: PASS (all pre-existing tests plus the new one). If any timing assertion in the new test doesn't settle exactly as written, adjust the `waitFor` calls — the underlying component logic (struggle counting, cloning, `min_exchanges` patching) is what must be correct, not the exact test choreography.

- [ ] **Step 5: Run the full lesson-component test suite**

Run: `npx vitest run __tests__/components/lesson/ __tests__/lib/adaptive-difficulty.test.ts __tests__/lib/tts.test.ts __tests__/app/api/lesson/`
Expected: PASS — every test touched across Tasks 1-10, no regressions.

- [ ] **Step 6: Commit**

```bash
git add components/lesson/LessonEngine.tsx __tests__/components/lesson/LessonEngine.test.tsx
git commit -m "feat: detect in-lesson struggle and apply adaptive difficulty in LessonEngine"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` locally — the level state machine work already hit a production-build-only ESLint failure (`@typescript-eslint/no-unused-vars`) that `tsc`/`vitest` didn't catch; confirm this feature's new files don't have the same problem before it ships.
- [ ] Manual pass: play through a lesson deliberately answering two exercises wrong, confirm TTS on the next `vocab_present`/`guided_convo` step is noticeably slower, the next `ReviewStep` cards start pre-revealed, the missed exercise repeats once, the upcoming guided-convo step needs fewer exchanges, and the "💡 Dica extra" panel appears on the next new vocabulary word.
