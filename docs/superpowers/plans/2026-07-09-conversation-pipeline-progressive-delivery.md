# Conversation Pipeline — Progressive Delivery & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a lesson turn (aluno fala → professor responde) feel instant by splitting the monolithic, fully-sequential `/api/conversation` request into a fast text response plus two background completions (audio, avatar video) that update the UI as they arrive — and fix the reliability bugs (missing translation, missing audio, stuck avatar) caused by the current all-or-nothing design.

**Architecture:** `POST /api/conversation` now does only: transcribe → GPT (with enforced JSON mode) → persist + return text/translation/correction immediately (typically 1.5–3s instead of up to 15s+). Two new endpoints (`/api/conversation/audio`, `/api/conversation/avatar` + `/api/conversation/avatar/[talkId]`) run TTS synthesis (with retry) and D-ID video creation/polling independently, off the hot path. The client (`useSession`) fires both in parallel right after the text response lands and patches the corresponding message in state as each resolves; `AulaClient` plays audio and shows avatar video reactively as soon as they're `ready`, and falls back gracefully (static avatar image, silent-but-visible-text) on failure or timeout — never blocking the conversation.

**Tech Stack:** Next.js 14 App Router route handlers, Supabase (Postgres + RLS + Storage), OpenAI (`whisper-1`, `tts-1`, `gpt-4o-mini`), D-ID REST API, Vitest + Testing Library.

## Global Constraints

- All new/modified DB access must go through the existing RLS-scoped `createSupabaseServer()` client except raw Storage uploads, which require `createSupabaseAdmin()` (unchanged pattern from the current codebase).
- Every new API route must return JSON error bodies with correct HTTP status codes; never throw uncaught.
- No behavior change to the quota-enforcement block in `/api/conversation` — copy it verbatim.
- All new code must have Vitest coverage in the same file layout style as existing tests (`vi.mock('@supabase/ssr', ...)`, hoisted mock fns via `vi.hoisted`).
- Run `npm run test:run` after every task; all tests (existing + new) must pass before moving to the next task.
- Do not remove the `crypto.randomUUID()` storage-path pattern already used for audio uploads.

---

## File Structure

- **Modify:** `supabase/migrations/` — new migration adding progressive-delivery columns to `messages`.
- **Create:** `lib/timing.ts` — stage-timing logger used by all three route handlers.
- **Modify:** `lib/tts.ts` — add `synthesizeTtsWithRetry`.
- **Modify:** `lib/did.ts` — replace blocking `createTalk` (create+poll loop) with non-blocking `createDidTalk` (create only) + `pollDidTalk` (single poll).
- **Modify:** `types/index.ts` — extend `ConversationResponse`, add `AudioStatus`/`VideoStatus` types and new endpoint payload types.
- **Modify:** `app/api/conversation/route.ts` — strip TTS/D-ID, parallelize independent reads, enforce JSON mode, persist translation/suggestions, return fast.
- **Create:** `app/api/conversation/audio/route.ts` — TTS synthesis + storage upload + retry, updates the message row.
- **Create:** `app/api/conversation/avatar/route.ts` — kicks off D-ID talk creation only, returns immediately.
- **Create:** `app/api/conversation/avatar/[talkId]/route.ts` — single-shot poll endpoint the client calls repeatedly.
- **Modify:** `hooks/useSession.ts` — progressive message state, background `fetchAudio`/`fetchAvatar`.
- **Modify:** `app/aula/AulaClient.tsx` — play audio / show avatar reactively off message state instead of the old atomic response.
- **Modify:** `components/aula/MessageBubble.tsx` — per-message "preparando áudio..." / "áudio indisponível" indicator.
- **Modify:** `components/aula/TeacherAvatar.tsx` — `onError` + timeout fallback to static image (no more indefinite spinner).

---

### Task 1: Migration — progressive-delivery columns on `messages`

**Files:**
- Create: `supabase/migrations/20260709000001_progressive_messages.sql`

**Interfaces:**
- Produces: columns `reply_pt text`, `suggested_replies text[]`, `audio_status text` (`'pending'|'ready'|'failed'|'skipped'`, default `'ready'`), `video_status text` (`'pending'|'ready'|'failed'|'skipped'`, default `'skipped'`), `video_url text`, `did_talk_id text` on `public.messages`. Defaults keep existing rows valid (they already have their final `audio_url`, no video).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260709000001_progressive_messages.sql

-- Persist translation + suggested replies (previously computed but never saved,
-- so they disappeared after any page reload / session resume).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_pt text,
  ADD COLUMN IF NOT EXISTS suggested_replies text[];

-- Progressive delivery status — audio/video are synthesized asynchronously
-- after the text response, so the UI can show per-stage loading/fallback state.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_status text NOT NULL DEFAULT 'ready'
    CHECK (audio_status IN ('pending','ready','failed','skipped')),
  ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'skipped'
    CHECK (video_status IN ('pending','ready','failed','skipped')),
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS did_talk_id text;

CREATE INDEX IF NOT EXISTS messages_did_talk_id_idx ON public.messages(did_talk_id)
  WHERE did_talk_id IS NOT NULL;
```

- [ ] **Step 2: Apply locally / verify it's syntactically valid**

Run: `npx supabase db lint supabase/migrations/20260709000001_progressive_messages.sql` if the Supabase CLI is available locally; otherwise visually confirm it matches the style of `supabase/migrations/20260702000001_learning_features.sql` (idempotent `ADD COLUMN IF NOT EXISTS`, no destructive statements).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260709000001_progressive_messages.sql
git commit -m "feat: add progressive-delivery columns to messages table"
```

---

### Task 2: `lib/timing.ts` — stage timing logger

**Files:**
- Create: `lib/timing.ts`
- Test: `__tests__/lib/timing.test.ts`

**Interfaces:**
- Produces: `createStageTimer(label: string): { mark(stage: string): void; finish(extra?: Record<string, unknown>): number }` — used by conversation/audio/avatar route handlers to log per-stage duration as structured JSON (satisfies the "identificar gargalos rapidamente" requirement).

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/timing.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createStageTimer } from '@/lib/timing'

describe('createStageTimer', () => {
  it('logs total and per-stage durations as structured JSON', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const timer = createStageTimer('test-op')
    timer.mark('stage_a')
    timer.mark('stage_b')
    const total = timer.finish({ extra_field: 'value' })

    expect(typeof total).toBe('number')
    expect(logSpy).toHaveBeenCalledTimes(1)

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.event).toBe('timing')
    expect(logged.label).toBe('test-op')
    expect(logged.stages_ms).toHaveProperty('stage_a')
    expect(logged.stages_ms).toHaveProperty('stage_b')
    expect(logged.extra_field).toBe('value')

    logSpy.mockRestore()
  })

  it('finish works with no marks and no extra', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const timer = createStageTimer('empty-op')
    const total = timer.finish()
    expect(total).toBeGreaterThanOrEqual(0)
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.stages_ms).toEqual({})
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/lib/timing.test.ts`
Expected: FAIL with "Cannot find module '@/lib/timing'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/timing.ts

interface StageTimer {
  mark(stage: string): void
  finish(extra?: Record<string, unknown>): number
}

export function createStageTimer(label: string): StageTimer {
  const start = Date.now()
  const stages: Record<string, number> = {}
  let last = start

  return {
    mark(stage: string) {
      const now = Date.now()
      stages[stage] = now - last
      last = now
    },
    finish(extra?: Record<string, unknown>) {
      const total = Date.now() - start
      console.log(JSON.stringify({ event: 'timing', label, total_ms: total, stages_ms: stages, ...extra }))
      return total
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/lib/timing.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/timing.ts __tests__/lib/timing.test.ts
git commit -m "feat: add stage timing logger for pipeline observability"
```

---

### Task 3: `lib/tts.ts` — add retry wrapper

**Files:**
- Modify: `lib/tts.ts`
- Modify: `__tests__/lib/tts.test.ts`

**Interfaces:**
- Consumes: existing `synthesizeTts(text, voice)` (unchanged).
- Produces: `synthesizeTtsWithRetry(text: string, voice: string, maxAttempts?: number): Promise<{ dataUrl: string; buffer: Buffer }>` — retries on transient OpenAI failures with linear backoff (150ms × attempt), throws the last error after `maxAttempts` (default 3).

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/tts.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    audio = { speech: { create: mockCreate } }
  }
  return { default: MockOpenAI }
})

import { synthesizeTts, synthesizeTtsWithRetry } from '@/lib/tts'

function fakeAudioResponse() {
  return { arrayBuffer: async () => new Uint8Array([102, 97, 107, 101, 45, 97, 117, 100, 105, 111]).buffer }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCreate.mockResolvedValue(fakeAudioResponse())
})

describe('synthesizeTts', () => {
  it('returns a dataUrl and a buffer', async () => {
    const result = await synthesizeTts('Hello world', 'alloy')
    expect(result).toHaveProperty('dataUrl')
    expect(result).toHaveProperty('buffer')
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(result.buffer).toBeInstanceOf(Buffer)
  })

  it('encodes the audio buffer correctly in dataUrl', async () => {
    const result = await synthesizeTts('Test', 'nova')
    const expectedBase64 = Buffer.from('fake-audio').toString('base64')
    expect(result.dataUrl).toBe(`data:audio/mp3;base64,${expectedBase64}`)
  })

  it('returns the raw buffer bytes', async () => {
    const result = await synthesizeTts('Test', 'nova')
    expect(result.buffer.toString()).toBe('fake-audio')
  })
})

describe('synthesizeTtsWithRetry', () => {
  it('returns immediately on first success without retrying', async () => {
    const result = await synthesizeTtsWithRetry('Hello', 'alloy')
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('retries after a transient failure and succeeds', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate limited'))
    mockCreate.mockResolvedValueOnce(fakeAudioResponse())

    const result = await synthesizeTtsWithRetry('Hello', 'alloy', 3)
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting all attempts', async () => {
    mockCreate.mockRejectedValue(new Error('persistent failure'))
    await expect(synthesizeTtsWithRetry('Hello', 'alloy', 2)).rejects.toThrow('persistent failure')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:run -- __tests__/lib/tts.test.ts`
Expected: FAIL — `synthesizeTtsWithRetry` is not exported

- [ ] **Step 3: Implement the retry wrapper**

```typescript
// lib/tts.ts
import OpenAI from 'openai'

export async function synthesizeTts(text: string, voice: string): Promise<{ dataUrl: string; buffer: Buffer }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'mp3',
  })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))
  return { dataUrl: `data:audio/mp3;base64,${buffer.toString('base64')}`, buffer }
}

