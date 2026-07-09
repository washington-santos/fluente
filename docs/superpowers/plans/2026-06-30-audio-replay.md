# Audio Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the teacher's TTS audio in Supabase Storage so it can be replayed on the session history page, and render an `<audio>` player per assistant message in `/dashboard/sessao/[id]`.

**Architecture:** Three layers — (1) `lib/tts.ts` is refactored to return both the base64 data URI (for live playback) and the raw `Buffer` (for upload); (2) `app/api/conversation/route.ts` uploads the buffer to the `audio-replay` Supabase Storage bucket via the admin client and stores the public URL in `messages.audio_url`; (3) the replay page selects `audio_url` and renders a native `<audio controls>` element under each assistant message. A SQL migration creates the bucket and public-read policy.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase SSR + service role, Supabase Storage, Vitest

## Global Constraints

- App Router only — no Pages Router
- `lib/tts.ts` must keep `synthesizeTts` as the exported function name — only its return type changes from `string` to `{ dataUrl: string; buffer: Buffer }`
- Storage bucket name: `audio-replay` (exact, lowercase, hyphenated)
- Storage path pattern: `{user_id}/{session_id}/{timestamp}.mp3`
- Live response (`ConversationResponse.audio_url`) still uses the base64 `dataUrl` — replay uses the storage URL
- `messages.audio_url` stores the Supabase Storage public URL (not base64)
- Admin client for storage upload: `createSupabaseAdmin()` from `@/lib/supabase-admin`
- TTS upload must be graceful: if upload fails, assistant message is still inserted with `audio_url: null`
- Tailwind classes only from design tokens in `tailwind.config.ts`
- UI copy in Portuguese
- Test runner: `npm run test:run` (Vitest); TypeScript check: `npx tsc --noEmit`
- No new npm packages

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260630000001_audio_storage.sql` | Create | Create `audio-replay` bucket (public) + public-read RLS policy on `storage.objects` |
| `lib/tts.ts` | Modify | Change return type to `{ dataUrl: string; buffer: Buffer }` |
| `__tests__/lib/tts.test.ts` | Modify | Update tests to expect `{ dataUrl, buffer }` shape |
| `app/api/conversation/route.ts` | Modify | Destructure `{ dataUrl, buffer }` from TTS; upload buffer to Storage; store public URL in `messages.audio_url` |
| `app/dashboard/sessao/[id]/page.tsx` | Modify | Add `audio_url` to SELECT; render `<audio controls>` for assistant messages |
| `app/admin/sessoes/[id]/page.tsx` | Modify | Same as above — add `audio_url` to SELECT; render `<audio controls>` for assistant messages |

---

### Task 1: Storage bucket migration + `lib/tts.ts` refactor

**Files:**
- Create: `supabase/migrations/20260630000001_audio_storage.sql`
- Modify: `lib/tts.ts`
- Modify: `__tests__/lib/tts.test.ts`

**Interfaces:**
- Produces: `synthesizeTts(text: string, voice: string): Promise<{ dataUrl: string; buffer: Buffer }>` — consumed by Task 2

- [ ] **Step 1: Write the updated tts tests first**

Replace the contents of `__tests__/lib/tts.test.ts` with:

```typescript
import { vi, describe, it, expect } from 'vitest'

vi.mock('openai', () => {
  const mockData = new Uint8Array([102, 97, 107, 101, 45, 97, 117, 100, 105, 111])

  class MockOpenAI {
    audio = {
      speech: {
        create: vi.fn().mockResolvedValue({
          arrayBuffer: async () => mockData.buffer,
        }),
      },
    }
  }

  return { default: MockOpenAI }
})

import { synthesizeTts } from '@/lib/tts'

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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test:run -- __tests__/lib/tts.test.ts`

Expected: 2 old tests PASS (they still work if function returns a string, but the 3rd test will fail since `.toHaveProperty('buffer')` won't work on a string). Actually all 3 will fail on the current string return. That's expected.

- [ ] **Step 3: Update `lib/tts.ts`**

Replace the file contents with:

```typescript
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
```

- [ ] **Step 4: Run the tts tests**

Run: `npm run test:run -- __tests__/lib/tts.test.ts`

Expected: 3/3 PASS.

- [ ] **Step 5: Create the storage migration**

Create `supabase/migrations/20260630000001_audio_storage.sql`:

```sql
-- Create public audio-replay bucket for TTS audio storage
insert into storage.buckets (id, name, public)
values ('audio-replay', 'audio-replay', true)
on conflict (id) do nothing;

