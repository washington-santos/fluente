# Quota Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block `POST /api/conversation` when a user has consumed their plan's monthly minute allowance, and surface a friendly UI state so the student knows why the mic stopped working.

**Architecture:** Two-layer enforcement — the API checks usage at request time and returns `429 { error: 'quota_exceeded', minutesUsed, minutesLimit }` before doing any AI work; the `useSession` hook detects the 429 and flips a `quotaExceeded` boolean; `AulaClient` renders a full banner replacing the record controls when that flag is set. No new DB tables or migrations needed — `usage_log.whisper_minutes` and `subscriptions.plan_id → plans.minutes_per_month` already exist.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase SSR (`createSupabaseServer`), Tailwind CSS design tokens, Vitest + @testing-library/react

## Global Constraints

- App Router only — no Pages Router
- Supabase client in API routes: `createSupabaseServer()` from `@/lib/supabase-server`
- Auth guard: `supabase.auth.getUser()` → 401 if no user (already exists in the route)
- Brazil date offset: `new Date(Date.now() - 3 * 60 * 60 * 1000)` — usage_log dates are stored in UTC-3; the month boundary must use the same offset
- Free plan fallback: if no `subscriptions` row with `status = 'active'` exists, limit is **10 minutes**
- Response shape on 429: `{ error: 'quota_exceeded', minutesUsed: number, minutesLimit: number }`
- UI copy in Portuguese; numbers formatted with `toFixed(1)` for minute display
- Tailwind classes only from `tailwind.config.ts` design tokens: `surface-light`, `surface-light-card`, `surface-dark`, `surface-dark-card`, `content-light`, `content-light-secondary`, `content-dark`, `content-dark-secondary`, `brand-cta`
- Icons: Lucide React only
- Test runner: `npm run test:run` (Vitest); TypeScript check: `npx tsc --noEmit`
- No new npm packages

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/conversation/route.ts` | Modify | Add quota check at start of POST handler, before any AI work |
| `hooks/useSession.ts` | Modify | Detect 429 in `sendTurn`, expose `quotaExceeded: boolean` |
| `app/aula/AulaClient.tsx` | Modify | Render quota-exceeded banner when `quotaExceeded` is true |
| `__tests__/app/api/conversation.test.ts` | Modify | Add quota enforcement test cases |
| `__tests__/hooks/useSession.test.tsx` | Modify | Add quota detection test cases |

---

### Task 1: API quota check in `POST /api/conversation`

**Files:**
- Modify: `app/api/conversation/route.ts` (add quota check after auth, before transcription)
- Modify: `__tests__/app/api/conversation.test.ts` (add 3 quota test cases)

**Interfaces:**
- Consumes: existing `createSupabaseServer`, `user.id` already fetched at line 23
- Produces: `429 { error: 'quota_exceeded', minutesUsed: number, minutesLimit: number }` — consumed by Task 2

- [ ] **Step 1: Read the existing test file to understand mock structure**

Run: `cat __tests__/app/api/conversation.test.ts`

You need to understand how Supabase is mocked before adding new test cases. The existing tests use `vi.mock('@/lib/supabase-server')` with a chainable mock. Note the pattern for mocking `.from().select().eq()...` chains.

- [ ] **Step 2: Write 3 failing quota tests**

In `__tests__/app/api/conversation.test.ts`, add a new `describe('quota enforcement')` block. Add these 3 tests inside it:

```typescript
describe('quota enforcement', () => {
  it('returns 429 when free user has used 10+ minutes this month', async () => {
    // Mock auth
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } }, error: null,
    })
    // Mock subscriptions — no active subscription (free user)
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () =>
            Promise.resolve({ data: null, error: null })
          }) }) }),
        }
      }
      if (table === 'usage_log') {
        return {
          select: () => ({ eq: () => ({ gte: () =>
            Promise.resolve({ data: [{ whisper_minutes: 10.5 }], error: null })
          }) }),
        }
      }
      // sessions, teachers, users — not reached; return empty
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }
    })

    const form = new FormData()
    form.append('session_id', 'sess-1')
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'r.webm')
    const req = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const { POST } = await import('@/app/api/conversation/route')
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('quota_exceeded')
    expect(body.minutesUsed).toBeCloseTo(10.5)
    expect(body.minutesLimit).toBe(10)
  })

  it('returns 429 when basic subscriber has used 120+ minutes', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-2' } }, error: null,
    })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () =>
            Promise.resolve({ data: { plan_id: 'basic', plans: { minutes_per_month: 120 } }, error: null })
          }) }) }),
        }
      }
      if (table === 'usage_log') {
        return {
          select: () => ({ eq: () => ({ gte: () =>
            Promise.resolve({ data: [{ whisper_minutes: 60 }, { whisper_minutes: 61 }], error: null })
          }) }),
        }
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }
    })

    const form = new FormData()
    form.append('session_id', 'sess-2')
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'r.webm')
    const req = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const { POST } = await import('@/app/api/conversation/route')
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('quota_exceeded')
    expect(body.minutesUsed).toBeCloseTo(121)
    expect(body.minutesLimit).toBe(120)
  })

  it('proceeds normally when user is within quota', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-3' } }, error: null,
    })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () =>
            Promise.resolve({ data: { plan_id: 'pro', plans: { minutes_per_month: 300 } }, error: null })
          }) }) }),
        }
      }
      if (table === 'usage_log') {
        return {
          select: () => ({ eq: () => ({ gte: () =>
            Promise.resolve({ data: [{ whisper_minutes: 5 }], error: null })
          }) }),
        }
      }
      // Other tables — return nulls; this test only checks we do NOT get 429,
      // so it's fine if the pipeline fails downstream on missing session/teacher data
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
      }
    })
    // This test only verifies that we do NOT return 429; the full pipeline is covered by existing tests.
    // We expect the response to not be 429 (it may be 500 if downstream mocks aren't set up, that's fine).
    const form = new FormData()
    form.append('session_id', 'sess-3')
    form.append('panic_text', 'Hello')
    const req = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const { POST } = await import('@/app/api/conversation/route')
    const res = await POST(req)

    expect(res.status).not.toBe(429)
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`

Expected: the 3 new tests FAIL (quota check does not exist yet). Existing tests should still pass.

- [ ] **Step 4: Add the quota check to `app/api/conversation/route.ts`**

Insert this block immediately after the auth check (after line 24 `if (!user) return ...`) and before the `formData` parsing. Add it as a self-contained block:

```typescript
  // ── Quota check ─────────────────────────────────────────────────────────
  // Brazil UTC-3 — consistent with usage_log date storage
  const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const firstOfMonth = `${nowBR.getUTCFullYear()}-${String(nowBR.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [{ data: subData }, { data: usageRows }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan_id, plans!inner(minutes_per_month)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('usage_log')
      .select('whisper_minutes')
      .eq('user_id', user.id)
      .gte('date', firstOfMonth),
  ])

  const minutesLimit: number = subData
    ? (subData.plans as unknown as { minutes_per_month: number }).minutes_per_month
    : 10 // free plan default

  const minutesUsed: number = (usageRows ?? []).reduce(
    (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
    0,
  )

  if (minutesUsed >= minutesLimit) {
    return NextResponse.json(
      { error: 'quota_exceeded', minutesUsed, minutesLimit },
      { status: 429 },
    )
  }
  // ── End quota check ──────────────────────────────────────────────────────
```