export async function synthesizeTtsWithRetry(
  text: string,
  voice: string,
  maxAttempts = 3,
): Promise<{ dataUrl: string; buffer: Buffer }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await synthesizeTts(text, voice)
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150))
      }
    }
  }
  throw lastError
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/lib/tts.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tts.ts __tests__/lib/tts.test.ts
git commit -m "feat: add retry with backoff to TTS synthesis"
```

---

### Task 4: `lib/did.ts` — split into non-blocking create + single poll

**Files:**
- Modify: `lib/did.ts`
- Modify: `__tests__/lib/did.test.ts`

**Interfaces:**
- Produces: `createDidTalk(text: string, didVoiceId: string, sourceUrl: string): Promise<string | null>` (returns the D-ID `talk_id`, one HTTP call, no loop). `pollDidTalk(talkId: string): Promise<{ status: 'done' | 'pending' | 'error'; resultUrl: string | null }>` (one HTTP call, no loop). `DID_VOICE_IDS` unchanged.
- This removes the old blocking `createTalk` (which slept up to 15s inside the request) entirely — callers (Task 7, Task 8) own the polling cadence instead.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/did.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('createDidTalk', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns null when DID_API_KEY is not set', async () => {
    delete process.env.DID_API_KEY
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns the talk id when D-ID accepts the create request', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tlk_123' }) } as Response)

    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBe('tlk_123')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when D-ID create request fails', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })
})

describe('pollDidTalk', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, DID_API_KEY: 'test-key' }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns done + resultUrl when D-ID reports done', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', result_url: 'https://d-id.com/video.mp4' }),
    } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'done', resultUrl: 'https://d-id.com/video.mp4' })
  })

  it('returns pending while D-ID is still processing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'started' }) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'pending', resultUrl: null })
  })

  it('returns error when D-ID reports an error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'error' }) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'error', resultUrl: null })
  })

  it('returns error when the HTTP request fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'error', resultUrl: null })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/lib/did.test.ts`
Expected: FAIL — `createDidTalk`/`pollDidTalk` not exported

- [ ] **Step 3: Implement**

```typescript
// lib/did.ts
const DID_API = 'https://api.d-id.com'

export const DID_VOICE_IDS: Record<string, string> = {
  'mrs-carol': 'en-US-JennyNeural',
  'mr-jake': 'en-US-GuyNeural',
  'dr-reynolds': 'en-GB-RyanNeural',
  sofia: 'en-US-SaraNeural',
}

export interface DidTalkResult {
  status: 'done' | 'pending' | 'error'
  resultUrl: string | null
}

function authHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

export async function createDidTalk(
  text: string,
  didVoiceId: string,
  sourceUrl: string,
): Promise<string | null> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return null

  try {
    const createRes = await fetch(`${DID_API}/talks`, {
      method: 'POST',
      headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: sourceUrl,
        script: { type: 'text', input: text, provider: { type: 'microsoft', voice_id: didVoiceId } },
      }),
    })
    if (!createRes.ok) return null

    const body = (await createRes.json()) as { id?: string }
    return body.id ?? null
  } catch {
    return null
  }
}

export async function pollDidTalk(talkId: string): Promise<DidTalkResult> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return { status: 'error', resultUrl: null }

  try {
    const pollRes = await fetch(`${DID_API}/talks/${talkId}`, {
      headers: { Authorization: authHeader(apiKey) },
    })
    if (!pollRes.ok) return { status: 'error', resultUrl: null }

    const talk = (await pollRes.json()) as { status: string; result_url?: string }
    if (talk.status === 'done' && talk.result_url) return { status: 'done', resultUrl: talk.result_url }
    if (talk.status === 'error') return { status: 'error', resultUrl: null }
    return { status: 'pending', resultUrl: null }
  } catch {
    return { status: 'error', resultUrl: null }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/lib/did.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/did.ts __tests__/lib/did.test.ts
git commit -m "refactor: split D-ID talk creation from polling to remove blocking wait"
```

---

### Task 5: `types/index.ts` — progressive delivery types

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `AudioStatus`, `VideoStatus` unions; extended `ConversationResponse` (`message_id`, `audio_status`, `video_status`); `AudioFetchResponse`, `AvatarCreateResponse`, `AvatarPollResponse` — consumed by Tasks 6–8 (routes) and Task 9 (`useSession`).

- [ ] **Step 1: Edit the type definitions**

In `types/index.ts`, add near the other primitive unions (after `export type TtsProvider = ...`):

```typescript
export type AudioStatus = 'pending' | 'ready' | 'failed' | 'skipped'
export type VideoStatus = 'pending' | 'ready' | 'failed' | 'skipped'
```

Replace the existing `ConversationResponse` interface with:

```typescript
export interface ConversationResponse {
  message_id: string | null
  text: string
  audio_url: string | null
  audio_status: AudioStatus
  video_url: string | null
  video_status: VideoStatus
  had_correction: boolean
  error_report: ErrorReport
  transcript?: string
  pronunciation_hint: string | null
  new_words: string[] | null
  suggested_replies: string[] | null
  reply_pt: string | null
  prompt_hint: string | null
}

export interface AudioFetchResponse {
  audio_url: string | null
  audio_status: AudioStatus
}

export interface AvatarCreateResponse {
  talk_id: string | null
  video_status: VideoStatus
}

export interface AvatarPollResponse {
  status: VideoStatus
  video_url: string | null
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `app/api/conversation/route.ts` and `app/aula/AulaClient.tsx` (they construct/consume the old shape) — these are resolved by Tasks 6 and 10. Confirm no errors in files outside this plan's scope.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add progressive-delivery response types"
```

---

### Task 6: Rewrite `/api/conversation` — fast text-only response

**Files:**
- Modify: `app/api/conversation/route.ts`
- Modify: `__tests__/app/api/conversation.test.ts`
- Modify: `__tests__/api/conversation/quota-demo.test.ts` (verify still passes — quota logic untouched)
- Modify: `__tests__/api/conversation/vip-bypass.test.ts` (verify still passes — quota logic untouched)

**Interfaces:**
- Consumes: `synthesizeTtsWithRetry` is NOT used here anymore (moved to Task 7). `createDidTalk`/`pollDidTalk` are NOT used here anymore (moved to Task 8). Uses `createStageTimer` from Task 2.
- Produces: `POST` handler returning `ConversationResponse` (Task 5 shape) with `audio_url: null`, `audio_status: 'pending' | 'skipped'`, `video_url: null`, `video_status: 'pending' | 'skipped'`, and a real `message_id`.

- [ ] **Step 1: Update the test file's mocks and assertions**

Replace `__tests__/app/api/conversation.test.ts` in full:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockUserData = { id: 'user-1', name: 'Ana', cefr_level: 'B1', teacher_id: 'teacher-1', demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-12-31T00:00:00Z' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', teacher: { id: 'teacher-1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are Mr. Jake.', tts_voice: 'echo', avatar_image_url: '/avatars/mr-jake.png' } }

const { mockChatCreate, mockMessagesInsert, mockInsertSingle } = vi.hoisted(() => ({
  mockChatCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":"Try to buzz the \'th\' sound, like in \'the\'.","new_words":[{"word":"negotiate","definition":"to discuss terms to reach agreement"}],"suggested_replies":["I\'m doing well, thanks!","I\'m fine."],"reply_pt":"Olá Ana!","prompt_hint":"Tente dizer: I\'m doing well."}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }),
  mockInsertSingle: vi.fn().mockResolvedValue({ data: { id: 'assistant-msg-1' }, error: null }),
  mockMessagesInsert: vi.fn(),
}))

mockMessagesInsert.mockImplementation(() => ({
  select: vi.fn(() => ({ single: mockInsertSingle })),
}))

vi.mock('@/lib/vip', () => ({ isUserVip: vi.fn().mockResolvedValue(null) }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn((table: string) => {
      if (table === 'sessions') return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
            })),
          })),
        })),
      }
      if (table === 'users') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
      }
      if (table === 'subscriptions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
      }
      if (table === 'usage_log') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
      }
      if (table === 'session_memory') return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        })),
      }
      if (table === 'errors_log') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { error_text: 'I goed to school', correct_form: 'I went to school', error_type: 'verb_tense' },
            error: null,
          }),
        }
      }
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
        insert: mockMessagesInsert,
      }
      if (table === 'vocab_log') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      transcriptions: { create: vi.fn().mockResolvedValue({ text: 'Hello teacher.' }) },
    }
    chat = { completions: { create: mockChatCreate } }
  },
}))

function makeFormRequest(fields: Record<string, string | Blob>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/conversation', { method: 'POST', body: form })
}

import { POST } from '@/app/api/conversation/route'