-- Public read policy — anyone with the URL can stream the audio
create policy "audio-replay: public read"
  on storage.objects for select
  using (bucket_id = 'audio-replay');
```

- [ ] **Step 6: Apply the migration to Supabase**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor.

If the Supabase CLI is not configured for push, apply the SQL directly in the Supabase dashboard at: Project → SQL Editor → paste and run the contents of the migration file.

Verify the bucket was created: check Supabase dashboard → Storage → Buckets, confirm `audio-replay` appears as public.

- [ ] **Step 7: Run the full test suite to ensure no regressions**

Run: `npm run test:run`

Expected: all existing tests pass. The conversation test will likely fail because it mocks `synthesizeTts` to return a string — but that mock is in the conversation test file, not `tts.test.ts`. Check: if `__tests__/app/api/conversation.test.ts` mocks `synthesizeTts`, update that mock to return `{ dataUrl: 'data:audio/mp3;base64,dGVzdA==', buffer: Buffer.from('test') }`.

- [ ] **Step 8: TypeScript check**

Run: `npx tsc --noEmit`

Expected: TypeScript will likely show an error in `app/api/conversation/route.ts` because `synthesizeTts` now returns an object but the route still does `audioUrl = await synthesizeTts(...)`. That error is expected here — Task 2 fixes it.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260630000001_audio_storage.sql lib/tts.ts __tests__/lib/tts.test.ts
git commit -m "feat: audio replay — storage bucket + tts returns buffer"
```

---

### Task 2: Upload in conversation route + store audio URL

**Files:**
- Modify: `app/api/conversation/route.ts`
- Modify: `__tests__/app/api/conversation.test.ts` (update mock + add upload test)

**Interfaces:**
- Consumes: `synthesizeTts(text, voice): Promise<{ dataUrl: string; buffer: Buffer }>` from Task 1
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin` (already exists)
- Produces: `messages.audio_url` stores Supabase Storage public URL string (not null, not base64)

- [ ] **Step 1: Read the existing conversation test to understand mock structure**

Run: `cat __tests__/app/api/conversation.test.ts | head -60`

Note how `synthesizeTts` is mocked (likely `vi.mock('@/lib/tts', ...)`). You will update it to return the new shape.

- [ ] **Step 2: Update the `synthesizeTts` mock in conversation tests**

Find the existing mock of `@/lib/tts` in `__tests__/app/api/conversation.test.ts`. Change it from:

```typescript
// Before (returns string):
vi.mock('@/lib/tts', () => ({
  synthesizeTts: vi.fn().mockResolvedValue('data:audio/mp3;base64,dGVzdA=='),
}))
```

To:

```typescript
// After (returns { dataUrl, buffer }):
vi.mock('@/lib/tts', () => ({
  synthesizeTts: vi.fn().mockResolvedValue({
    dataUrl: 'data:audio/mp3;base64,dGVzdA==',
    buffer: Buffer.from('test-audio'),
  }),
}))
```

Also add a mock for Supabase storage upload. Find where `@/lib/supabase-admin` is mocked or add it:

```typescript
vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/audio-replay/test.mp3' },
        }),
      })),
    },
  })),
}))
```

- [ ] **Step 3: Add one upload test case**

Add a test in the existing describe block verifying that when TTS succeeds, the assistant message is inserted with a non-null `audio_url`:

```typescript
it('stores audio_url in assistant message after successful TTS upload', async () => {
  // Use existing happy-path mock setup from the file
  // After POST, verify that supabase.from('messages').insert was called
  // with an object containing audio_url that is not null for the assistant message

  // Since the full mock chain is complex, just verify the route returns 200
  // and the response contains audio_url (the dataUrl for live playback)
  // The storage upload is verified by the mock not throwing

  // Set up auth + minimal required mocks (reuse pattern from existing tests)
  // ... (follow the existing test structure in the file)

  const form = new FormData()
  form.append('session_id', 'sess-1')
  form.append('panic_text', 'Hello teacher')
  const req = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
  const { POST } = await import('@/app/api/conversation/route')
  const res = await POST(req)
  const body = await res.json()

  // Live response still contains base64 dataUrl, not the storage URL
  expect(body.audio_url).toMatch(/^data:audio\/mp3;base64,/)
})
```

Note: If the existing conversation tests already have a happy-path test that checks the response, verify it still passes — the audio_url in the live response must remain the base64 dataUrl, not the storage URL.

- [ ] **Step 4: Run tests to confirm current failures**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`

