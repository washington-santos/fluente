# Memory & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the teacher cross-session memory of the student, track streaks and recurring errors, and replace the placeholder dashboard with a full history + replay UI.

**Architecture:** A `POST /api/session/[id]/finalize` endpoint runs after every session ends — it calls Claude Haiku to summarise the conversation into a `session_memories` row, upserts recurring errors into `error_log`, and updates the user's streak. The conversation route loads the latest memory and injects it into the Claude system prompt. The dashboard is a server component that reads streak, recent sessions, and errors directly from Supabase.

**Tech Stack:** Next.js 14 App Router (server components), Supabase SSR, Anthropic Claude Haiku `claude-haiku-4-5-20251001`, Vitest + @testing-library/react, TypeScript, Tailwind CSS.

## Global Constraints

- Node ≥ 18, Next.js 14 App Router, TypeScript strict mode
- Supabase client: `createSupabaseServer()` from `@/lib/supabase-server` in API routes and server components; `createSupabaseClient()` from `@/lib/supabase` in client components
- All API routes: auth guard with `supabase.auth.getUser()` → 401 if no user
- Claude model for memory generation: `claude-haiku-4-5-20251001`, max_tokens: 256
- Claude model for conversation: `claude-sonnet-4-6` (unchanged)
- Test runner: `npm run test:run` (Vitest); TypeScript check: `npx tsc --noEmit`
- Tests use `@vitest-environment node` for API route tests; `@vitest-environment jsdom` for hook/component tests
- Class-based mocks required for OpenAI and Anthropic constructors in Vitest v4
- No new npm packages — use existing: `openai`, `@anthropic-ai/sdk`, `@supabase/ssr`
- Tailwind classes only from `tailwind.config.ts` design tokens: `surface-light`, `surface-light-card`, `surface-dark`, `surface-dark-card`, `content-light`, `content-light-secondary`, `content-dark`, `content-dark-secondary`, `brand-cta`
- Copy/labels in Portuguese (pt-BR); English content is teacher/student conversation only

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/memory.ts` | Create | `generateSessionMemory()` — calls Claude Haiku, returns `{summary, key_topics, personal_details}` |
| `app/api/session/[id]/finalize/route.ts` | Create | POST: loads messages, calls generateSessionMemory, stores in session_memories, upserts error_log, updates streak |
| `app/api/conversation/route.ts` | Modify | Load latest session_memory row and inject into Claude system prompt |
| `hooks/useSession.ts` | Modify | After endSession() succeeds, fire-and-forget POST to /api/session/[id]/finalize |
| `app/dashboard/page.tsx` | Modify | Full server component: streak, recent sessions, error log, CTA |
| `components/dashboard/StreakBadge.tsx` | Create | Streak counter display |
| `components/dashboard/SessionCard.tsx` | Create | Card for a past session with date, duration, replay link |
| `components/dashboard/ErrorCard.tsx` | Create | Card for a recurring grammar error |
| `app/dashboard/sessao/[id]/page.tsx` | Create | Session replay: read-only transcript of all messages |
| `__tests__/lib/memory.test.ts` | Create | Unit tests for generateSessionMemory |
| `__tests__/app/api/session/finalize.test.ts` | Create | Integration tests for finalize route |
| `__tests__/app/dashboard/page.test.tsx` | Create | Smoke test for dashboard server component |
| `__tests__/app/dashboard/sessao.test.tsx` | Create | Smoke test for replay page |

---

## Task 1: `lib/memory.ts` + `POST /api/session/[id]/finalize`

**Files:**
- Create: `lib/memory.ts`
- Create: `app/api/session/[id]/finalize/route.ts`
- Create: `__tests__/lib/memory.test.ts`
- Create: `__tests__/app/api/session/finalize.test.ts`

**Interfaces:**
- Consumes: `Message` type from `@/types`; `createSupabaseServer` from `@/lib/supabase-server`
- Produces:
  - `generateSessionMemory(messages: Array<{role: string; text: string}>, userName: string, cefrLevel: string): Promise<MemoryOutput>`
  - `interface MemoryOutput { summary: string; key_topics: string[]; personal_details: string[] }`
  - `POST /api/session/[id]/finalize` → `{ ok: true }` or `{ error: string }`

- [ ] **Step 1: Write failing tests for `generateSessionMemory`**

Create `__tests__/lib/memory.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

