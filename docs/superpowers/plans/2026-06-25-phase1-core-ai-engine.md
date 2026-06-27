# English Fluent — Plan 3: Core AI Engine (/aula)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/aula` conversation page — student speaks, Whisper transcribes, Claude Sonnet 4.6 responds as the assigned teacher with error correction, OpenAI TTS voices the reply, D-ID optionally animates the avatar, and every turn is persisted in `sessions` + `messages`.

**Architecture:** Two API routes handle the lifecycle: `POST /api/session` creates a session row and returns teacher info; `POST /api/conversation` runs the full AI pipeline. Three hooks (`useAudioRecorder`, `useSession`, wired in `AulaClient`) drive the client. A minimal `/dashboard` page gives onboarding a landing target. The `/aula/page.tsx` server component loads user + teacher; `AulaClient.tsx` owns all interactive state.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Framer Motion, @supabase/ssr, OpenAI SDK (Whisper + TTS), Anthropic SDK (Claude Sonnet 4.6), D-ID REST API, Lucide React

## Global Constraints

- App Router only — no Pages Router
- All student-facing UI copy in Portuguese; teacher speech in English
- Color palette, border radius, shadows, fonts: same as Plans 1–2 (see `tailwind.config.ts`)
- Icons: Lucide React only; animations: Framer Motion ≤ 300ms
- Env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DID_API_KEY` (optional), `EF_PUBLIC_ORIGIN` (e.g. `http://localhost:3000` — used to build absolute avatar URLs for D-ID)
- Model for conversation: `claude-sonnet-4-6`
- TTS audio returned as base64 `data:audio/mp3;base64,...` — no Supabase Storage bucket needed in Plan 3
- D-ID is optional: if `DID_API_KEY` is not set, `video_url` is always `null`
- `messages.audio_url` stored as `null` in Plan 3 (replay storage is Plan 4 scope)
- Working directory: `C:\Users\WINDOWS10\Downloads\fluente`

---

## File Map

| File | Responsibility |
|------|----------------|
| `types/index.ts` | Add `slug` field to `Teacher` interface |
| `app/dashboard/page.tsx` | Minimal placeholder: loads user + teacher, shows "Começar aula" CTA |
| `app/api/session/route.ts` | POST: create session; GET: latest active session + last 20 messages |
| `app/api/session/[id]/end/route.ts` | PATCH: set `ended_at` + `duration_seconds` |
| `lib/tts.ts` | `synthesizeTts(text, voice): Promise<string>` → base64 data URI |
| `lib/did.ts` | `createTalk(text, voiceId, sourceUrl): Promise<string \| null>` — polls D-ID |
| `app/api/conversation/route.ts` | POST FormData pipeline: Whisper→Claude→TTS→D-ID→persist |
| `hooks/useAudioRecorder.ts` | MediaRecorder hook; calls `onComplete(blob)` when done |
| `components/aula/RecordButton.tsx` | Press-and-hold mic button |
| `components/aula/MessageBubble.tsx` | Chat bubble for user/assistant turns |
| `components/aula/TeacherAvatar.tsx` | D-ID video or static image with pulse |
| `components/aula/PanicButton.tsx` | Text-input overlay for typing instead of speaking |
| `hooks/useSession.ts` | Load/create session; `sendTurn(File\|string)`; `endSession()` |
| `app/aula/AulaClient.tsx` | Client component wiring all hooks + components |
| `app/aula/page.tsx` | Server component: loads user+teacher, guards onboarding |
| `__tests__/app/api/session.test.ts` | Session API tests |
| `__tests__/app/api/conversation.test.ts` | Conversation pipeline tests |
| `__tests__/hooks/useAudioRecorder.test.tsx` | Recorder hook tests |
| `__tests__/hooks/useSession.test.tsx` | Session hook tests |
| `__tests__/components/aula/RecordButton.test.tsx` | RecordButton tests |
| `__tests__/components/aula/MessageBubble.test.tsx` | MessageBubble tests |
| `__tests__/app/aula/AulaClient.test.tsx` | AulaClient smoke tests |

---

### Task 1: Types Update + Dashboard Placeholder

**Files:**
- Modify: `types/index.ts`
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Produces: `Teacher.slug: string` — required by D-ID lib in later tasks

- [ ] **Step 1: Add `slug` to the `Teacher` interface in `types/index.ts`**

Open `types/index.ts` and update the `Teacher` interface — add `slug: string` after `id`:

```typescript
export interface Teacher {
  id: string
  slug: string         // ← add this line
  name: string
  system_prompt: string
  tts_voice: string
  tts_provider: TtsProvider
  avatar_image_url: string
  levels: CefrLevel[]
  correction_style: string
  memory_prefix: string
}
```