describe('POST /api/conversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text immediately with audio/video pending — no audio_url yet', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
    expect(body.message_id).toBe('assistant-msg-1')
    expect(body.audio_url).toBeNull()
    expect(body.audio_status).toBe('pending')
    expect(body.video_url).toBeNull()
    expect(['pending', 'skipped']).toContain(body.video_status)
    expect(body.had_correction).toBe(false)
    expect(body).toHaveProperty('new_words')
    expect(body.suggested_replies).toEqual(["I'm doing well, thanks!", "I'm fine."])
    expect(body.reply_pt).toBe('Olá Ana!')
  })

  it('persists reply_pt and suggested_replies on the assistant message row', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    await POST(makeFormRequest({ session_id: 'session-1', audio }))

    const assistantCall = mockMessagesInsert.mock.calls.find((call: any[]) => call[0]?.[0]?.role === 'assistant')
    expect(assistantCall).toBeDefined()
    expect(assistantCall![0][0].reply_pt).toBe('Olá Ana!')
    expect(assistantCall![0][0].suggested_replies).toEqual(["I'm doing well, thanks!", "I'm fine."])
    expect(assistantCall![0][0].audio_status).toBe('pending')
  })

  it('requests JSON mode from the chat completion', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    await POST(makeFormRequest({ session_id: 'session-1', audio }))
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    )
  })

  it('handles panic_text instead of audio', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'I go to school yesterday.' }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
  })

  it('includes pronunciation_hint in response when GPT provides one', async () => {
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'I tink dis is good')
    const res = await POST(new Request('http://localhost/api/conversation', { method: 'POST', body: form }))
    const body = await res.json()
    expect(typeof body.pronunciation_hint === 'string' || body.pronunciation_hint === null).toBe(true)
  })

  it('returns 400 when both audio and panic_text are missing', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('injects session memory into system prompt when memory exists', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
        }
        if (table === 'users') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
        }
        if (table === 'subscriptions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        if (table === 'usage_log') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
        }
        if (table === 'session_memory') return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { summary: 'Student likes coding.', key_topics: ['present perfect'], personal_details: ['software engineer'] },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
        if (table === 'errors_log') {
          return {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
          insert: mockMessagesInsert,
        }
        if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    } as any)

    await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'Hello.' }))

    const callArgs = mockChatCreate.mock.calls[0][0]
    const systemMsg = callArgs.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMsg?.content).toContain('Student likes coding.')
  })

  describe('quota enforcement', () => {
    it('returns 429 when demo user has exhausted 30 demo minutes', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
        from: vi.fn((table: string) => {
          if (table === 'subscriptions') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) }
          }
          if (table === 'users') {
            return {
              select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-12-31T00:00:00Z' }, error: null }) })) })),
              update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
            }
          }
          if (table === 'usage_log') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: 30.5 }], error: null }) })) })) }
          }
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) })) }
        }),
      } as any)

      const res = await POST(makeFormRequest({ session_id: 'sess-1', panic_text: 'test' }))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('demo_exhausted')
      expect(body.minutesUsed).toBeCloseTo(30.5)
      expect(body.minutesLimit).toBe(30)
    })

    it('proceeds normally when user is within quota', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-3' } } }) },
        from: vi.fn((table: string) => {
          if (table === 'subscriptions') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { plan_id: 'pro', plans: { minutes_per_month: 300 } }, error: null }) })) })) })) }
          }
          if (table === 'users') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })) }
          }
          if (table === 'usage_log') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: 5 }], error: null }) })) })) }
          }
          if (table === 'messages') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
            insert: mockMessagesInsert,
          }
          if (table === 'session_memory') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) })),
          }
          if (table === 'errors_log') return {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
          if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
          if (table === 'sessions') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
          }
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) })) }
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      } as any)

      const res = await POST(makeFormRequest({ session_id: 'sess-3', panic_text: 'Hello' }))
      expect(res.status).not.toBe(429)
    })
  })
})
```

Note: the two other quota test files (`__tests__/api/conversation/quota-demo.test.ts`, `__tests__/api/conversation/vip-bypass.test.ts`) exercise the same untouched quota block — read them, and if they assert on `audio_url`/`video_url` shape in the 200 response, update those specific assertions to the new pending shape the same way as above; leave everything else in those files unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`
Expected: FAIL (route still returns the old atomic shape with TTS/D-ID)

- [ ] **Step 3: Rewrite the route handler**

```typescript
// app/api/conversation/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getTopicByKey } from '@/lib/topics'
import type { ConversationResponse, ErrorReport, ErrorType } from '@/types'
import { isUserVip } from '@/lib/vip'
import { createStageTimer } from '@/lib/timing'

const VALID_ERROR_TYPES = new Set<string>(['verb_tense', 'vocabulary', 'preposition', 'pronunciation', 'other'])

interface ClaudeOutput {
  reply: string
  correction: {
    error_detected: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }
  pronunciation_hint: string | null
  new_words: Array<{ word: string; definition: string }> | null
  suggested_replies: string[] | null
  reply_pt: string | null
  prompt_hint: string | null
}

export async function POST(request: Request) {
  const timer = createStageTimer('conversation')
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Quota check ─────────────────────────────────────────────────────────
  // VIP check first — avoids unnecessary DB queries for VIP users
  const vipUser = await isUserVip(user.email ?? '')

  if (!vipUser) {
    const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const firstOfMonth = `${nowBR.getUTCFullYear()}-${String(nowBR.getUTCMonth() + 1).padStart(2, '0')}-01`

    const [{ data: subData, error: quotaSubError }, { data: demoUserData, error: quotaDemoError }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plans!inner(minutes_per_month)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('users')
        .select('demo_status, demo_started_at, demo_expires_at')
        .eq('id', user.id)
        .single(),
    ])

    const demoColumnsMissing = quotaDemoError?.code === '42703'

    if (quotaSubError || (quotaDemoError && !demoColumnsMissing)) {
      console.error('Quota check DB error', quotaSubError ?? quotaDemoError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (subData) {
      const minutesLimit = (subData.plans as unknown as { minutes_per_month: number }).minutes_per_month
      const { data: usageRows, error: usageError } = await supabase
        .from('usage_log')
        .select('whisper_minutes')
        .eq('user_id', user.id)
        .gte('date', firstOfMonth)

      if (usageError) {
        console.error('Quota usage DB error', usageError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      const minutesUsed: number = (usageRows ?? []).reduce(
        (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
        0,
      )
      if (minutesUsed >= minutesLimit) {
        return NextResponse.json({ error: 'quota_exceeded', minutesUsed, minutesLimit }, { status: 429 })
      }
    } else if (demoColumnsMissing) {
      return NextResponse.json({ error: 'demo_required', minutesUsed: 0, minutesLimit: 30 }, { status: 403 })
    } else {
      const demo = demoUserData

      if (!demo?.demo_status) {
        return NextResponse.json({ error: 'demo_required', minutesUsed: 0, minutesLimit: 30 }, { status: 403 })
      }
      if (demo.demo_status === 'expired') {
        return NextResponse.json({ error: 'demo_expired', minutesUsed: 0, minutesLimit: 30 }, { status: 429 })
      }
      if (demo.demo_status === 'exhausted') {
        return NextResponse.json({ error: 'demo_exhausted', minutesUsed: 30, minutesLimit: 30 }, { status: 429 })
      }
      if (demo.demo_expires_at && new Date(demo.demo_expires_at) <= new Date()) {
        await supabase.from('users').update({ demo_status: 'expired' }).eq('id', user.id)
        return NextResponse.json({ error: 'demo_expired', minutesUsed: 0, minutesLimit: 30 }, { status: 429 })
      }

      const demoStartDate = (demo.demo_started_at ?? new Date().toISOString()).slice(0, 10)
      const { data: demoUsageRows, error: demoUsageError } = await supabase
        .from('usage_log')
        .select('whisper_minutes')
        .eq('user_id', user.id)
        .gte('date', demoStartDate)

      if (demoUsageError) {
        console.error('Demo quota usage DB error', demoUsageError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      const DEMO_MINUTES_LIMIT = 30
      const minutesUsed: number = (demoUsageRows ?? []).reduce(
        (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
        0,
      )
      if (minutesUsed >= DEMO_MINUTES_LIMIT) {
        await supabase.from('users').update({ demo_status: 'exhausted' }).eq('id', user.id)
        return NextResponse.json(
          { error: 'demo_exhausted', minutesUsed, minutesLimit: DEMO_MINUTES_LIMIT },
          { status: 429 },
        )
      }
    }
  }
  timer.mark('quota_check')
  // ── End quota check ──────────────────────────────────────────────────────

  const formData = await request.formData()
  const sessionId = formData.get('session_id') as string | null
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('panic_text') as string | null

  const trimmedPanicText = panicText ? panicText.trim() : null
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  if (!audio && !trimmedPanicText) return NextResponse.json({ error: 'No audio or panic_text' }, { status: 400 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const teacher = session.teacher as {
    id: string; slug: string; name: string; system_prompt: string
    tts_voice: string; avatar_image_url: string; correction_style: string
  } | null
  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // Independent reads — run together instead of four sequential round trips
  const [{ data: userData }, { data: sessionMemory }, { data: topError }, { data: prevMessages }] = await Promise.all([
    supabase.from('users').select('name, cefr_level').eq('id', user.id).single(),
    supabase
      .from('session_memory')
      .select('summary, key_topics, personal_details')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('errors_log')
      .select('error_text, correct_form, error_type')
      .eq('user_id', user.id)
      .is('resolved_at', null)
      .order('seen_count', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('role, text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  timer.mark('parallel_reads')

  let transcript: string
  if (audio) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const result = await openai.audio.transcriptions.create({
      file: audio as unknown as File,
      model: 'whisper-1',
      language: 'en',
    })
    transcript = result.text.trim()
  } else {
    transcript = trimmedPanicText as string
  }
  timer.mark('whisper')

  const chronologicalMessages = (prevMessages ?? []).reverse()

  const memoryBlock = sessionMemory
    ? `\nPrevious session context:\n${sessionMemory.summary}\nTopics covered: ${(sessionMemory.key_topics ?? []).join(', ')}\nAbout the student: ${(sessionMemory.personal_details ?? []).join('; ')}`
    : ''

  const topicData = getTopicByKey(session.topic as string | null)
  const lessonPlan = (session as Record<string, unknown>).lesson_plan_json as {
    title_pt?: string
    objective_pt?: string
    teacher_greeting?: string
    lesson_instructions?: string
    vocabulary_focus?: string[]
  } | null

  const topicBlock = lessonPlan
    ? `\nPERSONALIZED LESSON PLAN FOR TODAY:
Topic: "${lessonPlan.title_pt ?? topicData?.labelPt ?? ''}"
Objective: "${lessonPlan.objective_pt ?? ''}"
On your FIRST message, open with: "${lessonPlan.teacher_greeting ?? ''}"
Session instructions: ${lessonPlan.lesson_instructions ?? 'Follow normal lesson structure.'}
${lessonPlan.vocabulary_focus?.length ? `Vocabulary to cover: ${lessonPlan.vocabulary_focus.join(', ')}` : ''}`
    : topicData
    ? `\nToday's lesson topic: "${topicData.labelPt}" — ${topicData.promptEn}. Naturally guide the conversation toward this theme while staying responsive to the student.`
    : ''

  const errorContextBlock = topError
    ? `\nRecurring error to revisit: The student frequently makes this mistake — "${topError.error_text}" (correct: "${topError.correct_form}"). Early in the session, naturally reference this and give a brief practice moment.`
    : ''

  const cefrLevel = userData?.cefr_level ?? 'B1'
  const interventionBlock = (cefrLevel === 'A1' || cefrLevel === 'A2')
    ? `\nIntervention timing: Help quickly — if the student hesitates more than a moment, gently supply the missing word or rephrase your question to keep confidence high.`
    : (cefrLevel === 'B1' || cefrLevel === 'B2')
    ? `\nIntervention timing: Let the student work through difficulties before helping. Pause and allow them to self-correct. Only step in if they seem genuinely stuck.`
    : `\nIntervention timing: Only intervene when explicitly asked. Push the student to self-correct and rephrase. Expect near-native fluency and challenge them accordingly.`

  const studentName = userData?.name ?? 'the student'
  const anatomyBlock = lessonPlan
    ? `\nLESSON STRUCTURE — you are the TEACHER, you lead every step:
1. OPENING (your very first message): Use the personalized greeting above, then IMMEDIATELY begin teaching the first vocabulary item or concept. Do NOT just ask a question — start teaching.
2. TEACH BEFORE YOU TEST — for every new word or concept:
   a) YOU introduce it: say it clearly + give the Portuguese translation + give a simple relatable example (e.g. "RED 🔴 — in Portuguese, 'vermelho'. Think of a red apple or a traffic light!")
   b) Only AFTER explaining, ask the student to repeat or use it: "Can you say 'red'?"
   c) If the student struggles or gets it wrong, YOU say the word again clearly, then ask once more. Never move on without the student getting it right.
3. BUILD PROGRESSIVELY: After introducing 2–3 items, create a small practice moment combining what was taught. Never introduce all items at once — interleave teaching and practice.
4. WRAP UP: At the end, do a quick friendly review of everything covered. Be warm and encouraging.

CRITICAL RULE: NEVER ask the student to say or use something they have NOT been taught in this session yet. You are a teacher guiding a beginner — not a quiz master testing them cold.`
    : `\nSession anatomy — follow this structure:
1. WARM-UP (your first message): Greet ${studentName} by name. Ask one casual question about their day or week.
2. ERROR REVIEW (next 1-2 exchanges): If a recurring error is listed above, naturally revisit it with a short practice moment.
3. NEW CONTENT + PRACTICE (main body): Introduce or reinforce a grammar structure or vocabulary area appropriate for ${cefrLevel} level through natural questions — not explicit drills.
4. FREE CONVERSATION (closing): Converse freely on today's topic. Correct errors naturally within the flow without interrupting the conversation.`

  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${studentName}
- CEFR level: ${cefrLevel}
${memoryBlock}${topicBlock}${errorContextBlock}${anatomyBlock}${interventionBlock}
UNDERSTANDING RULE — CRITICAL: You are an AI that understands perfectly. NEVER say "I didn't understand", "Could you repeat?", "I'm not sure what you mean", or any variation. Always interpret the student's message charitably — even if pronunciation was unclear or the sentence was incomplete, understand their intent and respond naturally to it. If the message was very unclear, make a reasonable assumption about what they meant and continue the conversation. A real teacher always finds a way to understand their student.

Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null,"suggested_replies":null,"reply_pt":null,"prompt_hint":null}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
When the student's transcript reveals a common Brazilian pronunciation pattern issue (e.g. "th" pronounced as "d" or "t", dropping final "s", wrong word stress, "ed" pronounced as a full syllable), set pronunciation_hint to a single clear tip under 20 words. Otherwise set pronunciation_hint to null.
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.
For suggested_replies: provide 2-3 very short English phrases (under 8 words each) the student could realistically say next, appropriate for ${cefrLevel} level. If no student response is needed, set to null.
For reply_pt: always provide a Brazilian Portuguese translation of your "reply" field.
For prompt_hint: if the student might not know how to start responding, provide a short tip in Portuguese starting with "Tente dizer:" (e.g., "Tente dizer: My name is ___"). Set to null if the expected response is obvious.`

  const openaiChat = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const chatRes = await openaiChat.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      ...(chronologicalMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }))),
      { role: 'user', content: transcript },
    ],
  })
  timer.mark('gpt')

  const rawText = chatRes.choices[0]?.message?.content ?? '{}'
  let parsed: ClaudeOutput
  try {
    parsed = JSON.parse(rawText) as ClaudeOutput
  } catch {
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null, suggested_replies: null, reply_pt: null, prompt_hint: null }
  }

  const replyText: string = (typeof parsed.reply === 'string' && parsed.reply.length > 0)
    ? parsed.reply
    : rawText
  const correctionRaw = parsed.correction ?? {}
  const pronunciationHint: string | null = (typeof parsed.pronunciation_hint === 'string' && parsed.pronunciation_hint.length > 0)
    ? parsed.pronunciation_hint
    : null

  const newWordsRaw: Array<{ word: string; definition: string }> = Array.isArray(parsed.new_words)
    ? (parsed.new_words as unknown[]).filter(
        (w): w is { word: string; definition: string } =>
          typeof (w as { word?: unknown }).word === 'string' &&
          typeof (w as { definition?: unknown }).definition === 'string'
      )
    : []

  const suggestedRepliesRaw: string[] | null = Array.isArray(parsed.suggested_replies)
    ? (parsed.suggested_replies as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, 3)
    : null

  const replyPt: string | null = (typeof parsed.reply_pt === 'string' && parsed.reply_pt.length > 0)
    ? parsed.reply_pt
    : null

  const promptHint: string | null = (typeof parsed.prompt_hint === 'string' && parsed.prompt_hint.length > 0)
    ? parsed.prompt_hint
    : null

  const errorReport: ErrorReport = {
    error_detected: correctionRaw.error_detected ?? false,
    error_text: correctionRaw.error_text ?? undefined,
    correct_form: correctionRaw.correct_form ?? undefined,
    error_type: VALID_ERROR_TYPES.has(correctionRaw.error_type ?? '') ? (correctionRaw.error_type as ErrorType) : undefined,
  }

  const { error: userInsertError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', text: transcript, audio_url: null, had_correction: false },
  ])
  if (userInsertError) console.error('User message insert failed:', userInsertError.message)

  const didOrigin = process.env.EF_PUBLIC_ORIGIN
  const videoStatus: 'pending' | 'skipped' = didOrigin ? 'pending' : 'skipped'

  const { data: insertedAssistant, error: assistantInsertError } = await supabase
    .from('messages')
    .insert([{
      session_id: sessionId,
      role: 'assistant',
      text: replyText,
      audio_url: null,
      had_correction: errorReport.error_detected,
      pronunciation_hint: pronunciationHint,
      reply_pt: replyPt,
      suggested_replies: suggestedRepliesRaw,
      audio_status: 'pending',
      video_status: videoStatus,
    }])
    .select('id')
    .single()
  if (assistantInsertError) console.error('Assistant message insert failed:', assistantInsertError.message)
  timer.mark('db_write')

  if (errorReport.error_detected && errorReport.error_text && errorReport.correct_form && errorReport.error_type) {
    const { error: errLogError } = await supabase.rpc('upsert_error_log', {
      p_user_id: user.id,
      p_error_type: errorReport.error_type,
      p_error_text: errorReport.error_text,
      p_correct_form: errorReport.correct_form,
    })
    if (errLogError) console.error('Error log upsert failed:', errLogError.message)
  }

  if (newWordsRaw.length > 0) {
    const { error: vocabError } = await supabase
      .from('vocab_log')
      .upsert(
        newWordsRaw.map((w) => ({
          user_id: user.id,
          word: w.word.toLowerCase().trim(),
          definition: w.definition.trim(),
        })),
        { onConflict: 'user_id,word', ignoreDuplicates: true }
      )
    if (vocabError) console.error('Vocab log upsert failed:', vocabError.message)
  }

  const usage = chatRes.usage
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { error: usageError } = await supabase.rpc('increment_usage_log', {
    p_user_id: user.id,
    p_date: today,
    p_whisper_minutes: audio ? 0.5 : 0,
    p_tts_chars: 0,
    p_claude_tokens: (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
    p_did_credits: 0,
  })
  if (usageError) console.error('Usage log increment failed:', usageError.message)

  timer.finish({ session_id: sessionId, has_audio: !!audio, video_status: videoStatus })

  const response: ConversationResponse = {
    message_id: insertedAssistant?.id ?? null,
    text: replyText,
    audio_url: null,
    audio_status: 'pending',
    video_url: null,
    video_status: videoStatus,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
    transcript,
    pronunciation_hint: pronunciationHint,
    new_words: newWordsRaw.length > 0 ? newWordsRaw.map((w) => w.word) : null,
    suggested_replies: suggestedRepliesRaw,
    reply_pt: replyPt,
    prompt_hint: promptHint,
  }

  return NextResponse.json(response)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts __tests__/api/conversation`
Expected: PASS — all tests in `conversation.test.ts`, `quota-demo.test.ts`, `vip-bypass.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts __tests__/api/conversation
git commit -m "perf: split TTS/D-ID out of /api/conversation for fast text response"
```

---

### Task 7: `POST /api/conversation/audio` — TTS with retry

**Files:**
- Create: `app/api/conversation/audio/route.ts`
- Create: `__tests__/app/api/conversation/audio.test.ts`