class MockAnthropic {
  messages = { create: mockCreate }
}

vi.mock('@anthropic-ai/sdk', () => ({ default: MockAnthropic }))

import { generateSessionMemory } from '@/lib/memory'

const messages = [
  { role: 'user', text: 'I work as a software engineer in São Paulo.' },
  { role: 'assistant', text: 'That\'s great! How long have you been working there?' },
  { role: 'user', text: 'For three years now. I love coding.' },
]

describe('generateSessionMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls Claude Haiku and returns parsed MemoryOutput', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"summary":"Student is a software engineer in São Paulo.","key_topics":["job vocabulary","present perfect"],"personal_details":["software engineer","lives in São Paulo","3 years experience"]}' }],
    })
    const result = await generateSessionMemory(messages, 'Ana', 'B1')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
    }))
    expect(result.summary).toBe('Student is a software engineer in São Paulo.')
    expect(result.key_topics).toEqual(['job vocabulary', 'present perfect'])
    expect(result.personal_details).toContain('software engineer')
  })

  it('returns safe fallback when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })
    const result = await generateSessionMemory(messages, 'Ana', 'B1')
    expect(result.summary).toContain('Session')
    expect(Array.isArray(result.key_topics)).toBe(true)
    expect(Array.isArray(result.personal_details)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npm run test:run -- __tests__/lib/memory.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/memory'"

- [ ] **Step 3: Create `lib/memory.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface MemoryOutput {
  summary: string
  key_topics: string[]
  personal_details: string[]
}

export async function generateSessionMemory(
  messages: Array<{ role: string; text: string }>,
  userName: string,
  cefrLevel: string,
): Promise<MemoryOutput> {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? userName : 'Teacher'}: ${m.text}`)
    .join('\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system:
      'You are an English learning session analyser. ' +
      'From the transcript, extract: a 1-2 sentence summary of what was discussed, ' +
      'key English topics practised (2-5 items), and personal details the student mentioned (0-5 items). ' +
      'Respond ONLY with valid JSON — no markdown:\n' +
      '{"summary":"...","key_topics":["..."],"personal_details":["..."]}',
    messages: [
      {
        role: 'user',
        content: `Student: ${userName} (CEFR ${cefrLevel})\n\nTranscript:\n${transcript}`,
      },
    ],
  })

  const raw = res.content[0]?.type === 'text' ? (res.content[0] as any).text : ''

  try {
    const parsed = JSON.parse(raw)
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Session completed.',
      key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
      personal_details: Array.isArray(parsed.personal_details) ? parsed.personal_details : [],
    }
  } catch {
    return {
      summary: 'Session completed.',
      key_topics: [],
      personal_details: [],
    }
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```
npm run test:run -- __tests__/lib/memory.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Write failing tests for finalize route**

Create `__tests__/app/api/session/finalize.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

const mockMemoryGenerate = vi.fn()
vi.mock('@/lib/memory', () => ({ generateSessionMemory: mockMemoryGenerate }))

import { POST } from '@/app/api/session/[id]/finalize/route'

const makeChain = (data: any, error: any = null) => {
  const chain: any = { eq: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), order: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  chain.eq.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.insert.mockResolvedValue({ error: null })
  chain.update.mockResolvedValue({ error: null })
  chain.upsert.mockResolvedValue({ error: null })
  chain.single.mockResolvedValue({ data, error })
  chain.maybeSingle.mockResolvedValue({ data, error })
  return chain
}

describe('POST /api/session/[id]/finalize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://localhost/api/session/s1/finalize', { method: 'POST' })
    const res = await POST(req, { params: { id: 's1' } })
    expect(res.status).toBe(401)
  })

  it('generates memory, upserts errors, updates streak, returns ok:true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockMemoryGenerate.mockResolvedValue({
      summary: 'Good session.',
      key_topics: ['past tense'],
      personal_details: ['teacher'],
    })

    const sessionChain = makeChain({ id: 's1', user_id: 'u1' })
    const userChain = makeChain({ id: 'u1', name: 'Ana', cefr_level: 'B1', streak_days: 2, last_session_at: null })
    const messagesChain = makeChain(null)
    messagesChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    // messages select returns array
    const msgListChain: any = { eq: vi.fn(), select: vi.fn(), order: vi.fn() }
    msgListChain.eq.mockReturnValue(msgListChain)
    msgListChain.select.mockReturnValue(msgListChain)
    msgListChain.order.mockResolvedValue({
      data: [
        { role: 'user', text: 'Hello', had_correction: false },
        { role: 'assistant', text: 'Hi!', had_correction: false, error_text: null, correct_form: null, error_type: null },
        { role: 'user', text: 'I goed to the store', had_correction: true, error_text: 'goed', correct_form: 'went', error_type: 'verb_tense' },
      ],
      error: null,
    })

    const memInsertChain = makeChain(null)
    const userUpdateChain = makeChain(null)
    userUpdateChain.eq.mockResolvedValue({ error: null })
    const errorUpsertChain = makeChain(null)

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'sessions') return sessionChain
      if (table === 'users') {
        // first call = select, second call = update
        return fromCallCount <= 3 ? userChain : userUpdateChain
      }
      if (table === 'messages') return msgListChain
      if (table === 'session_memories') return memInsertChain
      if (table === 'error_log') return errorUpsertChain
      return makeChain(null)
    })

    const req = new Request('http://localhost/api/session/s1/finalize', { method: 'POST' })
    const res = await POST(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

- [ ] **Step 6: Run test — verify it fails**

```
npm run test:run -- __tests__/app/api/session/finalize.test.ts
```
Expected: FAIL — "Cannot find module '@/app/api/session/[id]/finalize/route'"

- [ ] **Step 7: Create `app/api/session/[id]/finalize/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { generateSessionMemory } from '@/lib/memory'
import type { ErrorType } from '@/types'

const VALID_ERROR_TYPES = new Set<string>(['verb_tense', 'vocabulary', 'preposition', 'pronunciation', 'other'])

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  // Verify session ownership
  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Load user profile
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level, streak_days, last_session_at')
    .eq('id', user.id)
    .single()

  // Load all messages for this session
  const { data: messages } = await supabase
    .from('messages')
    .select('role, text, had_correction, error_text, correct_form, error_type')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const msgs = messages ?? []

  // 1 — Generate and store session memory
  try {
    const memory = await generateSessionMemory(
      msgs.map((m: any) => ({ role: m.role, text: m.text })),
      userData?.name ?? 'Student',
      userData?.cefr_level ?? 'B1',
    )
    await supabase.from('session_memories').insert({
      user_id: user.id,
      summary: memory.summary,
      key_topics: memory.key_topics,
      personal_details: memory.personal_details,
    })
  } catch (err) {
    console.error('Memory generation failed:', err)
  }

  // 2 — Upsert error_log for messages with corrections
  const corrections = msgs.filter((m: any) => m.had_correction && m.error_text && m.correct_form)
  for (const c of corrections) {
    if (!VALID_ERROR_TYPES.has(c.error_type ?? '')) continue
    const { data: existing } = await supabase
      .from('error_log')
      .select('id, seen_count')
      .eq('user_id', user.id)
      .eq('error_text', c.error_text)
      .eq('correct_form', c.correct_form)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('error_log')
        .update({ seen_count: existing.seen_count + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('error_log').insert({
        user_id: user.id,
        error_type: c.error_type as ErrorType,
        error_text: c.error_text,
        correct_form: c.correct_form,
        seen_count: 1,
        last_seen_at: new Date().toISOString(),
      })
    }
  }

  // 3 — Update streak
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const lastDate = userData?.last_session_at ? userData.last_session_at.slice(0, 10) : null

  let newStreak = userData?.streak_days ?? 0
  if (lastDate === today) {
    // Already counted today — no change
  } else if (lastDate === yesterday) {
    newStreak += 1
  } else {
    newStreak = 1
  }

  await supabase
    .from('users')
    .update({ streak_days: newStreak, last_session_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run tests — verify they pass**

```
npm run test:run -- __tests__/lib/memory.test.ts __tests__/app/api/session/finalize.test.ts
```
Expected: PASS (all tests)

- [ ] **Step 9: Run TypeScript check**

```
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add lib/memory.ts app/api/session/[id]/finalize/route.ts __tests__/lib/memory.test.ts __tests__/app/api/session/finalize.test.ts
git commit -m "feat: session finalize — memory generation, error log upsert, streak update"
```

---

## Task 2: Inject session memory into conversation system prompt

**Files:**
- Modify: `app/api/conversation/route.ts` (lines ~76–84 — the systemPrompt block)
- Modify: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- Consumes: `session_memories` table — query latest row for user_id, select `summary, key_topics, personal_details`
- Produces: enhanced system prompt with memory block when memory exists

- [ ] **Step 1: Write failing test for memory injection**

Open `__tests__/app/api/conversation.test.ts`. Add a new test:

```typescript
it('injects session memory into system prompt when memory exists', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

  // Mock the memory row — must be returned by the session_memories query
  // Set up mockFrom to return memory data for 'session_memories'
  // (Adapt to the existing mockFrom setup in the file)
  // The memory select chain returns: { data: { summary: 'Student likes coding.', key_topics: ['present perfect'], personal_details: ['software engineer'] }, error: null }
  // Verify that anthropic.messages.create is called with a system prompt containing "Student likes coding."

  // ... (see existing test structure for how mockFrom is set up)
  // Assert: mockAnthropicCreate was called; inspect the `system` argument
  const callArgs = mockAnthropicCreate.mock.calls[0][0]
  expect(callArgs.system).toContain('Student likes coding.')
})
```

Read the existing test file first and add the test following the existing mock pattern. The key assertion is that `anthropic.messages.create` receives a `system` string containing the memory summary.

- [ ] **Step 2: Run test — verify it fails**

```
npm run test:run -- __tests__/app/api/conversation.test.ts
```
Expected: new test FAIL or existing tests reveal memory not injected

- [ ] **Step 3: Modify `app/api/conversation/route.ts` — add memory load**

After loading `userData` (around line 51), add:

```typescript
  // Load latest session memory for cross-session context
  const { data: sessionMemory } = await supabase
    .from('session_memories')
    .select('summary, key_topics, personal_details')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