- [ ] **Step 2: Create `app/dashboard/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Teacher, User } from '@/types'

export default async function DashboardPage() {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!userData?.teacher_id) redirect('/cadastro/boas-vindas')

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', userData.teacher_id)
    .single()

  const u = userData as User
  const t = teacher as Teacher | null

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4">
        <h1 className="text-lg font-bold text-content-light dark:text-content-dark">
          English Fluent
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-center">
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm mb-1">
            Olá, {u.name ?? 'aluno'}!
          </p>
          <p className="text-2xl font-bold text-content-light dark:text-content-dark">
            Pronto para praticar?
          </p>
        </div>

        {t && (
          <div className="w-full max-w-sm p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              Seu professor
            </p>
            <p className="font-bold text-content-light dark:text-content-dark">{t.name}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
              Nível {u.cefr_level}
            </p>
          </div>
        )}

        <Link
          href="/aula"
          className="w-full max-w-sm py-4 rounded-xl bg-brand-cta text-white font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Começar aula
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```powershell
git add types/index.ts app/dashboard/page.tsx
git commit -m "feat: add Teacher.slug type + minimal dashboard placeholder"
```

---

### Task 2: Session API

**Files:**
- Create: `app/api/session/route.ts`
- Create: `app/api/session/[id]/end/route.ts`
- Create: `__tests__/app/api/session.test.ts`

**Interfaces:**
- `POST /api/session` body: `{ teacher_id: string, mode?: SessionMode }` → `{ session_id: string, teacher: Teacher }`
- `GET /api/session` → `{ session: (Session & { teacher: Teacher, messages: Message[] }) | null }`
- `PATCH /api/session/[id]/end` body: `{ duration_seconds: number }` → `{ ok: true }`

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/api/session.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockTeacher = { id: 'teacher-1', slug: 'mrs-carol', name: 'Mrs. Carol', system_prompt: 'You are...', tts_voice: 'alloy', tts_provider: 'openai', avatar_image_url: '/avatars/mrs-carol.png', levels: ['A1', 'A2'], correction_style: 'gentle', memory_prefix: 'Mrs. Carol remembers:' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', mode: 'daily', started_at: '2026-01-01T00:00:00Z', ended_at: null, duration_seconds: null }

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: mockTeacher, error: null }),
          is: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...mockSession, teacher: mockTeacher },
                  error: null,
                }),
              })),
            })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('POST /api/session', () => {
  beforeEach(() => vi.resetModules())

  it('creates a session and returns session_id + teacher', async () => {
    const { POST } = await import('@/app/api/session/route')
    const req = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.session_id).toBe('session-1')
    expect(body.teacher.id).toBe('teacher-1')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { POST } = await import('@/app/api/session/route')
    const req = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/session', () => {
  beforeEach(() => vi.resetModules())

  it('returns the latest active session with teacher', async () => {
    const { GET } = await import('@/app/api/session/route')
    const res = await GET()
    const body = await res.json()
    expect(body.session.id).toBe('session-1')
    expect(body.session.teacher.slug).toBe('mrs-carol')
  })
})

describe('PATCH /api/session/[id]/end', () => {
  beforeEach(() => vi.resetModules())

  it('sets ended_at and duration_seconds', async () => {
    const { PATCH } = await import('@/app/api/session/[id]/end/route')
    const req = new Request('http://localhost/api/session/session-1/end', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: 300 }),
    })
    const res = await PATCH(req, { params: { id: 'session-1' } })
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/api/session.test.ts
```
Expected: FAIL — "Cannot find module '@/app/api/session/route'".

- [ ] **Step 3: Create `app/api/session/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { SessionMode } from '@/types'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) return NextResponse.json({ session: null })

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(20)

  return NextResponse.json({ session: { ...session, messages: messages ?? [] } })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { teacher_id: string; mode?: SessionMode }
  if (!body.teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({ user_id: user.id, teacher_id: body.teacher_id, mode: body.mode ?? 'daily' })
    .select('id')
    .single()

  if (error || !newSession) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', body.teacher_id)
    .single()

  return NextResponse.json({ session_id: newSession.id, teacher })
}
```

- [ ] **Step 4: Create `app/api/session/[id]/end/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { duration_seconds: number }

  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds: body.duration_seconds })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/api/session.test.ts
```
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/api/session/ __tests__/app/api/session.test.ts
git commit -m "feat: session API — create, load active session, end session"
```

---

### Task 3: TTS Library

**Files:**
- Create: `lib/tts.ts`
- Create: `__tests__/lib/tts.test.ts`

**Interfaces:**
- Produces: `synthesizeTts(text: string, voice: string): Promise<string>` → base64 `data:audio/mp3;base64,...`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/tts.test.ts`:

```typescript
import { vi, describe, it, expect } from 'vitest'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      speech: {
        create: vi.fn().mockResolvedValue({
          arrayBuffer: async () => Buffer.from('fake-audio').buffer,
        }),
      },
    },
  })),
}))

import { synthesizeTts } from '@/lib/tts'

describe('synthesizeTts', () => {
  it('returns a base64 data URI', async () => {
    const result = await synthesizeTts('Hello world', 'alloy')
    expect(result).toMatch(/^data:audio\/mp3;base64,/)
  })

  it('encodes the audio buffer correctly', async () => {
    const result = await synthesizeTts('Test', 'nova')
    const base64Part = result.replace('data:audio/mp3;base64,', '')
    const decoded = Buffer.from(base64Part, 'base64').toString()
    expect(decoded).toBe('fake-audio')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/lib/tts.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/tts'".

- [ ] **Step 3: Create `lib/tts.ts`**

```typescript
import OpenAI from 'openai'

export async function synthesizeTts(text: string, voice: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'mp3',
  })

  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:audio/mp3;base64,${buffer.toString('base64')}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/lib/tts.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/tts.ts __tests__/lib/tts.test.ts
git commit -m "feat: TTS lib — OpenAI speech synthesis returning base64 data URI"
```

---

### Task 4: D-ID Library

**Files:**
- Create: `lib/did.ts`
- Create: `__tests__/lib/did.test.ts`

**Interfaces:**
- Produces: `createTalk(text: string, didVoiceId: string, sourceUrl: string): Promise<string | null>` → D-ID result URL, or `null` if `DID_API_KEY` not set or request fails

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/did.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('createTalk', () => {
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
    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns the result_url when D-ID responds with done status', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tlk_123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'done', result_url: 'https://d-id.com/video.mp4' }),
      } as Response)

    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBe('https://d-id.com/video.mp4')
  })

  it('returns null when D-ID create request fails', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/lib/did.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/did'".

- [ ] **Step 3: Create `lib/did.ts`**

```typescript
const DID_API = 'https://api.d-id.com'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

export const DID_VOICE_IDS: Record<string, string> = {
  'mrs-carol': 'en-US-JennyNeural',
  'mr-jake': 'en-US-GuyNeural',
  'dr-reynolds': 'en-GB-RyanNeural',
  sofia: 'en-US-SaraNeural',
}

export async function createTalk(
  text: string,
  didVoiceId: string,
  sourceUrl: string
): Promise<string | null> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return null

  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`

  try {
    const createRes = await fetch(`${DID_API}/talks`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: sourceUrl,
        script: {
          type: 'text',
          input: text,
          provider: { type: 'microsoft', voice_id: didVoiceId },
        },
      }),
    })
    if (!createRes.ok) return null

    const { id } = (await createRes.json()) as { id: string }
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const pollRes = await fetch(`${DID_API}/talks/${id}`, {
        headers: { Authorization: authHeader },
      })
      if (!pollRes.ok) return null
      const talk = (await pollRes.json()) as { status: string; result_url?: string }
      if (talk.status === 'done' && talk.result_url) return talk.result_url
      if (talk.status === 'error') return null
    }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/lib/did.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/did.ts __tests__/lib/did.test.ts
git commit -m "feat: D-ID lib — createTalk with polling and graceful null fallback"
```

---

### Task 5: Conversation API

**Files:**
- Create: `app/api/conversation/route.ts`
- Create: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- `POST /api/conversation` — FormData fields: `session_id: string`, `audio?: Blob`, `panic_text?: string`
- Returns: `ConversationResponse { text, audio_url, video_url, had_correction, error_report }`

Claude system prompt format (verbatim — must match exactly what the route sends):
```
${teacher.system_prompt}

Student profile:
- Name: ${userName}
- CEFR level: ${cefrLevel}

Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
```

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/api/conversation.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockUserData = { id: 'user-1', name: 'Ana', cefr_level: 'B1', teacher_id: 'teacher-1' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', teacher: { id: 'teacher-1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are Mr. Jake.', tts_voice: 'echo', avatar_image_url: '/avatars/mr-jake.png' } }

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'sessions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })),
      }
      if (table === 'users') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
      }
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
      if (table === 'usage_log') return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: { create: vi.fn().mockResolvedValue({ text: 'Hello teacher.' }) },
      speech: { create: vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from('mp3').buffer }) },
    },
  })),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}))

vi.mock('@/lib/did', () => ({
  createTalk: vi.fn().mockResolvedValue(null),
  DID_VOICE_IDS: { 'mr-jake': 'en-US-GuyNeural' },
}))

function makeFormRequest(fields: Record<string, string | Blob>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/conversation', { method: 'POST', body: form })
}

