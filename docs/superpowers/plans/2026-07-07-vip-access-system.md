# VIP Access System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a list of authorized emails — stored in the database, not in code — to bypass all demo/quota limits and receive full Pro access automatically.

**Architecture:** A `vip_users` table in Supabase stores authorized emails. A centralized `lib/vip.ts` module exports `isUserVip(email)` which any server-side code calls to determine VIP status. VIP bypass is injected at each enforcement point (conversation route, aula page guard, dashboard) without modifying the underlying demo/subscription logic. An admin panel page at `/admin/vip` provides full CRUD.

**Tech Stack:** Next.js 14 App Router (Server Components + API Routes), Supabase (service role for admin reads/writes), TypeScript, Tailwind design tokens.

## Global Constraints

- Design tokens ONLY — `bg-surface-light`, `bg-brand-cta`, `text-content-light`, `bg-surface-light-card`, `dark:bg-surface-dark-card`, `border-surface-light-card`, `border-brand-interactive`. NEVER raw hex or raw Tailwind scale colors.
- `text-white` allowed ONLY on `bg-brand-cta` elements.
- `createSupabaseAdmin()` from `@/lib/supabase-admin` for all VIP reads/writes (service role bypasses RLS).
- `createSupabaseServer()` from `@/lib/supabase-server` for user-facing server components.
- Admin access gated by `ADMIN_EMAILS` env var — same pattern as `app/admin/layout.tsx`.
- API routes protecting admin endpoints must verify admin status server-side before any data operation.
- VIP check must be server-side only — never trust client-provided VIP flag.
- `isUserVip` always returns `VipUser | null` — callers check for truthiness.
- All test files for API routes: `// @vitest-environment node`. Component tests: `// @vitest-environment jsdom`.
- Commit messages use `feat:` / `fix:` prefix.

---

## File Map

**Create:**
- `supabase/migrations/20260707000001_vip_users.sql` — DB table
- `lib/vip.ts` — `isUserVip(email)` + `VipUser` re-export
- `app/api/admin/vip/route.ts` — GET (list) + POST (add)
- `app/api/admin/vip/[id]/route.ts` — PATCH (update) + DELETE (remove)
- `app/admin/vip/page.tsx` — Admin VIP management page (Client Component)
- `components/dashboard/VipBadge.tsx` — Small VIP badge component
- `__tests__/lib/vip.test.ts` — Unit tests for isUserVip
- `__tests__/api/admin/vip.test.ts` — API route tests
- `__tests__/components/dashboard/VipBadge.test.tsx` — Badge tests

**Modify:**
- `types/index.ts` — add `VipUser` interface
- `app/api/conversation/route.ts` — VIP bypass before quota check
- `app/aula/page.tsx` — VIP bypass before demo guard
- `app/dashboard/page.tsx` — pass isVip + render VipBadge, hide upgrade prompts
- `app/admin/layout.tsx` — add VIP nav item

---

### Task 1: DB Migration — vip_users table

**Files:**
- Create: `supabase/migrations/20260707000001_vip_users.sql`