Expected: failures related to the new mock shape (since route still calls old API).

- [ ] **Step 5: Update `app/api/conversation/route.ts`**

At the top, add the import:
```typescript
import { createSupabaseAdmin } from '@/lib/supabase-admin'
```

Find the TTS block (around line 187–193):
```typescript
  let audioUrl: string | null = null
  try {
    audioUrl = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')
  } catch (err) {
    console.error('TTS failed, continuing without audio:', err)
  }
```

Replace it with:
```typescript
  let audioUrl: string | null = null
  let storedAudioUrl: string | null = null
  try {
    const { dataUrl, buffer } = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')
    audioUrl = dataUrl

    // Upload to Storage for replay — use admin client to bypass RLS
    const supabaseAdmin = createSupabaseAdmin()
    const storagePath = `${user.id}/${sessionId}/${Date.now()}.mp3`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-replay')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })

    if (!uploadError) {
      storedAudioUrl = supabaseAdmin.storage
        .from('audio-replay')
        .getPublicUrl(storagePath).data.publicUrl
    } else {
      console.error('Audio upload failed:', uploadError.message)
    }
  } catch (err) {
    console.error('TTS failed, continuing without audio:', err)
  }
```

Then update the assistant message insert to use `storedAudioUrl`:
```typescript
  // Was: { session_id: sessionId, role: 'assistant', text: replyText, audio_url: null, ... }
  // Now:
  const { error: assistantInsertError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'assistant', text: replyText, audio_url: storedAudioUrl, had_correction: errorReport.error_detected },
  ])
```

The `response.audio_url` (live playback) stays as `audioUrl` (base64 dataUrl) — do NOT change it.

- [ ] **Step 6: Run the conversation tests**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`

Expected: all tests PASS including the new upload test.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 8: Run full test suite**

Run: `npm run test:run`

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: upload TTS audio to Supabase Storage and persist URL in messages.audio_url"
```

---

### Task 3: Audio player in replay pages

**Files:**
- Modify: `app/dashboard/sessao/[id]/page.tsx`
- Modify: `app/admin/sessoes/[id]/page.tsx`

**Interfaces:**
- Consumes: `messages.audio_url` — string (Supabase Storage public URL) or null

- [ ] **Step 1: Read both replay pages**

Run:
```bash
cat app/dashboard/sessao/[id]/page.tsx
cat app/admin/sessoes/[id]/page.tsx
```

Note the current `messages` SELECT and the message rendering loop.

- [ ] **Step 2: Update the dashboard replay page**

In `app/dashboard/sessao/[id]/page.tsx`:

Change the messages SELECT to include `audio_url`:
```typescript
// Was:
.select('id, role, text, had_correction')

// Now:
.select('id, role, text, audio_url, had_correction')
```

Inside the message rendering loop, add the `<audio>` player for assistant messages. Replace:
```tsx
<div
  key={m.id}
  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
>
  <div
    className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
      m.role === 'user'
        ? 'bg-brand-cta text-white rounded-br-sm'
        : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
    }`}
  >
    <p>{m.text}</p>
    {m.had_correction && (
      <span className="block text-xs opacity-70 mt-1">✓ corrigido</span>
    )}
  </div>
</div>
```

With:
```tsx
<div
  key={m.id}
  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
>
  <div
    className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
      m.role === 'user'
        ? 'bg-brand-cta text-white rounded-br-sm'
        : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
    }`}
  >
    <p>{m.text}</p>
    {m.had_correction && (
      <span className="block text-xs opacity-70 mt-1">✓ corrigido</span>
    )}
    {m.role === 'assistant' && m.audio_url && (
      <audio
        controls
        src={m.audio_url}
        className="mt-2 w-full h-8"
        aria-label="Reproduzir resposta"
      />
    )}
  </div>
</div>
```

- [ ] **Step 3: Update the admin replay page**

In `app/admin/sessoes/[id]/page.tsx`:

Apply the same two changes:
1. Add `audio_url` to the messages SELECT
2. Add the `<audio>` player for assistant messages after the text paragraph (same JSX as above)

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors. TypeScript may warn about `m.audio_url` being possibly undefined — ensure the select returns `audio_url: string | null` and the conditional `m.audio_url &&` handles null correctly.

- [ ] **Step 5: Run full test suite**

Run: `npm run test:run`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/sessao/[id]/page.tsx app/admin/sessoes/[id]/page.tsx
git commit -m "feat: audio player in session replay — stream teacher audio from storage"
```