import { POST } from '@/app/api/conversation/route'

describe('POST /api/conversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text, audio_url, and had_correction=false on clean turn', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
    expect(body.audio_url).toMatch(/^data:audio\/mp3;base64,/)
    expect(body.had_correction).toBe(false)
  })

  it('handles panic_text instead of audio', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'I go to school yesterday.' }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
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
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/api/conversation.test.ts
```
Expected: FAIL — "Cannot find module '@/app/api/conversation/route'".

- [ ] **Step 3: Create `app/api/conversation/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { synthesizeTts } from '@/lib/tts'
import { createTalk, DID_VOICE_IDS } from '@/lib/did'
import type { ConversationResponse, ErrorReport, ErrorType } from '@/types'

const VALID_ERROR_TYPES = new Set<string>(['verb_tense', 'vocabulary', 'preposition', 'pronunciation', 'other'])

interface ClaudeOutput {
  reply: string
  correction: {
    error_detected: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const sessionId = formData.get('session_id') as string | null
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('panic_text') as string | null

  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  if (!audio && !panicText) return NextResponse.json({ error: 'audio or panic_text required' }, { status: 400 })

  // Load session with teacher
  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Load user profile
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level')
    .eq('id', user.id)
    .single()

  // Transcribe audio or use panic text
  let transcript: string
  if (audio) {
    const file = new File([await audio.arrayBuffer()], 'recording.webm', { type: audio.type || 'audio/webm' })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const result = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'en' })
    transcript = result.text.trim()
  } else {
    transcript = (panicText as string).trim()
  }

  // Load conversation history (last 20 messages)
  const { data: prevMessages } = await supabase
    .from('messages')
    .select('role, text')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(20)

  const teacher = session.teacher as any
  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${userData?.name ?? 'Student'}
- CEFR level: ${userData?.cefr_level ?? 'B1'}

Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.`

  // Call Claude Sonnet
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const claudeRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      ...((prevMessages ?? []).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.text }))),
      { role: 'user', content: transcript },
    ],
  })

  const rawText = claudeRes.content[0]?.type === 'text' ? (claudeRes.content[0] as any).text : '{}'
  let parsed: ClaudeOutput
  try {
    parsed = JSON.parse(rawText) as ClaudeOutput
  } catch {
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null } }
  }

  const replyText = parsed.reply
  const correctionRaw = parsed.correction

  const errorReport: ErrorReport = {
    error_detected: correctionRaw.error_detected ?? false,
    error_text: correctionRaw.error_text ?? undefined,
    correct_form: correctionRaw.correct_form ?? undefined,
    error_type: VALID_ERROR_TYPES.has(correctionRaw.error_type ?? '') ? (correctionRaw.error_type as ErrorType) : undefined,
  }

  // TTS
  const audioUrl = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')

  // D-ID (optional)
  const origin = process.env.EF_PUBLIC_ORIGIN ?? ''
  const sourceUrl = origin ? `${origin}${teacher.avatar_image_url}` : ''
  const videoUrl = sourceUrl
    ? await createTalk(replyText, DID_VOICE_IDS[teacher.slug] ?? 'en-US-JennyNeural', sourceUrl)
    : null

  // Persist messages
  await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', text: transcript, audio_url: null, had_correction: false },
    { session_id: sessionId, role: 'assistant', text: replyText, audio_url: null, had_correction: errorReport.error_detected },
  ])

  // Update usage log
  const usage = claudeRes.usage
  await supabase.from('usage_log').upsert(
    {
      user_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      whisper_minutes: audio ? 0.5 : 0,
      tts_chars: replyText.length,
      claude_tokens: usage.input_tokens + usage.output_tokens,
      did_credits: videoUrl ? 1 : 0,
    },
    { onConflict: 'user_id,date', ignoreDuplicates: false }
  )

  const response: ConversationResponse = {
    text: replyText,
    audio_url: audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
  }

  return NextResponse.json(response)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/api/conversation.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 5: TypeScript check**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```powershell
git add app/api/conversation/ lib/tts.ts lib/did.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: conversation API — Whisper→Claude Sonnet→TTS→D-ID pipeline with error correction"
```

---

### Task 6: useAudioRecorder Hook

**Files:**
- Create: `hooks/useAudioRecorder.ts`
- Create: `__tests__/hooks/useAudioRecorder.test.tsx`

**Interfaces:**
- Produces: `useAudioRecorder({ onComplete: (blob: Blob) => void }): { isRecording, startRecording, stopRecording, error }`
- `startRecording(): Promise<void>` — requests mic, starts MediaRecorder
- `stopRecording(): void` — stops recording; fires `onComplete(blob)` asynchronously via `onstop`
- `error: string | null` — set if mic permission denied

- [ ] **Step 1: Write failing tests**

Create `__tests__/hooks/useAudioRecorder.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockOnComplete = vi.fn()

