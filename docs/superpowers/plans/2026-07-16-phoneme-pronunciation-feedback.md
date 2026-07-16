# Phoneme-Level Pronunciation Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student mispronounces a word in `VocabRepeatStep`, give them a specific, plain-Portuguese explanation of which sound was wrong, by replacing the current Whisper-transcript-then-text-judgment pronunciation pipeline with a single OpenAI audio-input model call that listens to the recording directly.

**Architecture:** `app/api/lesson/assess/route.ts`'s `type === 'pronunciation'` branch stops calling `whisper-1` for the audio path. Instead it transcodes the uploaded webm/mp4 blob to WAV server-side (via the `ffmpeg-static` binary, spawned as a child process), then sends that WAV directly to `gpt-4o-mini-audio-preview` in one `chat.completions.create` call that returns `assessment`, `score`, `feedback_pt`, and a new `phoneme_note_pt` field — all from one model call. The `panicText` fallback path (no audio, typed text instead) keeps using `gpt-4o-mini` in text-only mode, since there's no audio to analyze there. `VocabRepeatStep` renders `phoneme_note_pt` as an extra line under the existing feedback when present.

**Tech Stack:** Next.js App Router (Node.js runtime, not edge), OpenAI (`gpt-4o-mini`, `gpt-4o-mini-audio-preview`), `ffmpeg-static`, Vitest + Testing Library, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-16-phoneme-pronunciation-feedback-design.md`

## Global Constraints

- Scope is `VocabRepeatStep` and `app/api/lesson/assess/route.ts` only. `GuidedConvoStep`, `hooks/useAudioRecorder.ts`, and every other caller of the shared recording hook are untouched.
- No IPA symbols anywhere in `phoneme_note_pt` or its rendering — plain Portuguese sentences only.
- No new AI vendor — stays on OpenAI. `ffmpeg-static` is a local binary dependency for format conversion, not an AI service.
- `assessment` (`'correct' | 'close' | 'incorrect'`), `score` (0–1), the 3-attempt cap, and `canAdvance` logic in `VocabRepeatStep` are unchanged in meaning — only where the judgment comes from changes.
- `phoneme_note_pt: string | null` — `null` when `assessment` is `'correct'`, a plain-Portuguese sentence otherwise.
- **Model name verification:** this plan specifies `gpt-4o-mini-audio-preview` as the audio-input model, confirmed to exist as a documented OpenAI model as of this plan's writing. If the installed `openai` npm package's TypeScript types reject the `input_audio` content type or the `modalities` parameter, or the live API call fails with a model/parameter error, consult `node_modules/openai`'s type definitions and https://platform.openai.com/docs/guides/audio for the current exact shape, and adapt the request accordingly — the required behavior (one call, real audio in, JSON with `phoneme_note_pt` out, no separate Whisper transcription step) does not change, only the exact field/model names might need adjustment. Report any such adjustment in your task report.
- No database changes. No feature flag.

---

## Task 1: `app/api/lesson/assess/route.ts` — audio-native pronunciation assessment

**Files:**
- Modify: `app/api/lesson/assess/route.ts`
- Modify: `__tests__/app/api/lesson/assess.test.ts`
- Modify: `package.json` (new dependency, via `npm install`)

**Interfaces:**
- Produces: the route's JSON response gains `phoneme_note_pt: string | null`, alongside the existing `assessment`/`score`/`feedback_pt` — consumed by Task 2 (`VocabRepeatStep`'s `AssessResult` type and rendering).

- [ ] **Step 1: Install the new dependency**

```bash
npm install ffmpeg-static
```

Verify `ffmpeg-static` now appears under `dependencies` in `package.json` (not `devDependencies` — it must be present at runtime in production).

- [ ] **Step 2: Update the test file**

Replace the full contents of `__tests__/app/api/lesson/assess.test.ts`:

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockChatCreate = vi.hoisted(() => vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}' } }],
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

vi.mock('ffmpeg-static', () => ({ default: '/fake/path/to/ffmpeg' }))

const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockReadFile = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from('FAKE_WAV_BYTES')))
const mockUnlink = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  unlink: mockUnlink,
}))

const mockSpawn = vi.hoisted(() => vi.fn().mockImplementation(() => {
  const proc = new EventEmitter()
  queueMicrotask(() => proc.emit('close', 0))
  return proc
}))
vi.mock('node:child_process', () => ({ spawn: mockSpawn }))

import { POST } from '@/app/api/lesson/assess/route'

function makeRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/assess', { method: 'POST', body: form })
}

describe('POST /api/lesson/assess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}' } }],
    })
    mockSpawn.mockImplementation(() => {
      const proc = new EventEmitter()
      queueMicrotask(() => proc.emit('close', 0))
      return proc
    })
  })

  it('scores a pronunciation attempt by sending the transcoded audio directly to the audio model, not Whisper', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.assessment).toBe('correct')
    expect(body.score).toBe(0.9)
    expect(body.phoneme_note_pt).toBe(null)

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const callArgs = mockChatCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4o-mini-audio-preview')
    const content = callArgs.messages[0].content
    const audioPart = content.find((c: { type: string }) => c.type === 'input_audio')
    expect(audioPart.input_audio.format).toBe('wav')
    expect(typeof audioPart.input_audio.data).toBe('string')
  })

  it('returns a phoneme_note_pt when the pronunciation is close', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"close","score":0.55,"feedback_pt":"Quase lá!","phoneme_note_pt":"Você disse thing como \\"ting\\" — o som TH precisa da língua entre os dentes."}' } }],
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'thing', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    const body = await res.json()
    expect(body.assessment).toBe('close')
    expect(body.phoneme_note_pt).toContain('TH')
  })

  it('falls back to a text-only gpt-4o-mini call when no audio is provided (panic text)', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"correct","score":0.8,"feedback_pt":"Boa!","phoneme_note_pt":null}' } }],
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', text: 'red' }))
    expect(res.status).toBe(200)
    expect(mockSpawn).not.toHaveBeenCalled()
    const callArgs = mockChatCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4o-mini')
  })

  it('returns 500 when ffmpeg transcoding fails', async () => {
    mockSpawn.mockImplementation(() => {
      const proc = new EventEmitter()
      queueMicrotask(() => proc.emit('close', 1))
      return proc
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(500)
  })

  it('rejects type=conversation — that path moved to /api/conversation', async () => {
    const res = await POST(makeRequest({ type: 'conversation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects an unrecognized type', async () => {
    const res = await POST(makeRequest({ type: 'nonsense', target: 'red' }))
    expect(res.status).toBe(400)
  })

  it('rejects pronunciation requests with neither audio nor text', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/app/api/lesson/assess.test.ts`