**Interfaces:**
- Consumes: `synthesizeTtsWithRetry` (Task 3), `createSupabaseAdmin` (existing), `createStageTimer` (Task 2).
- Produces: `POST` handler accepting `{ message_id: string }` JSON body, returns `AudioFetchResponse` (Task 5 shape). On failure after retries, sets `audio_status: 'failed'` on the row and responds `502` with `{ audio_url: null, audio_status: 'failed' }` — never a raw 500/stack trace.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/app/api/conversation/audio.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', text: 'Hi Ana!', session_id: 'session-1', role: 'assistant' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher: { tts_voice: 'echo' } }

const { mockSynthesize, mockUpdate, mockUpload, mockRpc } = vi.hoisted(() => ({
  mockSynthesize: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  mockUpload: vi.fn().mockResolvedValue({ error: null }),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/tts', () => ({ synthesizeTtsWithRetry: mockSynthesize }))

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/audio-replay/user-1/session-1/x.mp3' } }),
      })),
    },
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) })) })) })),
        update: mockUpdate,
      }
      if (table === 'sessions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

function jsonRequest(body: object) {
  return new Request('http://localhost/api/conversation/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

import { POST } from '@/app/api/conversation/audio/route'

describe('POST /api/conversation/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockUpload.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when message_id is missing', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('synthesizes audio, uploads it, and marks the message ready', async () => {
    mockSynthesize.mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,abc', buffer: Buffer.from('mp3') })
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.audio_status).toBe('ready')
    expect(body.audio_url).toContain('audio-replay')
    expect(mockSynthesize).toHaveBeenCalledWith('Hi Ana!', 'echo')
  })

  it('falls back to the inline data URL when storage upload fails', async () => {
    mockSynthesize.mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,abc', buffer: Buffer.from('mp3') })
    mockUpload.mockResolvedValueOnce({ error: { message: 'upload failed' } })
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.audio_status).toBe('ready')
    expect(body.audio_url).toBe('data:audio/mp3;base64,abc')
  })

  it('marks the message failed and returns 502 when synthesis exhausts all retries', async () => {
    mockSynthesize.mockRejectedValue(new Error('OpenAI down'))
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.audio_status).toBe('failed')
    expect(body.audio_url).toBeNull()
  })

  it('returns 404 when the message does not belong to the caller', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)
    const res = await POST(jsonRequest({ message_id: 'not-mine' }))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/app/api/conversation/audio.test.ts`
Expected: FAIL — module `@/app/api/conversation/audio/route` does not exist

- [ ] **Step 3: Implement the route**

```typescript
// app/api/conversation/audio/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { synthesizeTtsWithRetry } from '@/lib/tts'
import { createStageTimer } from '@/lib/timing'
import type { AudioFetchResponse } from '@/types'

export async function POST(request: Request) {
  const timer = createStageTimer('conversation_audio')
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { message_id?: string }
  const messageId = body.message_id
  if (!messageId) return NextResponse.json({ error: 'message_id required' }, { status: 400 })

  const { data: message } = await supabase
    .from('messages')
    .select('id, text, session_id')
    .eq('id', messageId)
    .eq('role', 'assistant')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(tts_voice)')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const teacherVoice = (session.teacher as { tts_voice?: string } | null)?.tts_voice ?? 'alloy'

  try {
    const { dataUrl, buffer } = await synthesizeTtsWithRetry(message.text, teacherVoice)
    timer.mark('tts')

    const supabaseAdmin = createSupabaseAdmin()
    const storagePath = `${user.id}/${message.session_id}/${crypto.randomUUID()}.mp3`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-replay')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })

    const audioUrl = uploadError
      ? dataUrl
      : supabaseAdmin.storage.from('audio-replay').getPublicUrl(storagePath).data.publicUrl
    if (uploadError) console.error('Audio upload failed, using inline data URL:', uploadError.message)
    timer.mark('upload')

    await supabase.from('messages').update({ audio_url: audioUrl, audio_status: 'ready' }).eq('id', messageId)

    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await supabase.rpc('increment_usage_log', {
      p_user_id: user.id,
      p_date: today,
      p_whisper_minutes: 0,
      p_tts_chars: message.text.length,
      p_claude_tokens: 0,
      p_did_credits: 0,
    })

    timer.finish({ message_id: messageId })
    const response: AudioFetchResponse = { audio_url: audioUrl, audio_status: 'ready' }
    return NextResponse.json(response)
  } catch (err) {
    console.error('TTS synthesis failed after retries:', err)
    await supabase.from('messages').update({ audio_status: 'failed' }).eq('id', messageId)
    timer.finish({ message_id: messageId, failed: true })
    const response: AudioFetchResponse = { audio_url: null, audio_status: 'failed' }
    return NextResponse.json(response, { status: 502 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/conversation/audio.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/conversation/audio/route.ts __tests__/app/api/conversation/audio.test.ts
git commit -m "feat: add async TTS endpoint with retry, decoupled from text response"
```

---

### Task 8: `POST /api/conversation/avatar` + `GET /api/conversation/avatar/[talkId]`

**Files:**
- Create: `app/api/conversation/avatar/route.ts`
- Create: `app/api/conversation/avatar/[talkId]/route.ts`
- Create: `__tests__/app/api/conversation/avatar.test.ts`
- Create: `__tests__/app/api/conversation/avatar-poll.test.ts`

**Interfaces:**
- Consumes: `createDidTalk`, `pollDidTalk`, `DID_VOICE_IDS` (Task 4).
- Produces: `POST /api/conversation/avatar` returns `AvatarCreateResponse`; `GET /api/conversation/avatar/[talkId]` returns `AvatarPollResponse` (Task 5 shapes). Neither endpoint blocks longer than a single D-ID HTTP call — polling cadence is owned by the client (Task 9).

- [ ] **Step 1: Write the failing tests for the create endpoint**

```typescript
// __tests__/app/api/conversation/avatar.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', text: 'Hi Ana!', session_id: 'session-1', role: 'assistant' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher: { slug: 'mr-jake', avatar_image_url: '/avatars/mr-jake.png' } }

const { mockCreateDidTalk, mockUpdate } = vi.hoisted(() => ({
  mockCreateDidTalk: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
}))

vi.mock('@/lib/did', () => ({
  createDidTalk: mockCreateDidTalk,
  DID_VOICE_IDS: { 'mr-jake': 'en-US-GuyNeural' },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) })) })) })),
        update: mockUpdate,
      }
      if (table === 'sessions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

function jsonRequest(body: object) {
  return new Request('http://localhost/api/conversation/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

import { POST } from '@/app/api/conversation/avatar/route'

describe('POST /api/conversation/avatar', () => {
  const originalEnv = process.env
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    process.env = { ...originalEnv, EF_PUBLIC_ORIGIN: 'https://app.example.com' }
  })
  afterEach(() => { process.env = originalEnv })

  it('returns skipped immediately when EF_PUBLIC_ORIGIN is not configured', async () => {
    process.env.EF_PUBLIC_ORIGIN = ''
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.video_status).toBe('skipped')
    expect(body.talk_id).toBeNull()
    expect(mockCreateDidTalk).not.toHaveBeenCalled()
  })

  it('returns the talk_id and pending status on success', async () => {
    mockCreateDidTalk.mockResolvedValue('tlk_123')
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.talk_id).toBe('tlk_123')
    expect(body.video_status).toBe('pending')
  })

  it('returns failed status when D-ID create fails', async () => {
    mockCreateDidTalk.mockResolvedValue(null)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.talk_id).toBeNull()
    expect(body.video_status).toBe('failed')
  })

  it('returns 400 when message_id is missing', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/api/conversation/avatar.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the create endpoint**

```typescript
// app/api/conversation/avatar/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { createDidTalk, DID_VOICE_IDS } from '@/lib/did'
import type { AvatarCreateResponse } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { message_id?: string }
  const messageId = body.message_id
  if (!messageId) return NextResponse.json({ error: 'message_id required' }, { status: 400 })

  const { data: message } = await supabase
    .from('messages')
    .select('id, text, session_id')
    .eq('id', messageId)
    .eq('role', 'assistant')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(slug, avatar_image_url)')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const didOrigin = process.env.EF_PUBLIC_ORIGIN
  if (!didOrigin) {
    await supabase.from('messages').update({ video_status: 'skipped' }).eq('id', messageId)
    const response: AvatarCreateResponse = { talk_id: null, video_status: 'skipped' }
    return NextResponse.json(response)
  }

  const teacher = session.teacher as { slug?: string; avatar_image_url?: string } | null
  const talkId = await createDidTalk(
    message.text,
    DID_VOICE_IDS[teacher?.slug ?? ''] ?? 'en-US-JennyNeural',
    `${didOrigin}${teacher?.avatar_image_url ?? ''}`,
  )

  if (!talkId) {
    await supabase.from('messages').update({ video_status: 'failed' }).eq('id', messageId)
    const response: AvatarCreateResponse = { talk_id: null, video_status: 'failed' }
    return NextResponse.json(response)
  }

  await supabase.from('messages').update({ did_talk_id: talkId, video_status: 'pending' }).eq('id', messageId)
  const response: AvatarCreateResponse = { talk_id: talkId, video_status: 'pending' }
  return NextResponse.json(response)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- __tests__/app/api/conversation/avatar.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for the poll endpoint**

```typescript
// __tests__/app/api/conversation/avatar-poll.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', session_id: 'session-1', did_talk_id: 'tlk_123', video_status: 'pending', video_url: null }
const mockSession = { id: 'session-1' }

const { mockPollDidTalk, mockUpdate, mockRpc } = vi.hoisted(() => ({
  mockPollDidTalk: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/did', () => ({ pollDidTalk: mockPollDidTalk }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) })) })),
        update: mockUpdate,
      }
      if (table === 'sessions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { GET } from '@/app/api/conversation/avatar/[talkId]/route'

describe('GET /api/conversation/avatar/[talkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the talk does not belong to the caller', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
        }
        return {}
      }),
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/nope'), { params: { talkId: 'nope' } })
    expect(res.status).toBe(404)
  })

  it('polls D-ID and returns ready + video_url when done', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'done', resultUrl: 'https://d-id.com/video.mp4' })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.video_url).toBe('https://d-id.com/video.mp4')
    expect(mockRpc).toHaveBeenCalledWith('increment_usage_log', expect.objectContaining({ p_did_credits: 1 }))
  })

  it('returns pending without polling D-ID again once already stored as ready', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockMessage, video_status: 'ready', video_url: 'https://d-id.com/cached.mp4' }, error: null }) })) })),
        }
        if (table === 'sessions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.video_url).toBe('https://d-id.com/cached.mp4')
    expect(mockPollDidTalk).not.toHaveBeenCalled()
  })

  it('returns pending while D-ID is still processing', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'pending', resultUrl: null })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('marks failed when D-ID reports an error', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'error', resultUrl: null })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('failed')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:run -- __tests__/app/api/conversation/avatar-poll.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 7: Implement the poll endpoint**

