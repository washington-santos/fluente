# Corrigir `/api/lesson/tts` pra Usar Supabase Storage — Design Spec

**Source:** root cause investigated via `superpowers:systematic-debugging` after the user reported the lesson flow ("a aula") flows well on desktop but feels generally slower on mobile.

## Problem

Every teacher-audio playback inside the structured lesson flow (`GrammarPresentStep`, `VocabPresentStep`, `ListeningPresentStep`, `GuidedConvoStep` — i.e. almost the entire `/aula` experience) goes through `app/api/lesson/tts/route.ts`, which always returns the synthesized audio as an inline base64 `data:` URL embedded in the JSON response. This differs from the sibling route `app/api/conversation/audio/route.ts` (used by free-conversation replies), which already uploads to Supabase Storage's `audio-replay` bucket and returns a small public URL, falling back to the inline data URL only if the upload fails.

Inline base64 payloads are ~33% larger than the underlying binary, must be fully downloaded and JSON-parsed before any playback can start (no progressive/streamed audio, no browser HTTP caching), and this cost repeats on every single lesson step transition. This disproportionately hurts mobile networks (typically higher latency, lower bandwidth) even though it's a real inefficiency on any connection.

## Goal

`/api/lesson/tts` uploads synthesized audio to the same `audio-replay` Supabase Storage bucket `conversation/audio` already uses, and returns a public URL instead of an inline data URL — mirroring the already-working, already-correct pattern in the sibling route. No client-side changes needed, since all 4 calling components already treat `audio_url` as an opaque string passed to an `<audio src>`.

## Non-goals

- **No cleanup/retention policy for lesson-step audio files.** Unlike conversation replies (whose `audio_url` is persisted in `messages` and meant to be replayed later from session history), lesson-step audio is played once and never referenced again — every upload becomes permanently orphaned storage. Explicitly deferred: ship the performance fix now, revisit storage cost/cleanup once real usage volume is known, rather than over-engineering a retention policy against no data.
- **No caching/deduplication of repeated TTS requests for the same text** (e.g. tapping "Ouvir novamente" re-synthesizes and now also re-uploads). This redundant OpenAI TTS call already happens today (the base64 case just discards the wasted work more invisibly) — not a regression introduced by this fix, and out of scope for it.
- **No `session_id`-scoped storage subfolder** for lesson TTS files, unlike `conversation/audio`'s `${user.id}/${session_id}/...` path. Only `GuidedConvoStep` currently receives `sessionId` as a prop among the 4 calling components; threading it through the other 3 (plus `LessonEngine`'s prop-passing) would expand this from a performance fix into a prop-interface refactor for no functional benefit, since nothing looks up lesson-step audio by session afterward. A flat `${user.id}/${uuid}.mp3` path is used instead.
- **No changes to any of the 4 calling components** (`GrammarPresentStep.tsx`, `VocabPresentStep.tsx`, `ListeningPresentStep.tsx`, `GuidedConvoStep.tsx`) — the response shape (`{ audio_url: string }`) is unchanged, only what kind of string it is.
- **No changes to `app/api/conversation/audio/route.ts`** — it already does this correctly; this spec brings its sibling in line with it, not the other way around.

## The change

### `app/api/lesson/tts/route.ts` (modified)

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

Reuses `lib/tts.ts`'s existing `synthesizeTts(text, voice, speed)`, which already returns `{ dataUrl, buffer }` — only `dataUrl` was being used before; `buffer` is now uploaded via the same `audio-replay` bucket, RLS policy, and upload/fallback pattern `conversation/audio/route.ts` already established (`supabase/migrations/20260701000001_audio_storage_rls_fix.sql`'s policy already accepts any path whose first folder segment is `auth.uid()`, so `${user.id}/${uuid}.mp3` needs no new migration).

No changes to `lib/tts.ts`, `app/api/conversation/audio/route.ts`, or any of the 4 calling components.

## Testing

Neither `app/api/lesson/tts/route.ts` nor `app/api/conversation/audio/route.ts` has route-level test coverage today — this establishes the first one for `lesson/tts`, including the first mock of OpenAI's `audio.speech.create` in this codebase (no existing precedent to follow; a fresh, simple mock returning a fake buffer via `arrayBuffer()`).

`__tests__/app/api/lesson/tts.test.ts` (new):
- **"uploads the synthesized audio to storage and returns the public URL"** — mocks successful synthesis and a successful storage upload; asserts the response's `audio_url` is the storage public URL (not a `data:` URL), and that `.upload()` was called with a path starting `${user.id}/` and `contentType: 'audio/mpeg'`.
- **"falls back to the inline data URL when the storage upload fails"** — mocks the upload failing; asserts the response is still 200 with `audio_url` starting with `data:audio/mp3;base64,`.
- **"returns 401 when unauthenticated"** — covers the existing early return, untested today.
- **"returns 400 when text is missing"** — covers the existing early return, untested today.

No new test for `conversation/audio/route.ts` (unchanged, out of scope) or for the 4 calling components (unchanged response contract).

## Rollout

No database migration — the `audio-replay` bucket and its RLS policy already exist and already accept this path shape. No feature flag. After merging, the usual `vercel --prod` (no `apply_migration` step needed).