Expected: FAIL — the route still calls `whisper-1` and `gpt-4o-mini` for the audio path, doesn't call `spawn`, and doesn't return `phoneme_note_pt`.

- [ ] **Step 4: Rewrite the route**

Replace the full contents of `app/api/lesson/assess/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

async function transcodeToWav(input: Buffer): Promise<Buffer> {
  const id = randomUUID()
  const inputPath = join(tmpdir(), `${id}-in`)
  const outputPath = join(tmpdir(), `${id}-out.wav`)
  await writeFile(inputPath, input)
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as unknown as string, ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', outputPath])
      proc.on('error', reject)
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))))
    })
    return await readFile(outputPath)
  } finally {
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

export async function POST(request: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type') as string | null
  const target = formData.get('target') as string
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('text') as string | null

  if (type !== 'pronunciation') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const trimmedPanicText = panicText?.trim() || null
  if (!audio && !trimmedPanicText) {
    return NextResponse.json({ error: 'No audio or text' }, { status: 400 })
  }

  try {
    if (trimmedPanicText) {
      const prompt = `You are assessing English pronunciation for an A1 learner from Brazil.
Target: "${target}"
Student said: "${trimmedPanicText}"

Respond ONLY with valid JSON (no markdown):
{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0].message.content ?? '{}')
      return NextResponse.json(result)
    }

    const inputBuffer = Buffer.from(await (audio as Blob).arrayBuffer())
    const wavBuffer = await transcodeToWav(inputBuffer)

    const prompt = `You are assessing English pronunciation for an A1 learner from Brazil by listening to their recording.
Target word: "${target}"

Listen carefully to the audio and respond ONLY with valid JSON (no markdown):
{"assessment":"correct or close or incorrect","score":0.0 to 1.0,"feedback_pt":"short encouraging feedback in Portuguese","phoneme_note_pt":"one plain-Portuguese sentence naming the specific sound that was wrong and how to fix it, or null if assessment is correct"}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini-audio-preview',
      modalities: ['text'],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'input_audio', input_audio: { data: wavBuffer.toString('base64'), format: 'wav' } },
        ],
      }],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    } as Parameters<typeof openai.chat.completions.create>[0])
    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Assessment failed' }, { status: 500 })
  }
}
```