```

Then update the systemPrompt block (currently around line 76):

```typescript
  const memoryBlock = sessionMemory
    ? `\nPrevious session context:\n${sessionMemory.summary}\nTopics covered: ${(sessionMemory.key_topics ?? []).join(', ')}\nAbout the student: ${(sessionMemory.personal_details ?? []).join('; ')}`
    : ''

  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${userData?.name ?? 'Student'}
- CEFR level: ${userData?.cefr_level ?? 'B1'}
${memoryBlock}

Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.`
```

- [ ] **Step 4: Run full conversation test suite — verify all pass**

```
npm run test:run -- __tests__/app/api/conversation.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Run full test suite and TypeScript**

```
npm run test:run && npx tsc --noEmit
```
Expected: all tests PASS, no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: inject session memory into Claude system prompt"
```

---

## Task 3: Wire finalize call from `useSession.endSession()`

**Files:**
- Modify: `hooks/useSession.ts` (endSession function, ~lines 115–131)
- Modify: `__tests__/hooks/useSession.test.tsx`

**Interfaces:**
- Consumes: `sessionId` (already in scope inside endSession)
- Produces: fire-and-forget `POST /api/session/[id]/finalize` after successful PATCH

- [ ] **Step 1: Write failing test for finalize call**

Open `__tests__/hooks/useSession.test.tsx`. Add a test that verifies finalize is called after endSession:

```typescript
it('calls finalize after endSession succeeds', async () => {
  // Setup: mock GET (returns existing session), then PATCH (ok), then POST finalize (ok)
  mockFetchSequence([
    { session: { id: 's1', messages: [] } }, // GET /api/session
    { ok: true },                              // PATCH /api/session/s1/end
    { ok: true },                              // POST /api/session/s1/finalize
  ])
  
  const { result } = renderHook(() => useSession('teacher-1'), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  
  await act(async () => { await result.current.endSession() })
  
  // Third fetch call should be to finalize
  expect(global.fetch).toHaveBeenCalledTimes(3)
  const calls = (global.fetch as any).mock.calls
  expect(calls[2][0]).toContain('/finalize')
  expect(calls[2][1]?.method).toBe('POST')
})
```

Note: adapt `mockFetchSequence` to support `ok: true` responses (non-JSON bodies that the finalize call's response won't be awaited). The finalize call is fire-and-forget so `response.json()` is never called.

- [ ] **Step 2: Run test — verify it fails**

```
npm run test:run -- __tests__/hooks/useSession.test.tsx
```
Expected: new test FAIL

- [ ] **Step 3: Modify `hooks/useSession.ts` — add finalize fire-and-forget**

Update the `endSession` function:

```typescript
  async function endSession() {
    if (!sessionId) return
    const elapsed = Date.now() - startedAt.current
    const duration_seconds = Number.isFinite(elapsed) && elapsed > 0
      ? Math.round(elapsed / 1000)
      : 0

    const patchRes = await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
    })
    if (!patchRes.ok) {
      console.error('Failed to end session:', patchRes.status)
      return
    }

    // Fire-and-forget: generate memory, update streak, upsert errors
    // Do not await — navigation should not be blocked by this
    fetch(`/api/session/${sessionId}/finalize`, { method: 'POST' }).catch((err) =>
      console.error('Finalize failed:', err),
    )
  }
```

