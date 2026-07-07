# Plans Page Redesign & Demo System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent free plan with a 7-day / 30-minute "Demonstração Premium", enforce demo limits on the backend, and redesign the plans page with premium copy and visual quality inspired by Stripe/Linear/Vercel.

**Architecture:** New `demo_started_at / demo_expires_at / demo_status` columns on the `users` table track demo state. The conversation quota check is refactored to handle demo users separately from subscribers. A new `PlansGrid` client component handles framer-motion card animations; a `DemoStartButton` client component calls the new `POST /api/demo/start` endpoint. A `DemoStatusCard` in the dashboard shows days and minutes remaining, and auto-start logic fires on first dashboard visit.

**Tech Stack:** Next.js 14 App Router (Server + Client Components), Supabase SSR, TypeScript, Tailwind (design tokens), framer-motion (already installed), Vitest + Testing Library

## Global Constraints

- Design tokens ONLY: `bg-surface-light`, `bg-surface-dark`, `bg-surface-light-card`, `bg-surface-dark-card`, `bg-brand-cta`, `bg-brand-interactive`, `text-content-light`, `text-content-dark`, `text-content-light-secondary`, `text-content-dark-secondary`. NEVER raw hex.
- `text-white` allowed ONLY on `bg-brand-cta` card (Pro card) — pre-existing pattern, high contrast on green background.
- Demo limits: exactly 7 days, exactly 30 minutes. Both enforced server-side in `app/api/conversation/route.ts`.
- Prices unchanged: Basic R$39,90/mês, Pro R$79,90/mês, Annual R$599,90/ano.
- No new npm packages — framer-motion already installed.
- Vitest: API route tests use `// @vitest-environment node`; component tests use `// @vitest-environment jsdom`.
- All Supabase calls use `createSupabaseServer()` (RLS user client) — no admin client needed (RLS `for all using (auth.uid() = id)` allows own-row updates).
- `PaidPlan` type from `lib/mercadopago.ts` remains `'basic' | 'pro' | 'annual'` — demo is NOT a paid plan.
- `DemoStatus` values: `'active' | 'expired' | 'exhausted'` — use these exact strings everywhere (DB constraint, TypeScript type, API responses, UI checks).

---

### Task 1: DB Migration — Demo System Schema

**Files:**
- Create: `supabase/migrations/20260706000002_demo_system.sql`

**Interfaces:**
- Consumes: existing `users` table (add columns), existing `plans` table (add row)
- Produces:
  - `users.demo_started_at timestamptz | null`
  - `users.demo_expires_at timestamptz | null`
  - `users.demo_status text CHECK ('active','expired','exhausted') | null`
  - `plans` row with `id = 'demo'`, `price_brl = 0`, `minutes_per_month = 30`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260706000002_demo_system.sql

-- Add demo tracking columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS demo_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS demo_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS demo_status      text
    CHECK (demo_status IN ('active', 'expired', 'exhausted'));

-- Add 'demo' plan to plans table (referenced by users.plan_id during demo period)
INSERT INTO public.plans (id, name, price_brl, minutes_per_month, features)
VALUES (
  'demo',
  'Demonstração Premium',
  0,
  30,
  ARRAY[
    'Teste de nivelamento por IA',
    'Plano de estudos personalizado',
    'Todos os professores',
    'Correções em tempo real',
    'Dashboard completo',
    'Memória entre aulas',
    'Relatórios de evolução'
  ]
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `Applying migration 20260706000002_demo_system.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000002_demo_system.sql
git commit -m "feat: add demo system schema (demo columns on users + demo plan row)"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: Task 1 (new DB columns)
- Produces:
  - `export type DemoStatus = 'active' | 'expired' | 'exhausted'` — used by Tasks 3, 4, 5, 6
  - Updated `User` interface with `demo_started_at: string | null`, `demo_expires_at: string | null`, `demo_status: DemoStatus | null`

- [ ] **Step 1: Add DemoStatus type**

In `types/index.ts`, add after line 7 (`export type SubscriptionStatus = ...`):

```typescript
export type DemoStatus = 'active' | 'expired' | 'exhausted'
```

- [ ] **Step 2: Update User interface**

In `types/index.ts`, replace the `User` interface (lines 11–24) with:

```typescript
export interface User {
  id: string
  email: string
  name: string | null
  created_at: string
  plan_id: string | null
  cefr_level: CefrLevel | null
  teacher_id: string | null
  personal_context: string[] | null
  streak_days: number
  last_session_at: string | null
  preferred_session_time: string | null
  theme: Theme
  demo_started_at: string | null
  demo_expires_at: string | null
  demo_status: DemoStatus | null
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat: add DemoStatus type and demo fields to User interface"
```

---

### Task 3: Demo Activation API + Conversation Quota Refactor

**Files:**
- Create: `app/api/demo/start/route.ts`
- Modify: `app/api/conversation/route.ts` (lines 32–70, the quota check block)
- Create: `__tests__/api/demo/start.test.ts`
- Create: `__tests__/api/conversation/quota-demo.test.ts`

**Interfaces:**
- Consumes: Task 2 (`DemoStatus`); `createSupabaseServer`; `users` table with demo columns; `usage_log` table
- Produces:
  - `POST /api/demo/start` → `{ started: boolean }` (200) | `{ error: 'Unauthorized' }` (401)
  - Updated `POST /api/conversation` returns `{ error: 'demo_required' }` (403), `{ error: 'demo_expired' }` (429), or `{ error: 'demo_exhausted', minutesUsed, minutesLimit }` (429) for non-subscribers without a valid demo

- [ ] **Step 1: Write failing tests for demo start API**

Create `__tests__/api/demo/start.test.ts`:

```typescript
// @vitest-environment node
import { POST } from '@/app/api/demo/start/route'
import { NextRequest } from 'next/server'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createSupabaseServer: vi.fn() }))