const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as ((e: any) => void) | null,
  onstop: null as (() => void) | null,
  mimeType: 'audio/webm',
  state: 'inactive',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => mockMediaRecorder))
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  })
})

import { useAudioRecorder } from '@/hooks/useAudioRecorder'

describe('useAudioRecorder', () => {
  it('starts recording when startRecording is called', async () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    expect(result.current.isRecording).toBe(true)
    expect(mockMediaRecorder.start).toHaveBeenCalled()
  })

  it('is not recording initially', () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    expect(result.current.isRecording).toBe(false)
  })

  it('sets error when getUserMedia fails', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
    })
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    expect(result.current.error).toBeTruthy()
    expect(result.current.isRecording).toBe(false)
  })

  it('calls onComplete when stopRecording is invoked', async () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    act(() => {
      mockMediaRecorder.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) })
    })
    act(() => {
      result.current.stopRecording()
      mockMediaRecorder.onstop?.()
    })
    expect(mockOnComplete).toHaveBeenCalledWith(expect.any(Blob))
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/hooks/useAudioRecorder.test.tsx
```
Expected: FAIL — "Cannot find module '@/hooks/useAudioRecorder'".

- [ ] **Step 3: Create `hooks/useAudioRecorder.ts`**

```typescript
'use client'

import { useRef, useState } from 'react'

interface UseAudioRecorderOptions {
  onComplete: (blob: Blob) => void
}

export function useAudioRecorder({ onComplete }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        onComplete(blob)
        setIsRecording(false)
      }

      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  return { isRecording, startRecording, stopRecording, error }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/hooks/useAudioRecorder.test.tsx
```
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add hooks/useAudioRecorder.ts __tests__/hooks/useAudioRecorder.test.tsx
git commit -m "feat: useAudioRecorder hook — MediaRecorder with onComplete callback"
```

---

### Task 7: Aula UI Components

**Files:**
- Create: `components/aula/RecordButton.tsx`
- Create: `components/aula/MessageBubble.tsx`
- Create: `components/aula/TeacherAvatar.tsx`
- Create: `components/aula/PanicButton.tsx`
- Create: `__tests__/components/aula/RecordButton.test.tsx`
- Create: `__tests__/components/aula/MessageBubble.test.tsx`

**Interfaces:**
- `<RecordButton isRecording={boolean} onPressStart={() => void} onPressEnd={() => void} disabled={boolean} />`
- `<MessageBubble role={'user'|'assistant'} text={string} hadCorrection={boolean} />`
- `<TeacherAvatar name={string} imageUrl={string} videoUrl={string|null} isSpeaking={boolean} />`
- `<PanicButton onSubmit={(text: string) => void} disabled={boolean} />`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/aula/RecordButton.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { RecordButton } from '@/components/aula/RecordButton'

