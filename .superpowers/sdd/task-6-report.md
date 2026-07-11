# Task 6 Report: Rewrite `/api/conversation` — fast text-only response

## What I implemented

Replaced both `__tests__/app/api/conversation.test.ts` and `app/api/conversation/route.ts` in full with the exact code from `.superpowers/sdd/task-6-brief.md`.

The route no longer imports `synthesizeTts`, `createTalk`, `DID_VOICE_IDS`, or `createSupabaseAdmin`. It:
- Stops after inserting the assistant message row with `audio_status: 'pending'` and `video_status` computed from whether `EF_PUBLIC_ORIGIN` is set (`'pending'` if set, `'skipped'` if not).
- Returns the new `ConversationResponse` shape (Task 5): `message_id` (from the `.select('id').single()` on the assistant insert), `audio_url: null`, `audio_status: 'pending'`, `video_url: null`, `video_status`.
- Adds `response_format: { type: 'json_object' }` to the chat completion call.
- Adds `createStageTimer('conversation')` from Task 2, with marks at `quota_check`, `parallel_reads`, `whisper`, `gpt`, `db_write`, and a final `timer.finish(...)`.
- Parallelizes the four independent reads (`users`, `session_memory`, `errors_log`, `messages`) via `Promise.all` instead of four sequential awaits.
- Keeps `reply_pt`/`suggested_replies` persisted on the assistant row (unchanged from before, just reordered).
- Usage log RPC now always passes `p_tts_chars: 0` and `p_did_credits: 0` since those are no longer computed inline.

## TDD Evidence

### RED
Command: `npm run test:run -- __tests__/app/api/conversation.test.ts`
(run against the new test file, still pointed at the OLD route.ts, before rewriting the route)

```
 FAIL  __tests__/app/api/conversation.test.ts [ __tests__/app/api/conversation.test.ts ]
Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.
 ❯ Object.<anonymous> ../../../node_modules/server-only/index.js:1:7

 Test Files  1 failed (1)
      Tests  no tests
```

This failure occurs because the new test file no longer mocks `@/lib/tts` / `@/lib/did`, and the old route still imported them — those modules (or a transitive dependency) pull in the `server-only` package, which throws when imported in the vitest node environment without a proper server-component context. This confirms the old route was still coupled to TTS/D-ID and the test suite correctly failed against it before the rewrite.

### GREEN
Command: `npm run test:run -- __tests__/app/api/conversation.test.ts __tests__/api/conversation`
(after rewriting route.ts)

```
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  2.34s
```

All 3 files passed: `conversation.test.ts`, `quota-demo.test.ts`, `vip-bypass.test.ts` — 16 tests total.

## Files changed

- `app/api/conversation/route.ts` — full rewrite per brief (removed TTS/D-ID inline work, added timer, message_id, pending statuses, JSON mode, parallelized reads).
- `__tests__/app/api/conversation.test.ts` — full replacement per brief (new mocks: `mockInsertSingle`, chained `.select().single()` on messages insert; new assertions for `message_id`, `audio_status`, `video_status`, JSON mode).
- `__tests__/api/conversation/quota-demo.test.ts` — **not touched**. Read it in full; it only asserts on HTTP status codes (`403`, `429`) and `body.error`, never on `audio_url`/`video_url` shape in a 200 response. No changes needed.
- `__tests__/api/conversation/vip-bypass.test.ts` — **not touched**. Read it in full; it only asserts `res.status` is not `403`/`429`. No response-shape assertions. No changes needed. (Its `vi.mock('@/lib/tts', ...)` / `vi.mock('@/lib/did', ...)` calls are now unused by the route but harmless — `vi.mock` just registers a mock module; it doesn't require the module under test to import it.)

## `npx tsc --noEmit` output

```
EXIT_CODE=0
```

Full project type-checks clean with zero errors — not just the two previously-known `route.ts` errors resolved, but no residual errors surfaced in `app/aula/AulaClient.tsx` either.

## Full suite result

Command: `npm run test:run`

```
 Test Files  2 failed | 64 passed (66)
      Tests  2 failed | 275 passed (277)
```

The 2 failures are exactly the pre-existing, unrelated ones called out in the task instructions:
- `__tests__/app/login.test.tsx` — "renders the Google OAuth button" (missing OAuth button text/element, unrelated to this task)
- `__tests__/app/api/onboarding/level.test.ts` — "returns level and transcript" (expects CEFR level 'B1', got 'A2', unrelated to this task)

No new failures introduced.

## Self-review findings

- Quota-enforcement block: copied verbatim from the brief (character-for-character, including the `demoColumnsMissing` / `error.code === '42703'` handling that is part of this task's replacement code, wrapping the same logic in `if (!vipUser) { ... }`). Diffed against the pre-task route.ts to confirm the underlying quota rules (limits, status transitions, RPC calls) are unchanged — only re-indented/reorganized as the brief specifies.
- Confirmed no remaining references to `synthesizeTts`, `createTalk`, `DID_VOICE_IDS`, or `createSupabaseAdmin` anywhere in `route.ts`.
- Confirmed `ConversationResponse` fields match `types/index.ts` exactly (`message_id`, `audio_status: AudioStatus`, `video_status: VideoStatus`).
- Did not touch `lib/tts.ts`, `lib/did.ts`, `types/index.ts`, `hooks/useSession.ts`, `app/aula/AulaClient.tsx`, or any other out-of-scope file — verified via `git status` showing only the two intended files modified.
- Did not touch the two quota test files, per their read-through showing no shape-dependent assertions needing updates.

## Concerns

None. This task matched the brief exactly; verification (focused tests, full suite, tsc) all confirm success.

Note: this file previously contained a stale report from an unrelated earlier "Task 6" (an admin VIP management page) left over from a prior session's task numbering. That content has been replaced with this task's report.