import { createSupabaseServer } from '@/lib/supabase-server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

function makeSupabase(demoStatus: string | null) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { demo_status: demoStatus }, error: null }),
    }),
  })
  mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate })
  ;(createSupabaseServer as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })
  return { mockUpdate }
}

describe('POST /api/demo/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    makeSupabase(null)
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('starts demo and returns started:true when no demo started', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { mockUpdate } = makeSupabase(null)
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ demo_status: 'active', plan_id: 'demo' })
    )
  })

  it('returns started:false (idempotent) when demo already active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { mockUpdate } = makeSupabase('active')
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run __tests__/api/demo/start.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/demo/start/route'`

- [ ] **Step 3: Implement demo start API**

Create `app/api/demo/start/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('demo_status')
    .eq('id', user.id)
    .single()

  // Idempotent: if demo already started (any status), return without re-starting
  if (userData?.demo_status) {
    return NextResponse.json({ started: false, demo_status: userData.demo_status })
  }

  const now = new Date()
  await supabase.from('users').update({
    demo_started_at: now.toISOString(),
    demo_expires_at: new Date(now.getTime() + DEMO_DURATION_MS).toISOString(),
    demo_status: 'active',
    plan_id: 'demo',
  }).eq('id', user.id)

  return NextResponse.json({ started: true })
}
```

- [ ] **Step 4: Run demo start tests — expect PASS**

```bash
npx vitest run __tests__/api/demo/start.test.ts
```

Expected: 3/3 PASS

- [ ] **Step 5: Write failing quota tests**

Create `__tests__/api/conversation/quota-demo.test.ts`:

```typescript
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/tts', () => ({ synthesizeTts: vi.fn() }))
vi.mock('@/lib/did', () => ({ createTalk: vi.fn(), DID_VOICE_IDS: {} }))
vi.mock('@/lib/topics', () => ({ getTopicByKey: vi.fn().mockReturnValue({ key: 'daily', label: 'Daily' }) }))
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: vi.fn() } } },
}))

import { POST } from '@/app/api/conversation/route'
import { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

function setupSupabase(opts: {
  sub?: { plans: { minutes_per_month: number } } | null
  demoUser?: { demo_status: string | null; demo_started_at: string | null; demo_expires_at: string | null }
  usageMinutes?: number
}) {
  const fromImpl = (table: string) => {
    if (table === 'subscriptions') {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: opts.sub ?? null, error: null }) }) }),
        }),
      }
    }
    if (table === 'users') {
      const demoUser = opts.demoUser ?? { demo_status: null, demo_started_at: null, demo_expires_at: null }
      return {
        select: () => ({
          eq: () => ({ single: vi.fn().mockResolvedValue({ data: demoUser, error: null }) }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'usage_log') {
      const min = opts.usageMinutes ?? 0
      return {
        select: () => ({
          eq: () => ({
            gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: min }], error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [] }) }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null }) }),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [] }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  }
  mockFrom.mockImplementation(fromImpl)
  ;(createSupabaseServer as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })
}

function makeRequest() {
  const fd = new FormData()
  fd.append('session_id', 'sess-1')
  fd.append('panic_text', 'hello')
  return new NextRequest('http://localhost/api/conversation', { method: 'POST', body: fd })
}

describe('conversation quota — demo path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 demo_required when no sub and no demo started', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({ sub: null, demoUser: { demo_status: null, demo_started_at: null, demo_expires_at: null } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('demo_required')
  })

  it('returns 429 demo_expired when demo_status is expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'expired', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2026-07-08T00:00:00Z' },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('demo_expired')
  })

  it('returns 429 demo_exhausted when demo minutes used >= 30', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-07-08T00:00:00Z' },
      usageMinutes: 31,
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('demo_exhausted')
  })

  it('passes quota check when demo active and minutes remaining', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-07-08T00:00:00Z' },
      usageMinutes: 5,
    })
    const res = await POST(makeRequest())
    // Passes quota — may fail downstream for unrelated reasons (missing session etc)
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(429)
  })
})
```

- [ ] **Step 6: Run quota tests — expect FAIL**

```bash
npx vitest run __tests__/api/conversation/quota-demo.test.ts
```

Expected: FAIL — quota check returns old `quota_exceeded` behavior, not `demo_required`

- [ ] **Step 7: Refactor quota check in conversation/route.ts**

In `app/api/conversation/route.ts`, replace the entire block from `// ── Quota check ──` to `// ── End quota check ──` (lines 32–70) with:

```typescript
  // ── Quota check ─────────────────────────────────────────────────────────
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

  if (quotaSubError || quotaDemoError) {
    console.error('Quota check DB error', quotaSubError ?? quotaDemoError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (subData) {
    // ── Active subscription path ─────────────────────────────────────────
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
  } else {
    // ── Demo path ────────────────────────────────────────────────────────
    const demo = demoUserData

    if (!demo?.demo_status) {
      return NextResponse.json({ error: 'demo_required' }, { status: 403 })
    }
    if (demo.demo_status === 'expired' || demo.demo_status === 'exhausted') {
      return NextResponse.json({ error: 'demo_expired' }, { status: 429 })
    }
    // Check time expiry even if status is still 'active'
    if (demo.demo_expires_at && new Date(demo.demo_expires_at) <= new Date()) {
      await supabase.from('users').update({ demo_status: 'expired' }).eq('id', user.id)
      return NextResponse.json({ error: 'demo_expired' }, { status: 429 })
    }

    const demoStartDate = demo.demo_started_at!.slice(0, 10)
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
  // ── End quota check ──────────────────────────────────────────────────────
```

- [ ] **Step 8: Run all quota + demo start tests — expect PASS**

```bash
npx vitest run __tests__/api/demo/start.test.ts __tests__/api/conversation/quota-demo.test.ts
```

Expected: 7/7 PASS

- [ ] **Step 9: Commit**

```bash
git add app/api/demo/start/route.ts app/api/conversation/route.ts \
  __tests__/api/demo/start.test.ts __tests__/api/conversation/quota-demo.test.ts
git commit -m "feat: add demo start API and demo quota enforcement in conversation route"
```

---

### Task 4: Plans Page Complete Redesign

**Files:**
- Create: `app/planos/PlansGrid.tsx` (Client Component — animations, interactivity)
- Create: `app/planos/DemoStartButton.tsx` (Client Component — calls POST /api/demo/start)
- Modify: `app/planos/page.tsx` (Server Component — data fetching + composition)
- Create: `__tests__/components/plans/PlansGrid.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`DemoStatus`); existing `PlanCheckoutButton` (`plan: 'basic' | 'pro' | 'annual'`); `POST /api/demo/start` (Task 3); `searchParams.demo_ended` from URL
- Produces: Redesigned `/planos` page with framer-motion card entrance, 4 plan cards (Demo, Basic, Pro, Annual), badges, new copy

- [ ] **Step 1: Write failing tests for PlansGrid**

Create `__tests__/components/plans/PlansGrid.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

import { PlansGrid } from '@/app/planos/PlansGrid'
import type { DemoStatus } from '@/types'

const baseProps = {
  currentPlanId: null as string | null,
  demoStatus: null as DemoStatus | null,
  hasActiveSubscription: false,
  subscriptionEndDate: null as string | null,
  demoEnded: false,
}

describe('PlansGrid', () => {
  it('renders Demonstração Premium card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Demonstração Premium')).toBeInTheDocument()
  })

  it('renders Mais Popular badge on Pro card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Mais Popular')).toBeInTheDocument()
  })

  it('renders Melhor Valor badge on Annual card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Melhor Valor')).toBeInTheDocument()
  })

  it('shows demo_ended alert when demoEnded prop is true', () => {
    render(<PlansGrid {...baseProps} demoEnded />)
    expect(screen.getByText(/Sua demonstração terminou/i)).toBeInTheDocument()
  })

  it('shows "Demonstração ativa" when demoStatus is active', () => {
    render(<PlansGrid {...baseProps} demoStatus="active" currentPlanId="demo" />)
    expect(screen.getByText(/Demonstração ativa/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run __tests__/components/plans/PlansGrid.test.tsx
```

Expected: FAIL — `Cannot find module '@/app/planos/PlansGrid'`

- [ ] **Step 3: Create DemoStartButton**

Create `app/planos/DemoStartButton.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoStatus } from '@/types'

interface Props {
  demoStatus: DemoStatus | null
}

export function DemoStartButton({ demoStatus }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (demoStatus === 'active') {
    return (
      <div className="py-3 rounded-xl text-center text-sm font-semibold text-brand-interactive bg-brand-interactive/10 border border-brand-interactive/30">
        Demonstração ativa
      </div>
    )
  }

  if (demoStatus === 'expired' || demoStatus === 'exhausted') {
    return (
      <div className="py-3 rounded-xl text-center text-sm font-semibold text-content-light-secondary dark:text-content-dark-secondary border border-surface-light-card dark:border-surface-dark-card cursor-not-allowed opacity-60">
        Demonstração encerrada
      </div>
    )
  }

  async function handleStart() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/demo/start', { method: 'POST' })
      if (!res.ok) {
        setError('Não foi possível iniciar a demonstração.')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleStart}
        disabled={isLoading}
        className="py-3 rounded-xl font-semibold text-sm border border-brand-interactive text-content-light dark:text-content-dark hover:bg-brand-interactive/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Aguarde...' : 'Começar demonstração'}
      </button>
      {error && <p className="text-xs text-center text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Create PlansGrid**

Create `app/planos/PlansGrid.tsx`:

```typescript
'use client'

import { motion } from 'framer-motion'
import { PlanCheckoutButton } from './PlanCheckoutButton'
import { DemoStartButton } from './DemoStartButton'
import type { DemoStatus } from '@/types'

interface PlansGridProps {
  currentPlanId: string | null
  demoStatus: DemoStatus | null
  hasActiveSubscription: boolean
  subscriptionEndDate: string | null
  demoEnded: boolean
}

const DEMO_FEATURES = [
  'Teste de nivelamento por IA',
  'Plano de estudos personalizado',
  'Todos os professores',
  'Correções em tempo real',
  'Dashboard completo',
  'Memória entre aulas',
  'Relatórios de evolução',
]

const BASIC_FEATURES = [
  '300 minutos por mês',
  'Plano de estudos personalizado',
  '4 professores especializados',
  'Correções em tempo real',
  'Histórico completo',
  'Replay das aulas',
  'Memória entre sessões',
  'Revisão inteligente',
]

const PRO_FEATURES = [
  '300 minutos por mês',
  'Tudo do Básico',
  'Relatórios completos',
  'Avaliação de pronúncia',
  'Missões diárias personalizadas',
  'Plano adaptado automaticamente pela IA',
  'Trilhas especiais',
]

const ANNUAL_FEATURES = [
  'Tudo do Pro',
  '2 meses grátis',
  'Maior economia',
  'Prioridade no suporte',
  'Acesso antecipado às novidades',
]

function CheckIcon({ highlight }: { highlight?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 mt-0.5 shrink-0 ${highlight ? 'text-white' : 'text-brand-cta'}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function FeatureList({ features, highlight }: { features: string[]; highlight?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2.5">
          <CheckIcon highlight={highlight} />
          <span
            className={`text-sm leading-snug ${
              highlight
                ? 'text-white/90'
                : 'text-content-light-secondary dark:text-content-dark-secondary'
            }`}
          >
            {f}
          </span>
        </li>
      ))}
    </ul>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08 },
  }),
}

export function PlansGrid({
  currentPlanId,
  demoStatus,
  hasActiveSubscription,
  subscriptionEndDate,
  demoEnded,
}: PlansGridProps) {
  return (
    <div className="flex flex-col gap-6">
      {demoEnded && (
        <div className="p-4 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-center">
          <p className="font-semibold text-content-light dark:text-content-dark text-sm">
            Sua demonstração terminou.
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
            Assine um plano para continuar praticando e manter seu progresso.
          </p>
        </div>
      )}

      {hasActiveSubscription && subscriptionEndDate && (
        <div className="p-3 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-sm text-content-light dark:text-content-dark text-center">
          Assinatura ativa até{' '}
          <span className="font-semibold">
            {new Date(subscriptionEndDate).toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}

      {/* ── Demo card ── */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="rounded-2xl border border-surface-light-card dark:border-surface-dark-card bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-content-light-secondary dark:text-content-dark-secondary mb-2">
            Demonstração Premium
          </p>
          <p className="text-2xl font-extrabold text-content-light dark:text-content-dark leading-tight">
            Experimente gratuitamente
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            Ideal para conhecer toda a plataforma antes de assinar.
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 0</span>
          <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
            / 7 dias · 30 min
          </span>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={DEMO_FEATURES} />
        <DemoStartButton demoStatus={demoStatus} />
      </motion.div>

      {/* ── Basic card ── */}
      <motion.div
        custom={1}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className={`rounded-2xl border bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5 ${
          currentPlanId === 'basic'
            ? 'border-brand-interactive'
            : 'border-surface-light-card dark:border-surface-dark-card'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-content-light dark:text-content-dark">Básico</p>
            {currentPlanId === 'basic' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive text-content-dark">
                atual
              </span>
            )}
          </div>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Ideal para criar uma rotina consistente de aprendizado
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 39,90</span>
          <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">/mês</span>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={BASIC_FEATURES} />
        {currentPlanId !== 'basic' ? (
          <PlanCheckoutButton plan="basic" label="Começar agora" />
        ) : (
          <p className="text-center text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary">
            Plano ativo
          </p>
        )}
      </motion.div>

      {/* ── Pro card (highlighted) ── */}
      <motion.div
        custom={2}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="relative rounded-2xl bg-brand-cta p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-white text-brand-cta text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
            Mais Popular
          </span>
        </div>
        <div className="mt-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-white">Pro</p>
            {currentPlanId === 'pro' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                atual
              </span>
            )}
          </div>
          <p className="text-sm text-white/80">Nosso plano mais completo</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-white">R$ 79,90</span>
          <span className="text-sm text-white/80">/mês</span>
        </div>
        <div className="border-t border-white/20" />
        <FeatureList features={PRO_FEATURES} highlight />
        {currentPlanId !== 'pro' ? (
          <PlanCheckoutButton plan="pro" label="Quero evoluir mais rápido" highlight />
        ) : (
          <p className="text-center text-xs font-semibold text-white/80">Plano ativo</p>
        )}
      </motion.div>

      {/* ── Annual card ── */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className={`relative rounded-2xl border bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5 ${
          currentPlanId === 'annual' ? 'border-brand-interactive' : 'border-brand-interactive/40'
        }`}
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-interactive text-content-dark text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
            Melhor Valor
          </span>
        </div>
        <div className="mt-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-content-light dark:text-content-dark">Anual</p>
            {currentPlanId === 'annual' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive text-content-dark">
                atual
              </span>
            )}
          </div>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Melhor custo-benefício
          </p>
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 599,90</span>
            <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">/ano</span>
          </div>
          <p className="text-xs text-brand-interactive font-semibold mt-1">
            ≈ R$ 49,99/mês · 2 meses grátis
          </p>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={ANNUAL_FEATURES} />
        {currentPlanId !== 'annual' ? (
          <PlanCheckoutButton plan="annual" label="Economizar no anual" />
        ) : (
          <p className="text-center text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary">
            Plano ativo
          </p>
        )}
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite plans page server component**

Replace the entire content of `app/planos/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { PlansGrid } from './PlansGrid'
import type { DemoStatus } from '@/types'

interface Props {
  searchParams: { status?: string; demo_ended?: string }
}

export default async function PlanosPage({ searchParams }: Props) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: activeSub }] = await Promise.all([
    supabase
      .from('users')
      .select('plan_id, demo_status, demo_expires_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const currentPlanId = activeSub?.plan_id ?? userData?.plan_id ?? null
  const demoStatus = (userData?.demo_status ?? null) as DemoStatus | null
  const demoEnded = searchParams.demo_ended === '1'

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="font-bold text-content-light dark:text-content-dark">Planos</h1>
      </header>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-content-light dark:text-content-dark leading-tight">
            Escolha como você quer evoluir
          </h2>
          <p className="text-content-light-secondary dark:text-content-dark-secondary mt-2 text-base">
            Comece com 7 dias grátis. Cancele quando quiser.
          </p>
        </div>

        <PlansGrid
          currentPlanId={currentPlanId}
          demoStatus={demoStatus}
          hasActiveSubscription={!!activeSub}
          subscriptionEndDate={activeSub?.current_period_end ?? null}
          demoEnded={demoEnded}
        />

        <p className="text-center text-xs text-content-light-secondary dark:text-content-dark-secondary mt-10">
          Pagamento seguro via Mercado Pago · Cancele quando quiser
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Run PlansGrid tests — expect PASS**

```bash
npx vitest run __tests__/components/plans/PlansGrid.test.tsx
```

Expected: 5/5 PASS

- [ ] **Step 7: Commit**

```bash
git add app/planos/page.tsx app/planos/PlansGrid.tsx app/planos/DemoStartButton.tsx \
  __tests__/components/plans/PlansGrid.test.tsx
git commit -m "feat: redesign plans page with demo card, premium copy, and framer-motion animations"
```

---

### Task 5: Dashboard DemoStatusCard + Auto-start

**Files:**
- Create: `components/dashboard/DemoStatusCard.tsx`
- Modify: `app/dashboard/page.tsx`
- Create: `__tests__/components/dashboard/DemoStatusCard.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`DemoStatus`, updated `User` with demo fields); existing dashboard layout; `usage_log` table
- Produces:
  - `DemoStatusCard` — shows days remaining, minutes remaining, usage bar when active; "Demonstração encerrada" + "Assinar agora" link when expired/exhausted; null when no demo
  - Dashboard auto-starts demo on first visit for users with no plan or `plan_id = 'free'`

- [ ] **Step 1: Write failing tests for DemoStatusCard**

Create `__tests__/components/dashboard/DemoStatusCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { DemoStatusCard } from '@/components/dashboard/DemoStatusCard'

const EXPIRES_IN_4_DAYS = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()

describe('DemoStatusCard', () => {
  it('renders nothing when demo_status is null', () => {
    const { container } = render(
      <DemoStatusCard demoStatus={null} demoExpiresAt={null} demoMinutesUsed={0} demoMinutesLimit={30} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows days remaining and minutes remaining when active', () => {
    render(
      <DemoStatusCard
        demoStatus="active"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={12}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/4 dias restantes/i)).toBeInTheDocument()
    expect(screen.getByText(/18 min restantes/i)).toBeInTheDocument()
  })

  it('shows correct usage percentage', () => {
    render(
      <DemoStatusCard
        demoStatus="active"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={15}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/50%/)).toBeInTheDocument()
  })

  it('shows encerrada state with link when expired', () => {
    render(
      <DemoStatusCard
        demoStatus="expired"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={5}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/Demonstração encerrada/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Assinar agora/i })).toBeInTheDocument()
  })

  it('shows exhausted state with minutes count', () => {
    render(
      <DemoStatusCard
        demoStatus="exhausted"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={30}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/Demonstração encerrada/i)).toBeInTheDocument()
    expect(screen.getByText(/30 minutos utilizados/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run __tests__/components/dashboard/DemoStatusCard.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/dashboard/DemoStatusCard'`

- [ ] **Step 3: Implement DemoStatusCard**

Create `components/dashboard/DemoStatusCard.tsx`:

```typescript
import Link from 'next/link'
import type { DemoStatus } from '@/types'

interface Props {
  demoStatus: DemoStatus | null
  demoExpiresAt: string | null
  demoMinutesUsed: number
  demoMinutesLimit: number
}

function getDaysRemaining(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function DemoStatusCard({ demoStatus, demoExpiresAt, demoMinutesUsed, demoMinutesLimit }: Props) {
  if (!demoStatus) return null

  const minutesRemaining = Math.max(0, demoMinutesLimit - Math.round(demoMinutesUsed))
  const usagePct = Math.min(100, Math.round((demoMinutesUsed / demoMinutesLimit) * 100))

  if (demoStatus === 'expired' || demoStatus === 'exhausted') {
    const reason =
      demoStatus === 'exhausted'
        ? `${demoMinutesLimit} minutos utilizados`
        : 'Período de 7 dias encerrado'

    return (
      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-surface-light-card dark:border-surface-dark-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            Demonstração encerrada
          </p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-content-light-secondary/20 dark:bg-content-dark-secondary/20 text-content-light-secondary dark:text-content-dark-secondary">
            Expirou
          </span>
        </div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{reason}</p>
        <Link
          href="/planos"
          className="w-full py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm text-center hover:opacity-90 transition-opacity"
        >
          Assinar agora
        </Link>
      </div>
    )
  }

  const daysRemaining = demoExpiresAt ? getDaysRemaining(demoExpiresAt) : 0

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-brand-interactive/30 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-content-light dark:text-content-dark">
          Demonstração Premium
        </p>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive/10 text-brand-interactive">
          Ativa
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xl font-extrabold text-content-light dark:text-content-dark">
            {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'} restantes
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            de 7 dias
          </p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-content-light dark:text-content-dark">
            {minutesRemaining} min restantes
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            de {demoMinutesLimit} minutos
          </p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
          <span>{Math.round(demoMinutesUsed)} min utilizados</span>
          <span>{usagePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-interactive transition-all duration-300"
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>
      <Link
        href="/planos"
        className="text-xs text-center text-brand-interactive hover:opacity-70 transition-opacity"
      >
        Ver planos →
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Run DemoStatusCard tests — expect PASS**

```bash
npx vitest run __tests__/components/dashboard/DemoStatusCard.test.tsx
```

Expected: 5/5 PASS

- [ ] **Step 5: Update dashboard page**

In `app/dashboard/page.tsx`, make the following changes:

**Add import** at the top (after existing imports):
```typescript
import { DemoStatusCard } from '@/components/dashboard/DemoStatusCard'
```

**Add auto-start + demo minutes** after `const u = userData as User` (around line 93). Replace:
```typescript
  const u = userData as User
  const t = teacher as Teacher | null
```
With:
```typescript
  const u = userData as User
  const t = teacher as Teacher | null

  // Auto-start demo for first-time users (no existing plan or old free plan)
  let effectiveUser = u
  if (!u.demo_status && (u.plan_id === null || u.plan_id === 'free')) {
    const demoStart = new Date()
    const demoExpiry = new Date(demoStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    await supabase.from('users').update({
      demo_started_at: demoStart.toISOString(),
      demo_expires_at: demoExpiry.toISOString(),
      demo_status: 'active',
      plan_id: 'demo',
    }).eq('id', authUser.id)
    effectiveUser = {
      ...u,
      demo_started_at: demoStart.toISOString(),
      demo_expires_at: demoExpiry.toISOString(),
      demo_status: 'active' as const,
      plan_id: 'demo',
    }
  }

  // Compute demo minutes used (rendered in DemoStatusCard)
  let demoMinutesUsed = 0
  if (effectiveUser.demo_status === 'active' && effectiveUser.demo_started_at) {
    const demoStartDate = effectiveUser.demo_started_at.slice(0, 10)
    const { data: demoUsage } = await supabase
      .from('usage_log')
      .select('whisper_minutes')
      .eq('user_id', authUser.id)
      .gte('date', demoStartDate)
    demoMinutesUsed = (demoUsage ?? []).reduce(
      (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
      0,
    )
  }
```

**Add DemoStatusCard** in JSX after `<StreakBadge streakDays={u.streak_days ?? 0} />`:
```tsx
        {/* Demo status */}
        <DemoStatusCard
          demoStatus={effectiveUser.demo_status}
          demoExpiresAt={effectiveUser.demo_expires_at}
          demoMinutesUsed={demoMinutesUsed}
          demoMinutesLimit={30}
        />
```

**Update plan label** in the "Planos e assinaturas" link. Replace:
```tsx
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              {u.plan_id ? `Plano ${u.plan_id}` : 'Plano Grátis'}
            </p>
```
With:
```tsx
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              {effectiveUser.plan_id === 'demo'
                ? 'Demonstração Premium'
                : effectiveUser.plan_id
                ? `Plano ${effectiveUser.plan_id}`
                : 'Sem plano'}
            </p>
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/DemoStatusCard.tsx app/dashboard/page.tsx \
  __tests__/components/dashboard/DemoStatusCard.test.tsx
git commit -m "feat: add DemoStatusCard to dashboard and auto-start demo on first visit"
```

---

### Task 6: Aula Page Demo Guard

**Files:**
- Modify: `app/aula/page.tsx`

**Interfaces:**
- Consumes: Task 2 (`User` with `demo_status` and `demo_expires_at`); existing `app/aula/page.tsx` structure; `/planos?demo_ended=1` from Task 4
- Produces: `/aula` redirects to `/planos?demo_ended=1` when user has no active subscription AND (no demo started OR demo expired/exhausted OR demo time has passed)

- [ ] **Step 1: Add demo guard to aula page**

Replace the entire content of `app/aula/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { AulaClient } from './AulaClient'
import type { Teacher } from '@/types'

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

  // Guard: require active subscription or active demo with time remaining
  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', authUser.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!activeSub) {
    const demoStatus = userData.demo_status as string | null
    const isExpired = demoStatus === 'expired' || demoStatus === 'exhausted'
    const isTimeExpired =
      userData.demo_expires_at && new Date(userData.demo_expires_at) <= new Date()

    if (!demoStatus || isExpired || isTimeExpired) {
      redirect('/planos?demo_ended=1')
    }
  }

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', userData.teacher_id)
    .single()

  if (!teacher) redirect('/dashboard')

  return <AulaClient teacher={teacher as Teacher} cefrLevel={userData.cefr_level ?? null} />
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass — no regressions.

- [ ] **Step 3: Commit**

```bash
git add app/aula/page.tsx
git commit -m "feat: add demo guard to aula page — redirect expired/exhausted demo users to /planos"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Substituir plano gratuito por "Demonstração Premium" | Task 1 (DB `demo` row), Task 4 (UI card with new copy) |
| Duração máxima 7 dias | Task 3 (`DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000`), Task 5 (auto-start sets expiry) |
| Limite total 30 minutos de conversação | Task 3 (`DEMO_MINUTES_LIMIT = 30` in conversation route) |
| Acesso a funcionalidades Premium durante demo | Tasks 1–5 (demo users pass quota check; no other feature gates changed) |
| Bloquear novas conversações após qualquer limite | Task 3 (429 demo_expired/demo_exhausted in conversation API), Task 6 (aula page guard redirects) |
| Manter acesso ao dashboard, histórico, progresso, perfil | No changes to any of these routes — only `/aula` gets a guard |
| Exibir tela elegante "Sua demonstração terminou" | Task 4 (PlansGrid `demoEnded` alert), Task 5 (DemoStatusCard expired/exhausted state) |
| Mostrar botão para assinatura após término | Task 5 (DemoStatusCard "Assinar agora" → /planos), Task 4 (plan cards always visible) |
| Card no dashboard: dias, minutos, tempo utilizado | Task 5 (DemoStatusCard) |
| Backend: demo_started_at, demo_expires_at, demo_status | Task 1 (migration), Task 3 (API sets + reads these) |
| demo_minutes_remaining computed at read time | Task 5 (dashboard queries usage_log from demo_started_at), Task 3 (conversation route queries usage_log from demo_started_at) |
| Toda validação no backend | Task 3 (conversation route enforces limits server-side) |
| Botão "Começar demonstração" | Task 4 (DemoStartButton — calls POST /api/demo/start) |
| Copy nova: Demo card | Task 4 (PlansGrid: "Demonstração Premium", "Experimente gratuitamente", full feature list) |
| Copy nova: Basic | Task 4 (PlansGrid: "Ideal para criar uma rotina...", "Começar agora") |
| Copy nova: Pro | Task 4 (PlansGrid: "Nosso plano mais completo", "Quero evoluir mais rápido") |
| Copy nova: Annual | Task 4 (PlansGrid: "Melhor custo-benefício", "Economizar no anual", "≈ R$49,99/mês") |
| Selos "Mais Popular" (Pro) e "Melhor Valor" (Annual) | Task 4 (PlansGrid — absolute-positioned badges) |
| Preços inalterados | Task 4 (hardcoded: R$39,90 / R$79,90 / R$599,90 — unchanged) |
| Animações sutis | Task 4 (framer-motion card entrance, CSS hover `-translate-y-0.5`) |
| Hover dos cards | Task 4 (`hover:-translate-y-0.5 transition-transform duration-200`) |
| Visual Stripe/Linear/Vercel | Task 4 (`rounded-2xl`, large price typography, feature badges, proper hierarchy) |
| Responsividade | All cards use `max-w-2xl mx-auto`, single-column stack — safe on all screen sizes |

### Type Consistency

`DemoStatus = 'active' | 'expired' | 'exhausted'` defined in Task 2, used identically in:
- Task 3: API response strings, DB update values, `demo.demo_status !== 'active'` check
- Task 4: `DemoStartButton` props, `PlansGrid` props
- Task 5: `DemoStatusCard` props, `effectiveUser.demo_status as const`
- Task 6: string comparison against `userData.demo_status`

Column names `demo_started_at`, `demo_expires_at`, `demo_status` match between Task 1 (SQL `ADD COLUMN`) and all subsequent tasks.

### Placeholder Scan

No TBD, TODO, incomplete steps, or vague requirements found.