```typescript
// app/api/conversation/avatar/[talkId]/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { pollDidTalk } from '@/lib/did'
import type { AvatarPollResponse } from '@/types'

export async function GET(request: Request, { params }: { params: { talkId: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { talkId } = params

  const { data: message } = await supabase
    .from('messages')
    .select('id, session_id, did_talk_id, video_status, video_url')
    .eq('did_talk_id', talkId)
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'Talk not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Talk not found' }, { status: 404 })

  if (message.video_status === 'ready') {
    const response: AvatarPollResponse = { status: 'ready', video_url: message.video_url }
    return NextResponse.json(response)
  }
  if (message.video_status === 'failed') {
    const response: AvatarPollResponse = { status: 'failed', video_url: null }
    return NextResponse.json(response)
  }

  const result = await pollDidTalk(talkId)

  if (result.status === 'done') {
    await supabase.from('messages').update({ video_status: 'ready', video_url: result.resultUrl }).eq('id', message.id)
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await supabase.rpc('increment_usage_log', {
      p_user_id: user.id, p_date: today, p_whisper_minutes: 0, p_tts_chars: 0, p_claude_tokens: 0, p_did_credits: 1,
    })
    const response: AvatarPollResponse = { status: 'ready', video_url: result.resultUrl }
    return NextResponse.json(response)
  }
  if (result.status === 'error') {
    await supabase.from('messages').update({ video_status: 'failed' }).eq('id', message.id)
    const response: AvatarPollResponse = { status: 'failed', video_url: null }
    return NextResponse.json(response)
  }

  const response: AvatarPollResponse = { status: 'pending', video_url: null }
  return NextResponse.json(response)
}
```

- [ ] **Step 8: Run all avatar tests to verify they pass**

Run: `npm run test:run -- __tests__/app/api/conversation/avatar.test.ts __tests__/app/api/conversation/avatar-poll.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 9: Commit**

```bash
git add app/api/conversation/avatar __tests__/app/api/conversation/avatar.test.ts __tests__/app/api/conversation/avatar-poll.test.ts
git commit -m "feat: add non-blocking D-ID avatar create + poll endpoints"
```

---

### Task 9: `hooks/useSession.ts` — progressive message state

**Files:**
- Modify: `hooks/useSession.ts`
- Modify: `__tests__/hooks/useSession.test.tsx`

**Interfaces:**
- Consumes: `ConversationResponse`, `AudioFetchResponse`, `AvatarCreateResponse`, `AvatarPollResponse` (Task 5).
- Produces: `SessionMessage` now includes `id`, `audio_status`, `video_url`, `video_status`. `sendTurn` resolves as soon as the text response lands; `fetchAudio`/`fetchAvatar` run in the background and patch the matching message via `id`.

- [ ] **Step 1: Update the test file**

Replace `__tests__/hooks/useSession.test.tsx` in full:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockConvResponse = {
  message_id: 'assistant-msg-1',
  text: 'Hello!',
  audio_url: null,
  audio_status: 'pending',
  video_url: null,
  video_status: 'skipped',
  had_correction: false,
  error_report: { error_detected: false },
  pronunciation_hint: "Watch your 'th' sound",
  suggested_replies: null,
  reply_pt: null,
  prompt_hint: null,
}

global.fetch = vi.fn()

function mockFetchSequence(...responses: object[]) {
  let call = 0
  vi.mocked(fetch).mockImplementation(() => {
    const res = responses[call] ?? responses[responses.length - 1]
    call++
    return Promise.resolve({ ok: true, json: async () => res } as Response)
  })
}

import { useSession } from '@/hooks/useSession'

describe('useSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new session when none exists', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'new-session', teacher: { id: 't1', name: 'Mr. Jake' }, topic: 'travel' }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('new-session')
    expect(result.current.topic).toBe('travel')
  })

  it('loads topic from existing session', async () => {
    mockFetchSequence({ session: { id: 'existing-session', topic: 'family', teacher: { id: 't1' }, messages: [] } })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.topic).toBe('family')
  })

  it('loads an existing session with messages, defaulting status fields', async () => {
    mockFetchSequence({
      session: {
        id: 'existing-session',
        teacher: { id: 't1' },
        messages: [{ id: 'm1', role: 'user', text: 'Hi', audio_url: null, had_correction: false }],
      },
    })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('existing-session')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].audio_status).toBe('ready')
    expect(result.current.messages[0].video_status).toBe('skipped')
  })

  it('sendTurn appends user + assistant messages and resolves without waiting for audio/video', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'sess-1', teacher: { id: 't1' } },
      mockConvResponse,
      { audio_url: 'https://cdn.example.com/audio.mp3', audio_status: 'ready' }, // fetchAudio background call
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendTurn('Hello') })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].pronunciation_hint).toBe("Watch your 'th' sound")
    expect(result.current.messages[1].audio_status).toBe('pending')

    await waitFor(() => expect(result.current.messages[1].audio_status).toBe('ready'))
    expect(result.current.messages[1].audio_url).toBe('https://cdn.example.com/audio.mp3')
  })

  it('calls finalize after endSession succeeds', async () => {
    mockFetchSequence(
      { session: { id: 's1', messages: [] } },
      { ok: true },
      { ok: true }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.endSession() })

    expect(global.fetch).toHaveBeenCalledTimes(3)
    const calls = (global.fetch as any).mock.calls
    expect(calls[2][0]).toContain('/finalize')
    expect(calls[2][1]?.method).toBe('POST')
  })

  describe('quota detection', () => {
    it('sets quotaExceeded=true and stores quotaInfo when conversation returns 429', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session: { id: 'sess-1', messages: [] } }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false, status: 429,
        json: async () => ({ error: 'quota_exceeded', minutesUsed: 10.5, minutesLimit: 10 }),
      } as unknown as Response)

      const { result } = renderHook(() => useSession('teacher-1'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => { await result.current.sendTurn('Hello') })

      expect(result.current.quotaExceeded).toBe(true)
      expect(result.current.quotaInfo).toEqual({ minutesUsed: 10.5, minutesLimit: 10 })
      expect(result.current.turnError).toBeNull()
    })

    it('does not set quotaExceeded for non-429 errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session: { id: 'sess-2', messages: [] } }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'internal' }) } as unknown as Response)

      const { result } = renderHook(() => useSession('teacher-2'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => { await result.current.sendTurn('Hello') })

      expect(result.current.quotaExceeded).toBe(false)
      expect(result.current.quotaInfo).toBeNull()
      expect(result.current.turnError).toBe('Erro ao enviar. Tente novamente.')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`
Expected: FAIL — current hook doesn't expose `id`/`audio_status`/`video_status` per message

- [ ] **Step 3: Rewrite the hook**