describe('RecordButton', () => {
  it('shows "Pressionar para falar" when not recording', () => {
    render(<RecordButton isRecording={false} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={false} />)
    expect(screen.getByText(/pressionar para falar/i)).toBeInTheDocument()
  })

  it('shows "Gravando..." when recording', () => {
    render(<RecordButton isRecording={true} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={false} />)
    expect(screen.getByText(/gravando/i)).toBeInTheDocument()
  })

  it('calls onPressStart on mouse down', () => {
    const onStart = vi.fn()
    render(<RecordButton isRecording={false} onPressStart={onStart} onPressEnd={vi.fn()} disabled={false} />)
    fireEvent.mouseDown(screen.getByRole('button'))
    expect(onStart).toHaveBeenCalled()
  })

  it('calls onPressEnd on mouse up', () => {
    const onEnd = vi.fn()
    render(<RecordButton isRecording={true} onPressStart={vi.fn()} onPressEnd={onEnd} disabled={false} />)
    fireEvent.mouseUp(screen.getByRole('button'))
    expect(onEnd).toHaveBeenCalled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<RecordButton isRecording={false} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

Create `__tests__/components/aula/MessageBubble.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from '@/components/aula/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message text', () => {
    render(<MessageBubble role="user" text="Hello teacher!" hadCorrection={false} />)
    expect(screen.getByText('Hello teacher!')).toBeInTheDocument()
  })

  it('renders assistant message text', () => {
    render(<MessageBubble role="assistant" text="Great job!" hadCorrection={false} />)
    expect(screen.getByText('Great job!')).toBeInTheDocument()
  })

  it('shows correction indicator when hadCorrection is true', () => {
    render(<MessageBubble role="assistant" text="Good." hadCorrection={true} />)
    expect(screen.getByTestId('correction-indicator')).toBeInTheDocument()
  })

  it('does not show correction indicator when hadCorrection is false', () => {
    render(<MessageBubble role="user" text="Hi!" hadCorrection={false} />)
    expect(screen.queryByTestId('correction-indicator')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/components/aula/RecordButton.test.tsx __tests__/components/aula/MessageBubble.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create `components/aula/RecordButton.tsx`**

```typescript
'use client'

import { Mic, MicOff } from 'lucide-react'
import { motion } from 'framer-motion'

interface RecordButtonProps {
  isRecording: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled: boolean
}

export function RecordButton({ isRecording, onPressStart, onPressEnd, disabled }: RecordButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onTouchStart={onPressStart}
        onTouchEnd={onPressEnd}
        disabled={disabled}
        animate={isRecording ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={isRecording ? { repeat: Infinity, duration: 1 } : {}}
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors select-none ${
          isRecording
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
            : 'bg-brand-interactive text-white hover:opacity-90'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
      >
        {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
      </motion.button>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
        {isRecording ? 'Gravando...' : 'Pressionar para falar'}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/aula/MessageBubble.tsx`**

```typescript
interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
}

export function MessageBubble({ role, text, hadCorrection }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/aula/TeacherAvatar.tsx`**

```typescript
'use client'

import { motion } from 'framer-motion'

interface TeacherAvatarProps {
  name: string
  imageUrl: string
  videoUrl: string | null
  isSpeaking: boolean
}

export function TeacherAvatar({ name, imageUrl, videoUrl, isSpeaking }: TeacherAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-brand-cta opacity-60"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          />
        )}
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            muted
            playsInline
            className="w-28 h-28 rounded-full object-cover"
          />
        ) : (
          <img
            src={imageUrl}
            alt={name}
            className="w-28 h-28 rounded-full object-cover"
          />
        )}
      </div>
      <p className="text-sm font-medium text-content-light dark:text-content-dark">{name}</p>
    </div>
  )
}
```

- [ ] **Step 6: Create `components/aula/PanicButton.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Type } from 'lucide-react'

interface PanicButtonProps {
  onSubmit: (text: string) => void
  disabled: boolean
}

export function PanicButton({ onSubmit, disabled }: PanicButtonProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
    setOpen(false)
  }

  return (
    <div>
      {open ? (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite sua resposta..."
            disabled={disabled}
            autoFocus
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="px-4 py-2 rounded-xl bg-brand-cta text-white text-sm font-semibold disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors disabled:opacity-40"
          aria-label="Digitar resposta"
        >
          <Type size={14} /> Prefiro digitar
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/components/aula/RecordButton.test.tsx __tests__/components/aula/MessageBubble.test.tsx
```
Expected: 9 tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add components/aula/ __tests__/components/aula/
git commit -m "feat: aula UI components — RecordButton, MessageBubble, TeacherAvatar, PanicButton"
```

---

### Task 8: useSession Hook

**Files:**
- Create: `hooks/useSession.ts`
- Create: `__tests__/hooks/useSession.test.tsx`

**Interfaces:**
- `useSession(teacherId: string): { sessionId, messages, loading, sending, sendTurn, endSession }`
- `sendTurn(input: File | string): Promise<ConversationResponse | null>`
- `endSession(): Promise<void>` — PATCHes the end route and records duration
- `messages: { role, text, audio_url, had_correction }[]` — local state, appended on each turn

- [ ] **Step 1: Write failing tests**

Create `__tests__/hooks/useSession.test.tsx`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockConvResponse = {
  text: 'Hello!',
  audio_url: 'data:audio/mp3;base64,abc',
  video_url: null,
  had_correction: false,
  error_report: { error_detected: false },
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
      { session_id: 'new-session', teacher: { id: 't1', name: 'Mr. Jake' } }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('new-session')
  })

  it('loads an existing session with messages', async () => {
    mockFetchSequence({
      session: {
        id: 'existing-session',
        teacher: { id: 't1' },
        messages: [{ role: 'user', text: 'Hi', audio_url: null, had_correction: false }],
      },
    })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('existing-session')
    expect(result.current.messages).toHaveLength(1)
  })

  it('sendTurn appends user + assistant messages', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'sess-1', teacher: { id: 't1' } },
      mockConvResponse
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendTurn('Hello') })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[1].role).toBe('assistant')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/hooks/useSession.test.tsx
```
Expected: FAIL — "Cannot find module '@/hooks/useSession'".

- [ ] **Step 3: Create `hooks/useSession.ts`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConversationResponse } from '@/types'

interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  had_correction: boolean
}

interface UseSessionReturn {
  sessionId: string | null
  messages: SessionMessage[]
  loading: boolean
  sending: boolean
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}

export function useSession(teacherId: string): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    ;(async () => {
      const getRes = await fetch('/api/session')
      const { session } = await getRes.json()

      if (session) {
        setSessionId(session.id)
        setMessages(
          (session.messages ?? []).map((m: any) => ({
            role: m.role,
            text: m.text,
            audio_url: m.audio_url,
            had_correction: m.had_correction,
          }))
        )
      } else {
        const postRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        })
        const { session_id } = await postRes.json()
        setSessionId(session_id)
      }

      setLoading(false)
    })()
  }, [teacherId])

  async function sendTurn(input: File | string): Promise<ConversationResponse | null> {
    if (!sessionId) return null
    setSending(true)

    const userText = typeof input === 'string' ? input : 'Audio message'

    setMessages((prev) => [...prev, { role: 'user', text: userText, audio_url: null, had_correction: false }])

    try {
      const form = new FormData()
      form.append('session_id', sessionId)
      if (typeof input === 'string') {
        form.append('panic_text', input)
      } else {
        form.append('audio', input, 'recording.webm')
      }

      const res = await fetch('/api/conversation', { method: 'POST', body: form })
      if (!res.ok) return null
      const data = (await res.json()) as ConversationResponse

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.text, audio_url: data.audio_url, had_correction: data.had_correction },
      ])

      return data
    } finally {
      setSending(false)
    }
  }

  async function endSession() {
    if (!sessionId) return
    const duration = Math.round((Date.now() - startedAt.current) / 1000)
    await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: duration }),
    })
  }

  return { sessionId, messages, loading, sending, sendTurn, endSession }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/hooks/useSession.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add hooks/useSession.ts __tests__/hooks/useSession.test.tsx
git commit -m "feat: useSession hook — load/create session, sendTurn pipeline, endSession"
```

---

### Task 9: AulaClient + /aula Page

**Files:**
- Create: `app/aula/AulaClient.tsx`
- Create: `app/aula/page.tsx`
- Create: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- `app/aula/page.tsx` — server component; loads `user` + `teacher` from DB; guards onboarding; passes both to `<AulaClient>`
- `<AulaClient teacher={Teacher} user={User} />` — orchestrates all hooks and components

AulaClient flow:
1. `useSession(teacher.id)` — load/create session
2. `useAudioRecorder({ onComplete: blob => sendTurn(blob) })` — mic input
3. When `sendTurn` resolves: play `response.audio_url` via `new Audio(url).play()`
4. Show `TeacherAvatar` with `isSpeaking` while audio is playing
5. Show scrollable message list with `MessageBubble` for each message
6. `PanicButton` calls `sendTurn(text)` with text string

- [ ] **Step 1: Write failing tests**

Create `__tests__/app/aula/AulaClient.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/hooks/useSession', () => ({
  useSession: vi.fn(() => ({
    sessionId: 'sess-1',
    messages: [
      { role: 'user', text: 'Hello!', audio_url: null, had_correction: false },
      { role: 'assistant', text: 'Hi there!', audio_url: null, had_correction: false },
    ],
    loading: false,
    sending: false,
    sendTurn: vi.fn().mockResolvedValue(null),
    endSession: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }))

import { AulaClient } from '@/app/aula/AulaClient'

const mockTeacher = { id: 't1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are...', tts_voice: 'echo', tts_provider: 'openai' as const, avatar_image_url: '/avatars/mr-jake.png', levels: ['B1' as const, 'B2' as const], correction_style: 'conversational', memory_prefix: 'Mr. Jake notes:' }
const mockUser = { id: 'u1', email: 'a@b.com', name: 'Ana', created_at: '', plan_id: null, cefr_level: 'B1' as const, teacher_id: 't1', personal_context: null, streak_days: 0, last_session_at: null, preferred_session_time: null, theme: 'dark' as const }

describe('AulaClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders teacher name', async () => {
    render(<AulaClient teacher={mockTeacher} user={mockUser} />)
    await waitFor(() => expect(screen.getByText('Mr. Jake')).toBeInTheDocument())
  })

  it('renders existing messages', async () => {
    render(<AulaClient teacher={mockTeacher} user={mockUser} />)
    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument()
      expect(screen.getByText('Hi there!')).toBeInTheDocument()
    })
  })

  it('renders a record button', async () => {
    render(<AulaClient teacher={mockTeacher} user={mockUser} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /iniciar gravação/i })).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npm run test:run -- __tests__/app/aula/AulaClient.test.tsx
```
Expected: FAIL — "Cannot find module '@/app/aula/AulaClient'".

- [ ] **Step 3: Create `app/aula/AulaClient.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RecordButton } from '@/components/aula/RecordButton'
import { MessageBubble } from '@/components/aula/MessageBubble'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'
import { PanicButton } from '@/components/aula/PanicButton'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSession } from '@/hooks/useSession'
import type { Teacher, User, ConversationResponse } from '@/types'

interface AulaClientProps {
  teacher: Teacher
  user: User
}

export function AulaClient({ teacher, user }: AulaClientProps) {
  const { sessionId, messages, loading, sending, sendTurn, endSession } = useSession(teacher.id)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  async function handleTurn(input: File | string) {
    const response = await sendTurn(input)
    if (!response) return
    playAudio(response)
  }

  function playAudio(response: ConversationResponse) {
    setVideoUrl(response.video_url)
    setIsSpeaking(true)
    const audio = new Audio(response.audio_url)
    audio.onended = () => setIsSpeaking(false)
    audio.play().catch(() => setIsSpeaking(false))
  }

  const { isRecording, startRecording, stopRecording, error: micError } = useAudioRecorder({
    onComplete: (blob) => handleTurn(new File([blob], 'recording.webm', { type: blob.type })),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleEnd() {
    await endSession()
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col max-h-screen overflow-hidden">
      <header className="flex items-center justify-between p-4 shrink-0">
        <Link
          href="/dashboard"
          onClick={handleEnd}
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors"
        >
          <X size={16} /> Encerrar aula
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-col items-center py-4 shrink-0">
        <TeacherAvatar
          name={teacher.name}
          imageUrl={teacher.avatar_image_url}
          videoUrl={videoUrl}
          isSpeaking={isSpeaking}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {loading && (
          <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Conectando...
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} hadCorrection={m.had_correction} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary text-sm animate-pulse">
              {teacher.name} está respondendo...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 px-4 py-6 flex flex-col items-center gap-4">
        {micError && (
          <p role="alert" className="text-xs text-red-500 text-center">{micError}</p>
        )}
        <RecordButton
          isRecording={isRecording}
          onPressStart={startRecording}
          onPressEnd={stopRecording}
          disabled={sending || loading}
        />
        <PanicButton onSubmit={(text) => handleTurn(text)} disabled={sending || loading || isRecording} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Create `app/aula/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { AulaClient } from './AulaClient'
import type { Teacher, User } from '@/types'

export default async function AulaPage() {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!userData?.teacher_id) redirect('/cadastro/boas-vindas')

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', userData.teacher_id)
    .single()

  if (!teacher) redirect('/dashboard')

  return <AulaClient teacher={teacher as Teacher} user={userData as User} />
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npm run test:run -- __tests__/app/aula/AulaClient.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 6: Run full test suite**

```powershell
npm run test:run
```
Expected: All tests PASS, 0 failures.

- [ ] **Step 7: TypeScript check**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```powershell
git add app/aula/ __tests__/app/aula/
git commit -m "feat: /aula page — AulaClient wires recorder, session, avatar, messages into lesson UI"
```

---

## Spec Coverage Check

| Briefing section | Covered in this plan |
|-----------------|----------------------|
| §7 `/aula` voice conversation loop | ✅ AulaClient + RecordButton + useAudioRecorder |
| §7 STT — OpenAI Whisper | ✅ `POST /api/conversation` transcribes audio |
| §7 AI response — Claude Sonnet 4.6 | ✅ conversation route calls `claude-sonnet-4-6` |
| §7 TTS — OpenAI TTS | ✅ `lib/tts.ts` + integrated in conversation route |
| §7 Avatar — D-ID with Lottie fallback | ✅ `lib/did.ts` + TeacherAvatar static+pulse fallback |
| §7 Error correction detection | ✅ Claude JSON output with `error_report`; `had_correction` stored |
| §8 Sessions table | ✅ `POST /api/session`, `PATCH /api/session/[id]/end` |
| §8 Messages table | ✅ user + assistant messages persisted in conversation route |
| §8 Usage log | ✅ whisper_minutes, tts_chars, claude_tokens, did_credits tracked |
| §10 Dashboard landing page | ✅ minimal dashboard placeholder with teacher info + CTA |
| Panic button (text fallback) | ✅ PanicButton → `panic_text` field to conversation API |
| Auth guard on `/aula` | ✅ middleware already covers `/aula`; page server component also guards |

**Deferred to Plan 4:**
- Full dashboard (streak, replay, session history)
- session_memory writes + retrieval for Claude context
- errors_log upsert (increment `seen_count`)
- Vocabulary SRS
- Mercado Pago subscription flow

## Subsequent Plans

| # | Name | Prerequisite |
|---|------|-------------|
| **4** | Memory & Dashboard | Plans 1–3 |