Note the `as Parameters<typeof openai.chat.completions.create>[0]` cast on the audio-model call: this exists in case the installed `openai` SDK's TypeScript types don't yet model the `input_audio` content part or the `modalities` field precisely. If `tsc` passes without needing this cast, remove it — don't leave unnecessary type assertions in. If `tsc` still fails even with this cast, per the Global Constraints note, inspect `node_modules/openai/resources/chat/completions.d.ts` (or wherever the installed version defines `ChatCompletionCreateParams`) for the actual supported shape and adjust the object literal to match, keeping the same runtime intent.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/app/api/lesson/assess.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If the `openai` package's types reject the audio-call shape, follow the Step 4 note above to resolve it — do not suppress with a broad `@ts-ignore`; use the narrowest correction that satisfies the compiler.

- [ ] **Step 7: Manual sanity check of ffmpeg availability**

Run: `node -e "console.log(require('ffmpeg-static'))"` from the project root and confirm it prints a real file path (not `null`/`undefined`). This confirms the binary installed correctly for the current platform before relying on it at runtime.

- [ ] **Step 8: Commit**

```bash
git add app/api/lesson/assess/route.ts __tests__/app/api/lesson/assess.test.ts package.json package-lock.json
git commit -m "feat: assess pronunciation from real audio via an OpenAI audio-input model, add phoneme_note_pt"
```

---

## Task 2: `VocabRepeatStep` — render the phoneme note

**Files:**
- Modify: `components/lesson/VocabRepeatStep.tsx`
- Create: `__tests__/components/lesson/VocabRepeatStep.test.tsx` (no test file exists for this component today)

**Interfaces:**
- Consumes: the `phoneme_note_pt: string | null` field on the `/api/lesson/assess` JSON response (Task 1).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/lesson/VocabRepeatStep.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import type { VocabRepeatStep as StepType, VocabItem } from '@/types/lesson'

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn((opts: { onComplete: (blob: Blob) => void }) => ({
    isRecording: false,
    startRecording: () => opts.onComplete(new Blob(['audio'], { type: 'audio/webm' })),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

global.fetch = vi.fn()

const mockStep: StepType = {
  id: 'vr-1',
  type: 'vocab_repeat',
  vocab_index: 0,
  instruction_pt: 'Pratique a pronúncia de "hello"',
}

const mockVocab: VocabItem = {
  word: 'hello',
  translation_pt: 'olá',
  emoji: '👋',
  pronunciation_hint: 'heh-LOH',
}

function mockAssessResponse(body: unknown) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => body })
}