```typescript
// hooks/useSession.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationResponse, AudioFetchResponse, AvatarCreateResponse, AvatarPollResponse, AudioStatus, VideoStatus } from '@/types'

interface SessionMessage {
  id: string | null
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  audio_status: AudioStatus
  video_url: string | null
  video_status: VideoStatus
  had_correction: boolean
  pronunciation_hint: string | null
  suggested_replies: string[] | null
  reply_pt: string | null
}

interface UseSessionReturn {
  sessionId: string | null
  topic: string | null
  messages: SessionMessage[]
  loading: boolean
  sending: boolean
  initError: string | null
  turnError: string | null
  quotaExceeded: boolean
  quotaInfo: { minutesUsed: number; minutesLimit: number } | null
  lastPromptHint: string | null
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}

const AVATAR_POLL_INTERVAL_MS = 1500
const AVATAR_POLL_MAX_ATTEMPTS = 8

export function useSession(teacherId: string): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState<{ minutesUsed: number; minutesLimit: number } | null>(null)
  const [lastPromptHint, setLastPromptHint] = useState<string | null>(null)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const getRes = await fetch(`/api/session?teacher_id=${encodeURIComponent(teacherId)}`)

        if (!getRes.ok) {
          if (mounted) setInitError('Não foi possível carregar a sessão. Tente novamente.')
          return
        }

        const data = await getRes.json()
        const session = data.session ?? data

        if (session?.id) {
          if (!mounted) return
          setSessionId(session.id)
          setTopic((session.topic as string | null) ?? null)
          interface RawDbMessage {
            id: string
            role: string
            text: string
            audio_url: string | null
            audio_status: AudioStatus | null
            video_url: string | null
            video_status: VideoStatus | null
            had_correction: boolean
            pronunciation_hint: string | null
            suggested_replies: string[] | null
            reply_pt: string | null
          }
          setMessages(
            (session.messages ?? []).map((m: RawDbMessage) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              audio_url: m.audio_url,
              audio_status: m.audio_status ?? 'ready',
              video_url: m.video_url ?? null,
              video_status: m.video_status ?? 'skipped',
              had_correction: m.had_correction,
              pronunciation_hint: m.pronunciation_hint ?? null,
              suggested_replies: m.suggested_replies ?? null,
              reply_pt: m.reply_pt ?? null,
            }))
          )
          return
        }

        const postRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        })
        if (!postRes.ok) {
          if (mounted) setInitError('Não foi possível iniciar a sessão. Tente novamente.')
          return
        }
        const { session_id, topic: newTopic } = await postRes.json()
        if (mounted) {
          setSessionId(session_id)
          setTopic((newTopic as string | null) ?? null)
        }
      } catch (err) {
        console.error('useSession init error:', err)
        if (mounted) setInitError('Erro de conexão. Tente novamente.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [teacherId])

  const patchMessage = useCallback((messageId: string, patch: Partial<SessionMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)))
  }, [])

  const fetchAudio = useCallback(async (messageId: string) => {
    try {
      const res = await fetch('/api/conversation/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
      const data = (await res.json()) as AudioFetchResponse
      patchMessage(messageId, { audio_url: data.audio_url, audio_status: data.audio_status })
    } catch (err) {
      console.error('fetchAudio failed:', err)
      patchMessage(messageId, { audio_status: 'failed' })
    }
  }, [patchMessage])

  const fetchAvatar = useCallback(async (messageId: string) => {
    try {
      const createRes = await fetch('/api/conversation/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
      const created = (await createRes.json()) as AvatarCreateResponse
      if (!created.talk_id) {
        patchMessage(messageId, { video_status: created.video_status })
        return
      }

      for (let attempt = 0; attempt < AVATAR_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, AVATAR_POLL_INTERVAL_MS))
        const pollRes = await fetch(`/api/conversation/avatar/${created.talk_id}`)
        const polled = (await pollRes.json()) as AvatarPollResponse
        if (polled.status === 'ready') {
          patchMessage(messageId, { video_url: polled.video_url, video_status: 'ready' })
          return
        }
        if (polled.status === 'failed') {
          patchMessage(messageId, { video_status: 'failed' })
          return
        }
      }
      // Gave the avatar its fair chance — fall back to the static image rather than waiting forever
      patchMessage(messageId, { video_status: 'failed' })
    } catch (err) {
      console.error('fetchAvatar failed:', err)
      patchMessage(messageId, { video_status: 'failed' })
    }
  }, [patchMessage])

  const sendTurn = useCallback(async (input: File | string): Promise<ConversationResponse | null> => {
    if (!sessionId) return null
    setSending(true)
    setTurnError(null)
    setLastPromptHint(null)

    try {
      const form = new FormData()
      form.append('session_id', sessionId)
      if (typeof input === 'string') form.append('panic_text', input)
      else form.append('audio', input, 'recording.webm')

      const res = await fetch('/api/conversation', { method: 'POST', body: form })
      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          const body = await res.json() as { error: string; minutesUsed?: number; minutesLimit?: number }
          setQuotaExceeded(true)
          setQuotaInfo({ minutesUsed: body.minutesUsed ?? 0, minutesLimit: body.minutesLimit ?? 30 })
        } else {
          setTurnError('Erro ao enviar. Tente novamente.')
        }
        return null
      }
      const data = (await res.json()) as ConversationResponse
      const userText = data.transcript ?? (typeof input === 'string' ? input : '...')

      setMessages((prev) => [
        ...prev,
        { id: null, role: 'user', text: userText, audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: data.message_id, role: 'assistant', text: data.text, audio_url: data.audio_url, audio_status: data.audio_status, video_url: data.video_url, video_status: data.video_status, had_correction: data.had_correction, pronunciation_hint: data.pronunciation_hint ?? null, suggested_replies: data.suggested_replies ?? null, reply_pt: data.reply_pt ?? null },
      ])
      setLastPromptHint(data.prompt_hint ?? null)

      if (data.message_id) {
        if (data.audio_status === 'pending') fetchAudio(data.message_id)
        if (data.video_status === 'pending') fetchAvatar(data.message_id)
      }

      return data
    } catch (err) {
      console.error('sendTurn network error:', err)
      setTurnError('Erro de conexão. Tente novamente.')
      return null
    } finally {
      setSending(false)
    }
  }, [sessionId, fetchAudio, fetchAvatar])

  const endSession = useCallback(async () => {
    if (!sessionId) return
    const elapsed = Date.now() - startedAt.current
    const duration_seconds = Number.isFinite(elapsed) && elapsed > 0 ? Math.round(elapsed / 1000) : 0
    const patchRes = await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
      keepalive: true,
    })
    if (!patchRes.ok) {
      console.error('Failed to end session:', patchRes.status)
      return
    }
    fetch(`/api/session/${sessionId}/finalize`, { method: 'POST', keepalive: true }).catch((err) =>
      console.error('Finalize failed:', err),
    )
  }, [sessionId])

  return { sessionId, topic, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, lastPromptHint, sendTurn, endSession }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add hooks/useSession.ts __tests__/hooks/useSession.test.tsx
git commit -m "feat: progressive audio/video state in useSession, decoupled from text response"
```

---

### Task 10: `AulaClient.tsx` — react to progressive state instead of the old atomic response

**Files:**
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `messages[i].audio_url/audio_status/video_url/video_status/id` from Task 9's `useSession`.
- Produces: audio now plays automatically the moment the last assistant message's `audio_status` becomes `'ready'`; `TeacherAvatar`'s `videoUrl` is derived from the last assistant message instead of local state; `MessageBubble` receives `audioStatus` for the last message so it can show "preparando áudio..." (Task 11).

- [ ] **Step 1: Update the test mock messages to the new shape**

In `__tests__/app/aula/AulaClient.test.tsx`, update every mocked `messages` array to include the new fields, e.g. the default mock at the top becomes:

```typescript
vi.mock('@/hooks/useSession', () => ({
  useSession: vi.fn(() => ({
    sessionId: 'sess-1',
    topic: 'travel',
    messages: [
      { id: 'm1', role: 'user', text: 'Hello!', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      { id: 'm2', role: 'assistant', text: 'Hi there!', audio_url: null, audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
    ],
    loading: false,
    sending: false,
    initError: null,
    turnError: null,
    quotaExceeded: false,
    quotaInfo: null,
    lastPromptHint: null,
    sendTurn: vi.fn().mockResolvedValue(null),
    endSession: vi.fn(),
  })),
}))
```

Add one new test after the existing "renders existing messages" test:

```typescript
  it('plays audio automatically once the last assistant message becomes ready', async () => {
    const playSpy = vi.fn().mockResolvedValue(undefined)
    const originalPlay = window.HTMLMediaElement.prototype.play
    window.HTMLMediaElement.prototype.play = playSpy

    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [
        { id: 'm1', role: 'user', text: 'Hi', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: 'm2', role: 'assistant', text: 'Hello!', audio_url: 'https://cdn.example.com/audio.mp3', audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      ],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: vi.fn(),
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(playSpy).toHaveBeenCalled())

    window.HTMLMediaElement.prototype.play = originalPlay
  })
```

Also add matching new fields (`id`, `audio_status`, `video_url`, `video_status`) to every other `messages`/mock-return-value block already in the file (the "shows session report modal" and "renders quota exceeded banner" tests use `messages: []`, so they need no change).

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm run test:run -- __tests__/app/aula/AulaClient.test.tsx`
Expected: FAIL — `AulaClient` still expects the old atomic response shape and never triggers `play()` off message state

- [ ] **Step 3: Rewrite the relevant parts of `AulaClient.tsx`**

Replace lines 50–167 (state declarations through `playAudio`) with:

```typescript
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [textValue, setTextValue] = useState('')
  const [showReport, setShowReport] = useState(false)
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
  } | null>(null)

  const [showIntro, setShowIntro] = useState(true)

  const [learnedWords, setLearnedWords] = useState<string[]>([])
  const [xpBurst, setXpBurst] = useState<{ key: number; xp: number } | null>(null)
  const [xpTotal, setXpTotal] = useState(0)
  const xpKeyRef = useRef(0)

  const [lastCorrection, setLastCorrection] = useState<{
    error_text: string
    correct_form: string
    error_type: string | null
  } | null>(null)
  const correctionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastPlayedMessageIdRef = useRef<string | null>(null)

  const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length
  const topicData = getTopicByKey(topic)
  const teacherFirstName = teacher.name.split(' ')[0]

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant') ?? null
  const videoUrl = lastAssistantMessage?.video_url ?? null

  useEffect(() => {
    if (!loading && messages.length > 0) setShowIntro(false)
  }, [loading, messages.length])

  function playAudioUrl(url: string) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    const audio = new Audio(url)
    audioRef.current = audio
    setIsSpeaking(true)
    const cleanup = () => {
      setIsSpeaking(false)
      audioRef.current = null
    }
    audio.onended = cleanup
    audio.onerror = cleanup
    audio.play().catch(cleanup)
  }

  // Play audio the moment the newest assistant message's synthesis finishes —
  // decoupled from the initial text response so the user isn't blocked waiting for TTS.
  useEffect(() => {
    if (!lastAssistantMessage) return
    if (lastAssistantMessage.audio_status !== 'ready' || !lastAssistantMessage.audio_url) return
    if (lastAssistantMessage.id && lastAssistantMessage.id === lastPlayedMessageIdRef.current) return
    lastPlayedMessageIdRef.current = lastAssistantMessage.id
    playAudioUrl(lastAssistantMessage.audio_url)
  }, [lastAssistantMessage])

  const handleTurn = useCallback(
    async (input: File | string) => {
      setTextValue('')
      setShowIntro(false)
      const response = await sendTurn(input)
      if (!response) return
      accumulateResults(response)
    },
    [sendTurn],
  )
```

Then remove the old `playAudio(response: ConversationResponse)` function entirely (it's replaced by `playAudioUrl` + the effect above), and remove the `videoUrl`/`setVideoUrl` `useState` declaration plus every `setVideoUrl(...)` call — `videoUrl` is now the derived constant declared above.

Update the two `<TeacherAvatar videoUrl={videoUrl} ... />` usages — they already reference the `videoUrl` identifier, so no change needed there since it's still in scope as the derived constant.

In the message-list `.map`, add `audioStatus` to the `MessageBubble` props so the newest assistant bubble can show its loading/failure state (Task 11 adds the prop):

```typescript
        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !sending
          return (
            <MessageBubble
              key={i}
              role={m.role}
              text={m.text}
              hadCorrection={m.had_correction}
              pronunciationHint={m.pronunciation_hint}
              replyPt={m.role === 'assistant' ? m.reply_pt : undefined}
              suggestedReplies={isLastAssistant ? m.suggested_replies : undefined}
              onChipClick={isLastAssistant ? handleChipClick : undefined}
              audioStatus={isLastAssistant ? m.audio_status : undefined}
            />
          )
        })}