- [ ] **Step 5: Run the tests again**

Run: `npm run test:run -- __tests__/app/api/conversation.test.ts`

Expected: all tests PASS including the 3 new ones.

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: quota enforcement — block /api/conversation when monthly minutes exceeded"
```

---

### Task 2: Client quota state + UI banner

**Files:**
- Modify: `hooks/useSession.ts` (detect 429, expose `quotaExceeded` boolean)
- Modify: `app/aula/AulaClient.tsx` (render quota-exceeded banner)
- Modify: `__tests__/hooks/useSession.test.tsx` (add quota detection tests)

**Interfaces:**
- Consumes: `429 { error: 'quota_exceeded', minutesUsed: number, minutesLimit: number }` from Task 1
- Produces: `useSession` now returns `quotaExceeded: boolean` and `quotaInfo: { minutesUsed: number; minutesLimit: number } | null`

- [ ] **Step 1: Read the existing useSession test file**

Run: `cat __tests__/hooks/useSession.test.tsx`

Note how `fetch` is mocked (usually `vi.stubGlobal('fetch', ...)` or `vi.fn()`). You need to match that pattern.

- [ ] **Step 2: Write 2 failing quota tests for useSession**

In `__tests__/hooks/useSession.test.tsx`, add a `describe('quota detection')` block:

```typescript
describe('quota detection', () => {
  it('sets quotaExceeded=true and stores quotaInfo when conversation returns 429', async () => {
    // Setup: session already initialized (sessionId set)
    // Mock fetch: POST /api/conversation returns 429
    const fetchMock = vi.fn()
    // First call: GET /api/session → existing session
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ session: { id: 'sess-1', messages: [] } }),
    })
    // Second call: POST /api/conversation → 429
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'quota_exceeded', minutesUsed: 10.5, minutesLimit: 10 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendTurn('Hello')
    })

    expect(result.current.quotaExceeded).toBe(true)
    expect(result.current.quotaInfo).toEqual({ minutesUsed: 10.5, minutesLimit: 10 })
    expect(result.current.turnError).toBeNull()
  })

  it('does not set quotaExceeded for non-429 errors', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ session: { id: 'sess-2', messages: [] } }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'internal' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSession('teacher-2'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendTurn('Hello')
    })

    expect(result.current.quotaExceeded).toBe(false)
    expect(result.current.quotaInfo).toBeNull()
    expect(result.current.turnError).toBe('Erro ao enviar. Tente novamente.')
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`

Expected: the 2 new tests FAIL. Existing tests still pass.

- [ ] **Step 4: Update `hooks/useSession.ts`**

Add `quotaExceeded` and `quotaInfo` to the interface and state. Update `sendTurn` to handle 429:

```typescript
// Add to interface UseSessionReturn (after turnError line):
  quotaExceeded: boolean
  quotaInfo: { minutesUsed: number; minutesLimit: number } | null