**Interfaces:**
- Produces: `vip_users` table with columns `id uuid`, `email text unique`, `plan text`, `active boolean`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260707000001_vip_users.sql
CREATE TABLE IF NOT EXISTS public.vip_users (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text          NOT NULL UNIQUE,
  plan        text          NOT NULL DEFAULT 'pro',
  active      boolean       NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- RLS: only service role can read/write (admin panel uses service role key)
ALTER TABLE public.vip_users ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon/authenticated keys; only service role bypasses RLS

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER vip_users_updated_at
  BEFORE UPDATE ON public.vip_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260707000001_vip_users.sql
git commit -m "feat: add vip_users table with RLS and updated_at trigger"
```

---

### Task 2: TypeScript types + `lib/vip.ts`

**Files:**
- Modify: `types/index.ts`
- Create: `lib/vip.ts`
- Create: `__tests__/lib/vip.test.ts`

**Interfaces:**
- Produces: `VipUser` interface exported from `@/types`
- Produces: `isUserVip(email: string): Promise<VipUser | null>` exported from `@/lib/vip`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/vip.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isUserVip } from '@/lib/vip'

function makeSupabase(result: unknown) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return chain
}

describe('isUserVip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns VipUser when email is in vip_users and active', async () => {
    const vipRecord = { id: 'abc', email: 'vip@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const sb = makeSupabase({ data: vipRecord, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('vip@test.com')
    expect(result).toEqual(vipRecord)
  })

  it('returns null when email is not in vip_users', async () => {
    const sb = makeSupabase({ data: null, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('regular@test.com')
    expect(result).toBeNull()
  })

  it('returns null when vip record exists but active = false', async () => {
    const vipRecord = { id: 'abc', email: 'inactive@test.com', plan: 'pro', active: false, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const sb = makeSupabase({ data: vipRecord, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('inactive@test.com')
    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    const sb = makeSupabase({ data: null, error: { message: 'connection failed' } })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('any@test.com')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/lib/vip.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/vip'`

- [ ] **Step 3: Add VipUser to `types/index.ts`**

Add after the `LearningPlan` interface (end of file):

```typescript
export interface VipUser {
  id: string
  email: string
  plan: string
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Create `lib/vip.ts`**

```typescript
import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import type { VipUser } from '@/types'

/**
 * Returns the VipUser record if the email is in vip_users and active=true.
 * Returns null if not VIP, not active, or on DB error.
 * Uses service role — safe to call from any server-side context.
 */
export async function isUserVip(email: string): Promise<VipUser | null> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('vip_users')
    .select('*')
    .eq('email', email)
    .eq('active', true)
    .maybeSingle()

  if (error || !data) return null
  return data as VipUser
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/lib/vip.test.ts
```
Expected: 4/4 PASS

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/vip.ts __tests__/lib/vip.test.ts
git commit -m "feat: add VipUser type and isUserVip centralized check"
```

---

### Task 3: VIP bypass in conversation route + aula page

**Files:**
- Modify: `app/api/conversation/route.ts` (add VIP bypass before quota block, ~line 32)
- Modify: `app/aula/page.tsx` (add VIP bypass before demo guard)
- Create: `__tests__/api/conversation/vip-bypass.test.ts`

**Interfaces:**
- Consumes: `isUserVip(email: string): Promise<VipUser | null>` from `@/lib/vip`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/conversation/vip-bypass.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock isUserVip
vi.mock('@/lib/vip', () => ({
  isUserVip: vi.fn(),
}))

// Re-use the existing conversation mock pattern
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(),
}))
vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('openai', () => ({
  default: class { audio = { transcriptions: { create: vi.fn().mockResolvedValue({ text: 'hello' }) } }; messages = { create: vi.fn().mockResolvedValue({ content: [{ text: JSON.stringify({ reply: 'Hi!', correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null, suggested_replies: null, reply_pt: null, prompt_hint: null }) }] }) } },
}))
vi.mock('@/lib/tts', () => ({ synthesizeTts: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/did', () => ({ createTalk: vi.fn().mockResolvedValue(null), DID_VOICE_IDS: {} }))
vi.mock('@/lib/topics', () => ({ getTopicByKey: vi.fn().mockReturnValue(null) }))

import { isUserVip } from '@/lib/vip'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { POST } from '@/app/api/conversation/route'

const mockVipUser = { id: 'v1', email: 'vip@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {}
  const chainFn = () => chain
  chain.from = vi.fn((table: string) => {
    if (table === 'sessions') return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 's1', teacher_id: 't1', mode: 'free', started_at: '2026-01-01', topic: null }, error: null }) })) })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }
    if (table === 'users') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'u1', demo_status: null, demo_started_at: null, demo_expires_at: null }, error: null }) })) })), update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
    if (table === 'subscriptions') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) }
    return { select: vi.fn(chainFn), eq: vi.fn(chainFn), gte: vi.fn(chainFn), insert: vi.fn().mockResolvedValue({ error: null }), upsert: vi.fn().mockResolvedValue({ error: null }), update: vi.fn(chainFn), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), single: vi.fn().mockResolvedValue({ data: null, error: null }), limit: vi.fn(chainFn), order: vi.fn(chainFn), is: vi.fn(chainFn), ...overrides }
  })
  chain.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'vip@test.com' } } }) }
  return chain
}