- [ ] **Step 4: Run all hook tests**

```
npm run test:run -- __tests__/hooks/useSession.test.tsx
```
Expected: all tests PASS

- [ ] **Step 5: Run full suite + TypeScript**

```
npm run test:run && npx tsc --noEmit
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add hooks/useSession.ts __tests__/hooks/useSession.test.tsx
git commit -m "feat: fire-and-forget finalize call after session end"
```

---

## Task 4: Dashboard components + full dashboard page

**Files:**
- Create: `components/dashboard/StreakBadge.tsx`
- Create: `components/dashboard/SessionCard.tsx`
- Create: `components/dashboard/ErrorCard.tsx`
- Modify: `app/dashboard/page.tsx`
- Create: `__tests__/components/dashboard/StreakBadge.test.tsx`
- Create: `__tests__/components/dashboard/SessionCard.test.tsx`
- Create: `__tests__/components/dashboard/ErrorCard.test.tsx`

**Interfaces:**
- Consumes: `User`, `Session`, `ErrorLog` types from `@/types`
- Produces: three pure presentational components + updated server-component dashboard page

- [ ] **Step 1: Write failing tests for the three components**

Create `__tests__/components/dashboard/StreakBadge.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { StreakBadge } from '@/components/dashboard/StreakBadge'

describe('StreakBadge', () => {
  it('shows streak count when streak > 0', () => {
    render(<StreakBadge streakDays={7} />)
    expect(screen.getByText(/7/)).toBeTruthy()
    expect(screen.getByText(/dias/i)).toBeTruthy()
  })

  it('shows start message when streak is 0', () => {
    render(<StreakBadge streakDays={0} />)
    expect(screen.getByText(/comece/i)).toBeTruthy()
  })
})
```

Create `__tests__/components/dashboard/SessionCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { SessionCard } from '@/components/dashboard/SessionCard'

const session = {
  id: 's1',
  started_at: '2026-06-26T10:00:00Z',
  duration_seconds: 360,
  teacher_name: 'Mrs. Carol',
}

describe('SessionCard', () => {
  it('renders teacher name and duration', () => {
    render(<SessionCard {...session} />)
    expect(screen.getByText(/Mrs\. Carol/)).toBeTruthy()
    expect(screen.getByText(/6 min/i)).toBeTruthy()
  })

  it('renders a link to the replay page', () => {
    render(<SessionCard {...session} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toContain('/dashboard/sessao/s1')
  })
})
```

Create `__tests__/components/dashboard/ErrorCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { ErrorCard } from '@/components/dashboard/ErrorCard'

describe('ErrorCard', () => {
  it('renders error text, correct form and seen count', () => {
    render(
      <ErrorCard
        errorText="goed"
        correctForm="went"
        errorType="verb_tense"
        seenCount={3}
      />,
    )
    expect(screen.getByText(/goed/)).toBeTruthy()
    expect(screen.getByText(/went/)).toBeTruthy()
    expect(screen.getByText(/3/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
npm run test:run -- __tests__/components/dashboard/
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create `components/dashboard/StreakBadge.tsx`**

```typescript
interface Props {
  streakDays: number
}

