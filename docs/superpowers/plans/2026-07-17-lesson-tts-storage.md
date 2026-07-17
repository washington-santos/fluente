# Corrigir /api/lesson/tts pra Usar Supabase Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/lesson/tts` (used by every teacher-audio playback in the structured lesson flow) upload synthesized speech to Supabase Storage and return a public URL, instead of always embedding it as an inline base64 `data:` URL in the JSON response — eliminating the payload bloat and blocked/non-progressive playback that disproportionately hurts mobile users.

**Architecture:** `lib/tts.ts`'s `synthesizeTts()` already returns both `dataUrl` and `buffer` — only `dataUrl` is used today. The route starts using `buffer` too, uploading it to the existing `audio-replay` Supabase Storage bucket (already created, RLS already correct, already used by the sibling route `app/api/conversation/audio/route.ts`) via `createSupabaseAdmin()`, then returns the resulting public URL — falling back to the inline `dataUrl` only if the upload fails, mirroring the sibling route's exact fallback behavior.

**Tech Stack:** Next.js App Router (API route), TypeScript, Supabase Storage, Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-17-lesson-tts-storage-design.md`

## Global Constraints

- No changes to `lib/tts.ts`, `app/api/conversation/audio/route.ts`, or any of the 4 components that call `/api/lesson/tts` (`components/lesson/GrammarPresentStep.tsx`, `VocabPresentStep.tsx`, `ListeningPresentStep.tsx`, `GuidedConvoStep.tsx`) — the response shape (`{ audio_url: string }`) is unchanged.
- Storage path is flat: `${user.id}/${crypto.randomUUID()}.mp3` — no session-id subfolder (unlike `conversation/audio`'s `${user.id}/${session_id}/...`), since 3 of the 4 calling components don't have `sessionId` available and nothing looks up this audio by session afterward.
- No new database migration — the `audio-replay` bucket and its RLS policy (`(storage.foldername(name))[1] = auth.uid()::text`) already accept this path shape.
- No cleanup/retention logic for uploaded files, no caching/deduplication of repeated same-text requests, no feature flag.

---

## Task 1: Upload lesson TTS audio to storage instead of inlining it

**Files:**
- Modify: `app/api/lesson/tts/route.ts`
- Test: `__tests__/app/api/lesson/tts.test.ts` (new)

**Interfaces:**
- Consumes: `synthesizeTts(text, voice, speed): Promise<{ dataUrl: string; buffer: Buffer }>` (already exists in `lib/tts.ts`, unchanged), `createSupabaseAdmin()` (already exists in `lib/supabase-admin.ts`, unchanged).

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/app/api/lesson/tts.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockSpeechCreate = vi.hoisted(() => vi.fn())
const mockUpload = vi.hoisted(() => vi.fn())
const mockGetPublicUrl = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      speech: { create: mockSpeechCreate },
    }
  },
}))

import { POST } from '@/app/api/lesson/tts/route'

function makeFormRequest(fields: Record<string, string>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/lesson/tts', { method: 'POST', body: form })
}

describe('POST /api/lesson/tts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('fake-mp3-bytes').buffer,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeFormRequest({ text: 'Hello' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when text is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await POST(makeFormRequest({}))
    expect(res.status).toBe(400)
  })

  it('uploads the synthesized audio to storage and returns the public URL', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' },
    })

    const res = await POST(makeFormRequest({ text: 'Hello there', voice: 'alloy' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.audio_url).toBe('https://storage.example.com/audio-replay/user-1/abc.mp3')
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
      expect.any(Buffer),
      { contentType: 'audio/mpeg', upsert: false },
    )
  })

  it('falls back to the inline data URL when the storage upload fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: { message: 'bucket unreachable' } })

    const res = await POST(makeFormRequest({ text: 'Hello there' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.audio_url).toMatch(/^data:audio\/mp3;base64,/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/app/api/lesson/tts.test.ts`
Expected: FAIL — the 401/400 cases pass already (pre-existing behavior), but the storage-upload test fails because `mockUpload` is never called (current route never uploads), and its assertion on `body.audio_url` being the storage URL fails since the route always returns a `data:` URL today. The fallback test also currently "passes" for the wrong reason (every response is a data URL today) — after Step 4 it will pass for the *right* reason (upload attempted and failed). Confirm at minimum that the upload-success test fails.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/lesson/tts/route.ts` with:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { synthesizeTts } from '@/lib/tts'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const text = formData.get('text') as string | null
  const voice = (formData.get('voice') as string | null) ?? 'alloy'
  const speedRaw = formData.get('speed') as string | null
  const parsedSpeed = speedRaw ? parseFloat(speedRaw) : NaN
  const speed = Number.isNaN(parsedSpeed) ? 1.0 : Math.min(4.0, Math.max(0.25, parsedSpeed))

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const { dataUrl, buffer } = await synthesizeTts(text, voice, speed)

    const supabaseAdmin = createSupabaseAdmin()
    const storagePath = `${user.id}/${crypto.randomUUID()}.mp3`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-replay')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })

    const audioUrl = uploadError
      ? dataUrl
      : supabaseAdmin.storage.from('audio-replay').getPublicUrl(storagePath).data.publicUrl
    if (uploadError) console.error('Lesson TTS upload failed, using inline data URL:', uploadError.message)

    return NextResponse.json({ audio_url: audioUrl })
  } catch (err) {
    console.error('TTS error:', err)
    return NextResponse.json({ error: 'TTS failed' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/app/api/lesson/tts.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full suite**

Run: `npm run test:run`
Expected: PASS — all pre-existing tests plus these 4 new ones, no regressions. No other file references the removed unused-`dataUrl`-only pattern, so nothing else should be affected.

- [ ] **Step 7: Commit**

```bash
git add app/api/lesson/tts/route.ts __tests__/app/api/lesson/tts.test.ts
git commit -m "fix: upload lesson TTS audio to Supabase Storage instead of inlining base64

Every teacher-audio playback in the structured lesson flow
(GrammarPresentStep, VocabPresentStep, ListeningPresentStep,
GuidedConvoStep) went through this route, which always embedded the
synthesized speech as a base64 data: URL in the JSON response — ~33%
larger than the binary, blocks progressive playback, never cacheable
by the browser. Brings it in line with the sibling route
conversation/audio/route.ts, which already uploads to the audio-replay
bucket and returns a lightweight public URL, falling back to the
inline data URL only if the upload fails. Disproportionately hurt
mobile users on slower/higher-latency connections, since this repeats
on every lesson step transition."
```

---

## Final Check

- [ ] Run the full suite: `npm run test:run` — expect all tests green, including every pre-existing test file (no regressions).
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` in the primary (non-nested) checkout — confirm no new ESLint/type errors from this feature's files.
- [ ] Manual pass: on a real or throttled-network mobile device (or Chrome DevTools' network throttling set to "Slow 3G"/"Fast 3G"), take a structured lesson through several steps (grammar, at least one vocab word, listening) and confirm audio plays noticeably sooner than before, and that the browser's Network tab shows `/api/lesson/tts` responses containing a short `https://...supabase.co/storage/...` URL rather than a large inline base64 string.
- [ ] No database migration and no Vercel-specific changes are introduced by this plan — after merging, a normal `vercel --prod` picks up the change.