describe('VIP bypass in conversation route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows VIP user even with no demo and no subscription', async () => {
    vi.mocked(isUserVip).mockResolvedValue(mockVipUser)
    const sb = makeSupabase()
    vi.mocked(createSupabaseServer).mockReturnValue(sb as ReturnType<typeof createSupabaseServer>)
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const formData = new FormData()
    formData.append('panic_text', 'hello')
    formData.append('session_id', 's1')

    const req = new Request('http://localhost/api/conversation', { method: 'POST', body: formData })
    const res = await POST(req)
    // Should NOT return 403 demo_required
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/api/conversation/vip-bypass.test.ts
```
Expected: FAIL — test gets 403 because VIP bypass not implemented

- [ ] **Step 3: Modify `app/api/conversation/route.ts`**

Add the import at the top (after existing imports):
```typescript
import { isUserVip } from '@/lib/vip'
```

Insert VIP bypass as the FIRST thing inside the quota check block (after the `if (quotaSubError || quotaDemoError)` error check, before the `if (subData)` branch). The new block goes right before `if (subData) {`:

```typescript
  // ── VIP bypass ──────────────────────────────────────────────────────────
  const vipUser = await isUserVip(user.email ?? '')
  if (vipUser) {
    // VIP users bypass all quota and demo checks — proceed directly to AI
  } else {
  // ── End VIP bypass (the existing quota logic becomes the else body) ──
```

And close the `else` block right before `// ── End quota check ──────`.

In practice: wrap the entire existing `if (subData) { ... } else { ... }` block inside `if (!vipUser) { ... }`.

- [ ] **Step 4: Modify `app/aula/page.tsx`**

Add import:
```typescript
import { isUserVip } from '@/lib/vip'
```

After fetching `activeSub`, add VIP bypass:
```typescript
  const vipUser = await isUserVip(authUser.email ?? '')

  if (!activeSub && !vipUser) {
    const demoStatus = userData.demo_status as string | null
    const isExpired = demoStatus === 'expired' || demoStatus === 'exhausted'
    const isTimeExpired =
      userData.demo_expires_at && new Date(userData.demo_expires_at) <= new Date()

    if (!demoStatus || isExpired || isTimeExpired) {
      redirect('/planos?demo_ended=1')
    }
  }
```

(Replace the existing `if (!activeSub) { ... }` block.)

- [ ] **Step 5: Run tests**

```bash
npx vitest run __tests__/api/conversation/vip-bypass.test.ts __tests__/app/aula/demo-guard.test.ts
```
Expected: PASS (the aula test mocks don't have VIP so they test the non-VIP path, which still works)

- [ ] **Step 6: Commit**

```bash
git add app/api/conversation/route.ts app/aula/page.tsx __tests__/api/conversation/vip-bypass.test.ts
git commit -m "feat: add VIP bypass in conversation route and aula page guard"
```

---

### Task 4: VipBadge component + dashboard integration

**Files:**
- Create: `components/dashboard/VipBadge.tsx`
- Modify: `app/dashboard/page.tsx`
- Create: `__tests__/components/dashboard/VipBadge.test.tsx`

**Interfaces:**
- Consumes: `isUserVip(email: string): Promise<VipUser | null>` from `@/lib/vip`
- Consumes: `VipUser` from `@/types`
- Produces: `<VipBadge plan={string} />` — renders only when called; caller decides when to render

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/components/dashboard/VipBadge.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VipBadge } from '@/components/dashboard/VipBadge'

describe('VipBadge', () => {
  it('renders the VIP badge with plan name', () => {
    render(<VipBadge plan="pro" />)
    expect(screen.getByText(/VIP/i)).toBeInTheDocument()
  })

  it('shows the star icon', () => {
    render(<VipBadge plan="pro" />)
    expect(screen.getByText('⭐')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/components/dashboard/VipBadge.test.tsx
```
Expected: FAIL — `Cannot find module '@/components/dashboard/VipBadge'`

- [ ] **Step 3: Create `components/dashboard/VipBadge.tsx`**

```typescript
interface Props {
  plan: string
}

export function VipBadge({ plan }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-interactive/10 border border-brand-interactive/30">
      <span className="text-xs">⭐</span>
      <span className="text-xs font-semibold text-brand-interactive uppercase tracking-wide">
        VIP · {plan}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/components/dashboard/VipBadge.test.tsx
```
Expected: 2/2 PASS

- [ ] **Step 5: Modify `app/dashboard/page.tsx`**

Add imports:
```typescript
import { isUserVip } from '@/lib/vip'
import { VipBadge } from '@/components/dashboard/VipBadge'
```

After `const u = userData as User` (around line 93), add the VIP check:
```typescript
  const vipUser = await isUserVip(authUser.email ?? '')
```

In the JSX, after `<StreakBadge streakDays={u.streak_days ?? 0} />` and BEFORE `<DemoStatusCard>`, add:
```tsx
        {vipUser && <VipBadge plan={vipUser.plan} />}
```

For the `<DemoStatusCard>`, wrap it so it only renders when NOT VIP:
```tsx
        {!vipUser && (
          <DemoStatusCard
            demoStatus={effectiveUser.demo_status}
            demoExpiresAt={effectiveUser.demo_expires_at}
            demoMinutesUsed={demoMinutesUsed}
            demoMinutesLimit={DEMO_MINUTES_LIMIT}
          />
        )}
```

Update the plan label in the "Planos e assinaturas" link:
```tsx
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              {vipUser
                ? `Plano VIP · ${vipUser.plan}`
                : effectiveUser.plan_id === 'demo'
                ? 'Demonstração Premium'
                : effectiveUser.plan_id
                ? `Plano ${effectiveUser.plan_id}`
                : 'Sem plano'}
            </p>
```

Also wrap the auto-start block so it only runs when not VIP:
```typescript
  let effectiveUser = u
  if (!vipUser && !u.demo_status && (u.plan_id === null || u.plan_id === 'free')) {
    // ... existing auto-start logic unchanged ...
  }
```

- [ ] **Step 6: Run the full suite**

```bash
npx vitest run
```
Expected: all tests PASS (dashboard page is a Server Component so its logic is tested implicitly via the component tests)

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/VipBadge.tsx app/dashboard/page.tsx __tests__/components/dashboard/VipBadge.test.tsx
git commit -m "feat: add VipBadge and VIP-aware dashboard rendering"
```

---

### Task 5: Admin VIP API routes

**Files:**
- Create: `app/api/admin/vip/route.ts` — GET list + POST add
- Create: `app/api/admin/vip/[id]/route.ts` — PATCH update + DELETE remove
- Create: `__tests__/api/admin/vip.test.ts`

**Interfaces:**
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin`
- Consumes: admin email check via `ADMIN_EMAILS` env var (same as admin layout)
- Produces:
  - `GET /api/admin/vip?q=<search>` → `{ data: VipUser[] }`
  - `POST /api/admin/vip` body `{ email, plan?, notes? }` → `{ data: VipUser }`
  - `PATCH /api/admin/vip/[id]` body `{ plan?, active?, notes? }` → `{ data: VipUser }`
  - `DELETE /api/admin/vip/[id]` → `{ success: true }`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/admin/vip.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@test.com' } } }) },
  })),
}))

process.env.ADMIN_EMAILS = 'admin@test.com'

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { GET, POST } from '@/app/api/admin/vip/route'
import { PATCH, DELETE } from '@/app/api/admin/vip/[id]/route'

const mockVipList = [
  { id: '1', email: 'a@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
]

function makeAdminSb(listResult = mockVipList) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ data: listResult, error: null }),
        order: vi.fn(() => ({ ilike: vi.fn().mockResolvedValue({ data: listResult, error: null }) })),
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: listResult[0] ?? null, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: '2', email: 'new@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { ...mockVipList[0], active: false }, error: null }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  }
}

describe('GET /api/admin/vip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 for non-admin email', async () => {
    const { createSupabaseServer } = await import('@/lib/supabase-server')
    vi.mocked(createSupabaseServer).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'notadmin@test.com' } } }) },
    } as ReturnType<typeof createSupabaseServer>)
    const req = new Request('http://localhost/api/admin/vip')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of VIP users', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(makeAdminSb() as ReturnType<typeof createSupabaseAdmin>)
    const req = new Request('http://localhost/api/admin/vip')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })
})

describe('POST /api/admin/vip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new VIP user', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(makeAdminSb() as ReturnType<typeof createSupabaseAdmin>)
    const req = new Request('http://localhost/api/admin/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@test.com', plan: 'pro' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.email).toBe('new@test.com')
  })
})

describe('PATCH /api/admin/vip/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates active status', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(makeAdminSb() as ReturnType<typeof createSupabaseAdmin>)
    const req = new Request('http://localhost/api/admin/vip/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    })
    const res = await PATCH(req, { params: { id: '1' } })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/vip/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a VIP user', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(makeAdminSb() as ReturnType<typeof createSupabaseAdmin>)
    const req = new Request('http://localhost/api/admin/vip/1', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: '1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/api/admin/vip.test.ts
```
Expected: FAIL — routes don't exist

- [ ] **Step 3: Create `app/api/admin/vip/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

async function verifyAdmin(): Promise<boolean> {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user && ADMIN_EMAILS.includes(user.email ?? '')
}

export async function GET(request: Request) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').replace(/[,%()]/g, '')

  const supabase = createSupabaseAdmin()
  let query = supabase.from('vip_users').select('*').order('created_at', { ascending: false })
  if (q) query = (query as unknown as { ilike: (col: string, val: string) => typeof query }).ilike('email', `%${q}%`) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { email?: string; plan?: string; notes?: string }
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('vip_users')
    .insert({ email: body.email.toLowerCase().trim(), plan: body.plan ?? 'pro', notes: body.notes ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ data }, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/admin/vip/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

async function verifyAdmin(): Promise<boolean> {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user && ADMIN_EMAILS.includes(user.email ?? '')
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { plan?: string; active?: boolean; notes?: string }
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('vip_users')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdmin()
  const { error } = await supabase.from('vip_users').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run __tests__/api/admin/vip.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/vip/route.ts "app/api/admin/vip/[id]/route.ts" __tests__/api/admin/vip.test.ts
git commit -m "feat: add admin VIP API routes (GET, POST, PATCH, DELETE)"
```

---

### Task 6: Admin VIP management page

**Files:**
- Create: `app/admin/vip/page.tsx`
- Modify: `app/admin/layout.tsx` — add VIP nav link

**Interfaces:**
- Consumes: `GET /api/admin/vip`, `POST /api/admin/vip`, `PATCH /api/admin/vip/[id]`, `DELETE /api/admin/vip/[id]`
- Produces: `/admin/vip` page with search, add form, toggle active, change plan, delete

**Note:** This page is a Client Component (uses `useState`/`useEffect` for real-time CRUD without page reload). No test needed — UI CRUD logic is integration-level; the underlying API routes are tested in Task 5.

- [ ] **Step 1: Create `app/admin/vip/page.tsx`**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

interface VipUser {
  id: string
  email: string
  plan: string
  active: boolean
  notes: string | null
  created_at: string
}

export default function AdminVipPage() {
  const [users, setUsers] = useState<VipUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPlan, setNewPlan] = useState('pro')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/vip?q=${encodeURIComponent(q)}`)
    const body = await res.json() as { data: VipUser[] }
    setUsers(body.data ?? [])
    setLoading(false)
  }, [q])

  useEffect(() => { void fetchUsers() }, [fetchUsers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setAdding(true)
    setError(null)
    const res = await fetch('/api/admin/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), plan: newPlan, notes: newNotes || null }),
    })
    if (!res.ok) {
      const b = await res.json() as { error: string }
      setError(b.error ?? 'Erro ao adicionar')
    } else {
      setNewEmail('')
      setNewNotes('')
      void fetchUsers()
    }
    setAdding(false)
  }

  async function handleToggle(user: VipUser) {
    await fetch(`/api/admin/vip/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    })
    void fetchUsers()
  }

  async function handlePlanChange(user: VipUser, plan: string) {
    await fetch(`/api/admin/vip/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    void fetchUsers()
  }

  async function handleDelete(user: VipUser) {
    if (!confirm(`Remover ${user.email} dos VIPs?`)) return
    await fetch(`/api/admin/vip/${user.id}`, { method: 'DELETE' })
    void fetchUsers()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Usuários VIP
        </h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar email…"
          className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
        />
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="mb-6 p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-3">
        <p className="text-sm font-semibold text-content-light dark:text-content-dark">Adicionar VIP</p>
        <div className="flex gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="email@exemplo.com"
            required
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
          />
          <select
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none"
          >
            <option value="pro">Pro</option>
            <option value="annual">Anual</option>
            <option value="vip">VIP</option>
          </select>
        </div>
        <input
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={adding}
          className="self-start px-4 py-2 rounded-lg bg-brand-cta text-content-dark text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {adding ? 'Adicionando…' : 'Adicionar'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Carregando…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Nenhum usuário VIP.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                u.active
                  ? 'border-brand-interactive/30 bg-surface-light-card dark:bg-surface-dark-card'
                  : 'border-surface-light-card dark:border-surface-dark-card opacity-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content-light dark:text-content-dark truncate">{u.email}</p>
                {u.notes && (
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5 truncate">{u.notes}</p>
                )}
              </div>
              <select
                value={u.plan}
                onChange={(e) => void handlePlanChange(u, e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
              >
                <option value="pro">Pro</option>
                <option value="annual">Anual</option>
                <option value="vip">VIP</option>
              </select>
              <button
                onClick={() => void handleToggle(u)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                  u.active
                    ? 'bg-brand-interactive/10 text-brand-interactive hover:bg-brand-interactive/20'
                    : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary hover:bg-surface-light dark:hover:bg-surface-dark'
                }`}
              >
                {u.active ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={() => void handleDelete(u)}
                className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Modify `app/admin/layout.tsx` — add VIP nav link**

In the `NAV` array, add:
```typescript
  { href: '/admin/vip', label: 'VIP' },
```
(after `{ href: '/admin/custos', label: 'Custos de AI' }`)

- [ ] **Step 3: Run full suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add app/admin/vip/page.tsx app/admin/layout.tsx
git commit -m "feat: add admin VIP management page with add/toggle/delete/search"
```