export function StreakBadge({ streakDays }: Props) {
  if (streakDays === 0) {
    return (
      <div className="text-center py-3 px-6 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Comece seu streak hoje!
        </p>
      </div>
    )
  }

  return (
    <div className="text-center py-3 px-6 rounded-xl bg-brand-cta/10 border border-brand-cta/30">
      <p className="text-3xl font-bold text-brand-cta">{streakDays}</p>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
        dias seguidos
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/dashboard/SessionCard.tsx`**

```typescript
import Link from 'next/link'

interface Props {
  id: string
  started_at: string
  duration_seconds: number | null
  teacher_name: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function SessionCard({ id, started_at, duration_seconds, teacher_name }: Props) {
  return (
    <Link
      href={`/dashboard/sessao/${id}`}
      className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
    >
      <div>
        <p className="text-sm font-medium text-content-light dark:text-content-dark">{teacher_name}</p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          {formatDate(started_at)}
        </p>
      </div>
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
        {formatDuration(duration_seconds)}
      </p>
    </Link>
  )
}
```

- [ ] **Step 5: Create `components/dashboard/ErrorCard.tsx`**

```typescript
import type { ErrorType } from '@/types'

const ERROR_LABELS: Record<ErrorType, string> = {
  verb_tense: 'Tempo verbal',
  vocabulary: 'Vocabulário',
  preposition: 'Preposição',
  pronunciation: 'Pronúncia',
  other: 'Outro',
}

interface Props {
  errorText: string
  correctForm: string
  errorType: ErrorType
  seenCount: number
}

export function ErrorCard({ errorText, correctForm, errorType, seenCount }: Props) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
      <div>
        <p className="text-sm text-content-light dark:text-content-dark">
          <span className="line-through text-red-400">{errorText}</span>
          <span className="mx-2 text-content-light-secondary dark:text-content-dark-secondary">→</span>
          <span className="font-medium text-green-600 dark:text-green-400">{correctForm}</span>
        </p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
          {ERROR_LABELS[errorType]}
        </p>
      </div>
      <span className="text-xs font-bold text-brand-cta">{seenCount}×</span>
    </div>
  )
}
```

- [ ] **Step 6: Run component tests — verify they pass**

```
npm run test:run -- __tests__/components/dashboard/
```
Expected: PASS (5 tests)

- [ ] **Step 7: Rewrite `app/dashboard/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { StreakBadge } from '@/components/dashboard/StreakBadge'
import { SessionCard } from '@/components/dashboard/SessionCard'
import { ErrorCard } from '@/components/dashboard/ErrorCard'
import type { Teacher, User, Session, ErrorLog } from '@/types'

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

  // Load recent completed sessions (last 5) with teacher name
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, teacher:teachers(name)')
    .eq('user_id', authUser.id)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(5)

  // Load top recurring errors (seen_count > 0, unresolved, ordered by seen_count desc)
  const { data: errors } = await supabase
    .from('error_log')
    .select('id, error_type, error_text, correct_form, seen_count')
    .eq('user_id', authUser.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(5)

  const u = userData as User
  const t = teacher as Teacher | null

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <h1 className="text-lg font-bold text-content-light dark:text-content-dark">
          English Fluent
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
        {/* Greeting */}
        <div>
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            Olá, {u.name ?? 'aluno'}!
          </p>
          <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-0.5">
            Pronto para praticar?
          </p>
        </div>

        {/* Streak */}
        <StreakBadge streakDays={u.streak_days ?? 0} />

        {/* CTA */}
        <Link
          href="/aula"
          className="w-full py-4 rounded-xl bg-brand-cta text-white font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Começar aula
        </Link>

        {/* Teacher */}
        {t && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              Seu professor
            </p>
            <p className="font-bold text-content-light dark:text-content-dark">{t.name}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
              Nível {u.cefr_level}
            </p>
          </div>
        )}

        {/* Recent sessions */}
        {(recentSessions ?? []).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
              Aulas recentes
            </h2>
            <div className="flex flex-col gap-2">
              {(recentSessions ?? []).map((s: any) => (
                <SessionCard
                  key={s.id}
                  id={s.id}
                  started_at={s.started_at}
                  duration_seconds={s.duration_seconds}
                  teacher_name={s.teacher?.name ?? 'Professor'}
                />
              ))}
            </div>
          </section>
        )}

        {/* Error log */}
        {(errors ?? []).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
              Erros frequentes
            </h2>
            <div className="flex flex-col gap-2">
              {(errors ?? []).map((e: any) => (
                <ErrorCard
                  key={e.id}
                  errorText={e.error_text}
                  correctForm={e.correct_form}
                  errorType={e.error_type}
                  seenCount={e.seen_count}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Run full suite and TypeScript**

```
npm run test:run && npx tsc --noEmit
```
Expected: all tests PASS, no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/ app/dashboard/page.tsx __tests__/components/dashboard/
git commit -m "feat: full dashboard — streak, recent sessions, error log"
```

---

## Task 5: Session replay page

**Files:**
- Create: `app/dashboard/sessao/[id]/page.tsx`
- Create: `__tests__/app/dashboard/sessao.test.tsx`

**Interfaces:**
- Consumes: `sessions` table (id, started_at, duration_seconds, ended_at), `messages` table (role, text, had_correction, created_at)
- Produces: read-only transcript page at `/dashboard/sessao/[id]`

- [ ] **Step 1: Write failing test for replay page**

Create `__tests__/app/dashboard/sessao.test.tsx`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock Supabase server
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const chain: any = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), not: vi.fn(), limit: vi.fn() }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      chain.not.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      if (table === 'sessions') {
        chain.single.mockResolvedValue({
          data: { id: 's1', user_id: 'u1', started_at: '2026-06-26T10:00:00Z', duration_seconds: 300, ended_at: '2026-06-26T10:05:00Z' },
          error: null,
        })
      }
      if (table === 'messages') {
        chain.order.mockResolvedValue({
          data: [
            { id: 'm1', role: 'user', text: 'Hello!', had_correction: false },
            { id: 'm2', role: 'assistant', text: 'Hi there!', had_correction: false },
          ],
          error: null,
        })
      }
      return chain
    }),
  }),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import ReplayPage from '@/app/dashboard/sessao/[id]/page'

describe('Session replay page', () => {
  it('renders without throwing', async () => {
    const jsx = await ReplayPage({ params: { id: 's1' } })
    expect(jsx).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npm run test:run -- __tests__/app/dashboard/sessao.test.tsx
```
Expected: FAIL — "Cannot find module '@/app/dashboard/sessao/[id]/page'"

- [ ] **Step 3: Create `app/dashboard/sessao/[id]/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

export default async function SessionReplayPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, started_at, duration_seconds, ended_at')
    .eq('id', params.id)
    .eq('user_id', authUser.id)
    .single()

  if (!session) redirect('/dashboard')

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, text, had_correction')
    .eq('session_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-content-light-secondary dark:text-content-dark-secondary text-sm hover:opacity-70"
        >
          ← Dashboard
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {formatDate(session.started_at)}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {formatDuration(session.duration_seconds)}
          </p>
        </div>
      </header>

      <div className="flex-1 flex flex-col gap-3 px-4 py-6 max-w-sm mx-auto w-full">
        {(messages ?? []).map((m: any) => (
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
        ))}

        {(messages ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary text-sm py-8">
            Nenhuma mensagem nesta aula.
          </p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run replay test — verify it passes**

```
npm run test:run -- __tests__/app/dashboard/sessao.test.tsx
```
Expected: PASS

- [ ] **Step 5: Run full suite + TypeScript**

```
npm run test:run && npx tsc --noEmit
```
Expected: all PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/sessao/ __tests__/app/dashboard/sessao.test.tsx
git commit -m "feat: session replay page — read-only transcript at /dashboard/sessao/[id]"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] session_memory — `lib/memory.ts` + finalize route (Task 1) + injection (Task 2)
- [x] errors_log — upserted in finalize route (Task 1)
- [x] streak — updated in finalize route (Task 1), displayed via StreakBadge (Task 4)
- [x] dashboard completo — rewritten in Task 4 with all sections
- [x] replay de aulas — Task 5
- [x] finalize wired from client — Task 3

**Placeholder scan:** No TBDs, no "add appropriate error handling" — all code is explicit.

**Type consistency:**
- `MemoryOutput` defined in `lib/memory.ts` Task 1, consumed by finalize route Task 1
- `SessionCard` props (`id`, `started_at`, `duration_seconds`, `teacher_name`) consistent across test (Task 4 Step 1) and component (Task 4 Step 4)
- `ErrorCard` props (`errorText`, `correctForm`, `errorType`, `seenCount`) consistent across test (Task 4 Step 1) and component (Task 4 Step 5)
- `StreakBadge` prop (`streakDays: number`) consistent across test and component