describe('VocabRepeatStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the word and pronunciation hint', () => {
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('/heh-LOH/')).toBeInTheDocument()
  })

  it('shows feedback and a phoneme note when the pronunciation is close', async () => {
    mockAssessResponse({ assessment: 'close', score: 0.55, feedback_pt: 'Quase lá!', phoneme_note_pt: 'Você disse thing como "ting" — o som TH precisa da língua entre os dentes.' })
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Quase lá!')).toBeInTheDocument())
    expect(screen.getByText('Você disse thing como "ting" — o som TH precisa da língua entre os dentes.')).toBeInTheDocument()
  })

  it('shows no phoneme note when the pronunciation is correct', async () => {
    mockAssessResponse({ assessment: 'correct', score: 0.95, feedback_pt: 'Perfeito!', phoneme_note_pt: null })
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Perfeito!')).toBeInTheDocument())
    expect(screen.queryByText(/som/)).not.toBeInTheDocument()
  })

  it('allows advancing after a correct attempt, calling onSuccess with the score', async () => {
    mockAssessResponse({ assessment: 'correct', score: 0.95, feedback_pt: 'Perfeito!', phoneme_note_pt: null })
    const onSuccess = vi.fn()
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => screen.getByText('Continuar →'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(0.95)
  })

  it('forces advance after 3 incorrect attempts', async () => {
    const onSuccess = vi.fn()
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={onSuccess} />)

    for (let i = 0; i < 3; i++) {
      mockAssessResponse({ assessment: 'incorrect', score: 0.2, feedback_pt: 'Tente de novo.', phoneme_note_pt: 'O som H no início precisa de mais ar.' })
      fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
      await waitFor(() => screen.getByText(`Tentativa ${i + 1} de 3`))
    }

    await waitFor(() => screen.getByText('Continuar →'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(0.2)
  })

  it('shows a generic error message when the assess request fails', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Erro ao avaliar. Tente novamente.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/lesson/VocabRepeatStep.test.tsx`
Expected: FAIL — `AssessResult` has no `phoneme_note_pt` field yet and the component never renders it, so the "shows feedback and a phoneme note" test fails to find that text.

- [ ] **Step 3: Update the component**

In `components/lesson/VocabRepeatStep.tsx`, change the `AssessResult` type:

```ts
type AssessResult = { assessment: 'correct' | 'close' | 'incorrect'; score: number; feedback_pt: string; phoneme_note_pt: string | null }
```

Add the phoneme note rendering right after the existing `feedback_pt` paragraph inside the result card:

```tsx
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`w-full p-4 rounded-xl text-center ${
            result.assessment === 'correct' ? 'bg-green-500/15' :
            result.assessment === 'close' ? 'bg-yellow-500/15' :
            'bg-red-500/15'
          }`}
        >
          <p className="font-bold text-content-light dark:text-content-dark text-lg">
            {result.assessment === 'correct' ? '✅ Perfeito!' :
             result.assessment === 'close' ? '🟡 Quase lá!' :
             '❌ Tente novamente'}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {result.feedback_pt}
          </p>
          {result.phoneme_note_pt && (
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-2 italic">
              {result.phoneme_note_pt}
            </p>
          )}
        </motion.div>
      )}
```

(Only the `{result.phoneme_note_pt && (...)}` block is new — everything else in this snippet is unchanged, shown for placement context.)

The `catch` block's fallback result (`{ assessment: 'incorrect', score: 0, feedback_pt: 'Erro ao avaliar. Tente novamente.' }`) needs `phoneme_note_pt: null` added to satisfy the updated `AssessResult` type:

```ts
    } catch {
      setResult({ assessment: 'incorrect', score: 0, feedback_pt: 'Erro ao avaliar. Tente novamente.', phoneme_note_pt: null })
      setAttempts(a => a + 1)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/lesson/VocabRepeatStep.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full related test set**

Run: `npx vitest run __tests__/components/lesson/ __tests__/app/api/lesson/`
Expected: PASS — every test touched across Tasks 1-2, no regressions.

- [ ] **Step 7: Commit**

```bash
git add components/lesson/VocabRepeatStep.tsx __tests__/components/lesson/VocabRepeatStep.test.tsx
git commit -m "feat: show phoneme-specific pronunciation feedback in VocabRepeatStep"
```

---

## Final check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files, and pay attention to the resulting serverless function size for `/api/lesson/assess` (the build output lists a size per route) since `ffmpeg-static` bundles a real binary — flag if it looks unusually large.
- [ ] Manual pass: in a real lesson, deliberately mispronounce a word in the vocabulary-repeat step and confirm the feedback card shows a specific, plain-Portuguese sound explanation (not a generic message), then pronounce a word correctly and confirm no phoneme note appears. If the OpenAI audio call fails in practice (auth, quota, or API-shape issues), confirm the existing "Erro ao avaliar. Tente novamente." fallback still displays correctly rather than crashing the lesson.