```

Leave everything else in the file (intro screen, loading skeleton, header, phase indicator, record button, session report, quota banner) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/app/aula/AulaClient.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/aula/AulaClient.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: play teacher audio/video reactively as it becomes ready"
```

---

### Task 11: `MessageBubble.tsx` — per-message audio status indicator

**Files:**
- Modify: `components/aula/MessageBubble.tsx`
- Modify: `__tests__/components/aula/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: new optional `audioStatus?: AudioStatus` prop from Task 10.
- Produces: shows "🔊 Preparando áudio..." while `audioStatus === 'pending'`, "🔇 Áudio indisponível — toque para tentar novamente" (clickable, calls new optional `onRetryAudio`) while `'failed'`, nothing otherwise.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/components/aula/MessageBubble.test.tsx` (append; keep existing tests intact):

```typescript
  it('shows a preparing indicator when audioStatus is pending', () => {
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="pending" />)
    expect(screen.getByText(/preparando áudio/i)).toBeInTheDocument()
  })

  it('shows a retry affordance when audioStatus is failed', () => {
    const onRetry = vi.fn()
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="failed" onRetryAudio={onRetry} />)
    const retryButton = screen.getByText(/áudio indisponível/i)
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows no audio indicator when audioStatus is ready or skipped', () => {
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="ready" />)
    expect(screen.queryByText(/preparando áudio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/áudio indisponível/i)).not.toBeInTheDocument()
  })
```

Confirm the test file already imports `fireEvent` from `@testing-library/react`; add it to the import line if missing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/components/aula/MessageBubble.test.tsx`
Expected: FAIL — `audioStatus` prop not handled

- [ ] **Step 3: Implement**

```typescript
// components/aula/MessageBubble.tsx
'use client'

import { useState } from 'react'
import { Mic, Eye, EyeOff, Volume2, VolumeX } from 'lucide-react'
import type { AudioStatus } from '@/types'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
  pronunciationHint?: string | null
  replyPt?: string | null
  suggestedReplies?: string[] | null
  onChipClick?: (text: string) => void
  audioStatus?: AudioStatus
  onRetryAudio?: () => void
}

export function MessageBubble({ role, text, hadCorrection, pronunciationHint, replyPt, suggestedReplies, onChipClick, audioStatus, onRetryAudio }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [showTranslation, setShowTranslation] = useState(false)

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`relative max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
          isUser
            ? 'bg-brand-interactive text-white rounded-br-sm'
            : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
        }`}
      >
        {text}
        {hadCorrection && (
          <span
            data-testid="correction-indicator"
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-streak"
            title="Correção disponível"
          />
        )}
        {!isUser && pronunciationHint && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-500 dark:text-amber-400" data-testid="pronunciation-hint">
            <Mic size={12} className="mt-0.5 flex-shrink-0" />
            <span>{pronunciationHint}</span>
          </div>
        )}
        {!isUser && audioStatus === 'pending' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-content-light-secondary dark:text-content-dark-secondary animate-pulse" data-testid="audio-pending">
            <Volume2 size={12} className="flex-shrink-0" />
            <span>Preparando áudio...</span>
          </div>
        )}
        {!isUser && audioStatus === 'failed' && (
          <button
            onClick={onRetryAudio}
            className="mt-2 flex items-center gap-1.5 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors"
            data-testid="audio-failed"
          >
            <VolumeX size={12} className="flex-shrink-0" />
            <span>Áudio indisponível — toque para tentar novamente</span>
          </button>
        )}
        {!isUser && replyPt && (
          <div className="mt-2">
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="flex items-center gap-1 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors"
              aria-label={showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
              data-testid="btn-toggle-translation"
            >
              {showTranslation ? <EyeOff size={12} /> : <Eye size={12} />}
              {showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
            </button>
            {showTranslation && (
              <p className="mt-1 text-xs text-content-light-secondary dark:text-content-dark-secondary italic" data-testid="reply-translation">
                {replyPt}
              </p>
            )}
          </div>
        )}
      </div>
      {!isUser && suggestedReplies && suggestedReplies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 max-w-[80%]" data-testid="suggestion-chips">
          {suggestedReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => onChipClick?.(reply)}
              className="px-3 py-1.5 rounded-full text-xs border border-brand-interactive text-brand-interactive hover:bg-brand-interactive hover:text-content-dark transition-colors"
              data-testid={`chip-${i}`}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/components/aula/MessageBubble.test.tsx`
Expected: PASS (all existing + 3 new tests)

- [ ] **Step 5: Commit**

```bash
git add components/aula/MessageBubble.tsx __tests__/components/aula/MessageBubble.test.tsx
git commit -m "feat: show per-message audio preparing/failed indicator"
```

---

### Task 12: `TeacherAvatar.tsx` — video `onError` + stuck-video fallback

**Files:**
- Modify: `components/aula/TeacherAvatar.tsx`
- Create: `__tests__/components/aula/TeacherAvatar.test.tsx`

**Interfaces:**
- Consumes: existing `videoUrl` prop (now backed by the polling flow from Task 9/10 — can legitimately be `null` for a while even when the teacher is "speaking", which is expected: audio starts before video is ready).
- Produces: if the `<video>` element fails to load or doesn't fire `canplay` within 4s of receiving a `videoUrl`, falls back to the static `<Image>` automatically — the user is never stuck looking at a blank/frozen video.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/components/aula/TeacherAvatar.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'

describe('TeacherAvatar', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders the static image when videoUrl is null', () => {
    render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl={null} isSpeaking={false} />)
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('renders the video element when videoUrl is provided', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/video.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
  })

  it('falls back to the static image when the video errors', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/broken.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.error(video) })
    expect(container.querySelector('video')).toBeFalsy()
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('falls back to the static image if the video never becomes playable within the timeout', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/stuck.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4100) })
    expect(container.querySelector('video')).toBeFalsy()
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('does not fall back if the video fires canPlay before the timeout', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/good.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.canPlay(video) })
    act(() => { vi.advanceTimersByTime(4100) })
    expect(container.querySelector('video')).toBeTruthy()
  })

  it('resets the fallback state when a new videoUrl arrives', () => {
    const { container, rerender } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/broken.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.error(video) })
    expect(container.querySelector('video')).toBeFalsy()

    rerender(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/new-good.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- __tests__/components/aula/TeacherAvatar.test.tsx`
Expected: FAIL — no `onError`/timeout fallback exists yet

- [ ] **Step 3: Implement the fallback logic**

Add fallback state to `components/aula/TeacherAvatar.tsx`. Insert after the existing prop destructuring (`export function TeacherAvatar({ ... }) {`):

```typescript
  const [videoFailed, setVideoFailed] = useState(false)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setVideoFailed(false)
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    if (videoUrl) {
      fallbackTimerRef.current = setTimeout(() => setVideoFailed(true), 4000)
    }
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [videoUrl])

  function handleVideoReady() {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
  }

  function handleVideoError() {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    setVideoFailed(true)
  }

  const showVideo = !!videoUrl && !videoFailed
```

Add the required imports at the top (`useEffect`, `useRef`, `useState` from `react`):

```typescript
import { useEffect, useRef, useState } from 'react'
```

Replace the avatar image/video block:

```typescript
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
            />
          )}
```

with:

```typescript
          {showVideo ? (
            <video
              src={videoUrl ?? undefined}
              autoPlay
              muted
              playsInline
              onCanPlay={handleVideoReady}
              onError={handleVideoError}
              className="w-full h-full object-cover"
            />
          ) : (
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
            />
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- __tests__/components/aula/TeacherAvatar.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions across the whole plan**

Run: `npm run test:run`
Expected: PASS — every test in the repo, including all tasks in this plan

- [ ] **Step 6: Commit**

```bash
git add components/aula/TeacherAvatar.tsx __tests__/components/aula/TeacherAvatar.test.tsx
git commit -m "fix: fall back to static avatar image on video error or stuck load"
```

---

## Self-Review

**Spec coverage against the audit findings this plan targets:**
- Áudio demora para começar → Task 6 (fast text-only response) + Task 9/10 (audio plays as soon as ready, not gated on avatar). ✅
- Mensagens sem áudio → Task 3 (retry) + Task 7 (dedicated endpoint, marks `failed` explicitly instead of silently null) + Task 11 (visible retry affordance). ✅
- Tradução some → Task 1 (persist `reply_pt`/`suggested_replies` columns) + Task 6 (writes them) + Task 9 (reads them back on reload). ✅
- Avatar não carrega → Task 4 (no more 15s blocking poll) + Task 8 (async create/poll) + Task 12 (onError + stuck-timeout fallback to static image). ✅
- Sensação de travamento / feedback insuficiente → Task 11 ("Preparando áudio...") + text renders immediately in Task 6/10 instead of waiting for the whole turn. ✅
- Logs para identificar gargalos → Task 2 + instrumentation calls in Tasks 6–8. ✅
- Paralelismo explícito pedido pelo usuário (texto/áudio/avatar simultâneos) → the whole Task 6→7/8→9/10 chain. ✅

**Placeholder scan:** every step has literal code, no "TODO"/"similar to Task N". Confirmed.

**Type consistency:** `AudioStatus`/`VideoStatus` (Task 5) used identically in Tasks 6–12; `message_id` flows from Task 6's response → Task 9's `sendTurn` → Task 7/8 request bodies; `SessionMessage.id` (Task 9) matches `MessageBubble`/`AulaClient` usage (Tasks 10–11). Confirmed consistent.

**Out of scope for this plan (tracked separately, per the confirmed area-by-area sequencing):** Whisper/audio-capture accuracy (constraints, prompt biasing, confidence handling) and mobile-specific animation/UX polish (staged loading copy beyond audio status, `next.config.mjs` tuning, client-side retry-with-backoff on `sendTurn` network failures) will be written up as their own plans once this one ships, since they're independent subsystems.