// Add state inside useSession function (after turnError state):
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState<{ minutesUsed: number; minutesLimit: number } | null>(null)

// Replace the existing sendTurn error handling block:
      const res = await fetch('/api/conversation', { method: 'POST', body: form })
      if (!res.ok) {
        if (res.status === 429) {
          const body = await res.json() as { minutesUsed: number; minutesLimit: number }
          setQuotaExceeded(true)
          setQuotaInfo({ minutesUsed: body.minutesUsed, minutesLimit: body.minutesLimit })
        } else {
          setTurnError('Erro ao enviar. Tente novamente.')
        }
        return null
      }

// Update return statement to include new values:
  return { sessionId, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, sendTurn, endSession }
```

- [ ] **Step 5: Run the hook tests**

Run: `npm run test:run -- __tests__/hooks/useSession.test.tsx`

Expected: all tests PASS.

- [ ] **Step 6: Update `app/aula/AulaClient.tsx`**

Destructure the new values from `useSession` and add a quota banner. Replace the `useSession` call and add the quota UI:

```typescript
// Replace line 21:
  const { messages, loading, sending, turnError, initError, quotaExceeded, quotaInfo, sendTurn, endSession } = useSession(teacher.id)

// Add the quota banner just before the return statement's closing tag.
// Insert it inside the bottom controls div (the shrink-0 px-4 py-6 div),
// REPLACING the RecordButton + PanicButton section with this conditional:

        {quotaExceeded ? (
          <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-5 flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">
              Limite do plano atingido
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
              Você usou {quotaInfo?.minutesUsed.toFixed(1)} de {quotaInfo?.minutesLimit} minutos este mês.
            </p>
            <a
              href="/planos"
              className="mt-1 px-4 py-2 rounded-lg bg-brand-cta text-white text-sm hover:opacity-90 transition-opacity"
            >
              Ver planos
            </a>
          </div>
        ) : (
          <>
            {(micError || turnError) && (
              <p role="alert" className="text-xs text-red-500 text-center">{micError || turnError}</p>
            )}
            <RecordButton
              isRecording={isRecording}
              onPressStart={startRecording}
              onPressEnd={stopRecording}
              disabled={sending || loading}
            />
            <PanicButton onSubmit={(text) => handleTurn(text)} disabled={sending || loading || isRecording} />
          </>
        )}
```

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 8: Run full test suite**

Run: `npm run test:run`

Expected: all 116+ tests PASS.

- [ ] **Step 9: Commit**

```bash
git add hooks/useSession.ts app/aula/AulaClient.tsx __tests__/hooks/useSession.test.tsx
git commit -m "feat: quota UI — show limit-reached banner with upgrade link in /aula"
```
