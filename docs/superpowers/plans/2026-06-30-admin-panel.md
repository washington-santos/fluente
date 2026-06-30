# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backoffice at `/admin` with sidebar navigation, admin-email guard, and 4 server-rendered pages: Overview, Usuários, Sessões, Custos de AI.

**Architecture:** Next.js 14 App Router server components throughout. A shared `createSupabaseAdmin()` helper uses the service-role key to bypass RLS. `app/admin/layout.tsx` enforces admin access by comparing the authenticated user's email against a comma-separated `ADMIN_EMAILS` env var. All data fetching is server-side; no client state or `useEffect`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (existing tokens), `@supabase/supabase-js` (service-role client), `@supabase/ssr` (server auth check in layout).

## Global Constraints

- All new files in `app/admin/**` are server components (no `'use client'` directive).
- Use existing Tailwind tokens: `bg-surface-light dark:bg-surface-dark`, `bg-surface-light-card dark:bg-surface-dark-card`, `text-content-light dark:text-content-dark`, `text-content-light-secondary dark:text-content-dark-secondary`, `border-surface-light-card dark:border-surface-dark-card`, `bg-brand-cta`, `text-brand-cta`.
- All Brazilian text (labels, placeholders) in Portuguese.
- Numbers formatted with `toLocaleString('pt-BR')` where applicable.
- Dates formatted with `new Date(iso).toLocaleString('pt-BR', {...})`.
- No `any` suppressions — use inline cast `(s as { field: Type })` or type-narrow only where Supabase's join return forces it.
- `createSupabaseAdmin()` is imported from `@/lib/supabase-admin` in every admin page.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/supabase-admin.ts` | Create | Service-role Supabase client helper |
| `.env.local` | Modify | Add `ADMIN_EMAILS` var |
| `app/admin/layout.tsx` | Create | Admin guard + sidebar navigation |
| `app/admin/page.tsx` | Create | Overview — 6 stat cards |
| `app/admin/usuarios/page.tsx` | Create | Users table with `?q=` search |
| `app/admin/usuarios/[id]/page.tsx` | Create | User detail: profile + sessions + errors |
| `app/admin/sessoes/page.tsx` | Create | Sessions table with `?page=` and `?from=`/`?to=` filters |
| `app/admin/sessoes/[id]/page.tsx` | Create | Session replay via service role |
| `app/admin/custos/page.tsx` | Create | AI cost table — last 30 days |

---

### Task 1: Infrastructure — supabase-admin helper + layout with sidebar

**Files:**
- Create: `lib/supabase-admin.ts`
- Modify: `.env.local`
- Create: `app/admin/layout.tsx`

**Interfaces:**
- Produces: `createSupabaseAdmin()` → `SupabaseClient` (service-role) — used by all admin pages in Tasks 2–5.

- [ ] **Step 1: Create `lib/supabase-admin.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```

- [ ] **Step 2: Add `ADMIN_EMAILS` to `.env.local`**

Open `.env.local` and add this line (replace with your actual admin email):

```
ADMIN_EMAILS=canalricodark@gmail.com
```

Multiple admins: `ADMIN_EMAILS=email1@x.com,email2@x.com`

- [ ] **Step 3: Create `app/admin/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/sessoes', label: 'Sessões' },
  { href: '/admin/custos', label: 'Custos de AI' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) redirect('/')

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex">
      <aside className="w-52 shrink-0 border-r border-surface-light-card dark:border-surface-dark-card flex flex-col p-4 gap-1">
        <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wider mb-3">
          Admin
        </p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 rounded-lg text-sm text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Verify access control**

Run the dev server:
```
npm run dev
```

1. While **not** logged in, navigate to `http://localhost:3000/admin` → should redirect to `/login`.
2. Log in as a non-admin user → navigate to `http://localhost:3000/admin` → should redirect to `/`.
3. Log in as the admin email → navigate to `http://localhost:3000/admin` → should show the sidebar (page body will be blank until Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase-admin.ts app/admin/layout.tsx
git commit -m "feat: admin infrastructure — supabase-admin helper + layout guard + sidebar"
```

(Do not commit `.env.local` — it is gitignored.)

---

### Task 2: Overview page — 6 stat cards

**Files:**
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin`

- [ ] **Step 1: Create `app/admin/page.tsx`**

```tsx
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const USD_TO_BRL = 5.50

function calcAiCost(row: {
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}): number {
  return (
    (row.whisper_minutes ?? 0) * 0.006 * USD_TO_BRL +
    ((row.claude_tokens ?? 0) / 1_000_000) * 3 * USD_TO_BRL +
    ((row.tts_chars ?? 0) / 1_000_000) * 15 * USD_TO_BRL +
    (row.did_credits ?? 0) * 0.1 * USD_TO_BRL
  )
}

export default async function AdminOverviewPage() {
  const supabase = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: sessionsToday },
    { count: totalSessions },
    { data: activeSubs },
    { data: todayUsage },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', today),
    supabase.from('sessions').select('id', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('plan_id, plans(price_brl)')
      .eq('status', 'active'),
    supabase
      .from('usage_log')
      .select('whisper_minutes, tts_chars, claude_tokens, did_credits')
      .eq('date', today),
  ])

  const mrr = (activeSubs ?? []).reduce(
    (sum, s) => sum + ((s.plans as { price_brl: number } | null)?.price_brl ?? 0),
    0,
  )
  const aiCostToday = (todayUsage ?? []).reduce(
    (sum, row) => sum + calcAiCost(row as { whisper_minutes: number; tts_chars: number; claude_tokens: number; did_credits: number }),
    0,
  )

  const stats = [
    { label: 'Total de usuários', value: String(totalUsers ?? 0) },
    { label: 'Novos hoje', value: String(newUsersToday ?? 0) },
    { label: 'Sessões hoje', value: String(sessionsToday ?? 0) },
    { label: 'Sessões totais', value: String(totalSessions ?? 0) },
    { label: 'MRR estimado', value: `R$ ${mrr.toFixed(2)}` },
    { label: 'Custo de AI hoje', value: `R$ ${aiCostToday.toFixed(2)}` },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-content-light dark:text-content-dark mb-6">
        Overview
      </h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
          >
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              {s.label}
            </p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/admin` as admin. Expected: sidebar visible on left, 6 stat cards in a 2×3 grid with real values from the database.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: admin overview page — 6 stat cards (users, sessions, MRR, AI cost)"
```

---

### Task 3: Users table + detail page

**Files:**
- Create: `app/admin/usuarios/page.tsx`
- Create: `app/admin/usuarios/[id]/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin`
- Produces: links to `/admin/usuarios/[id]` (consumed by detail page itself) and links to `/admin/sessoes/[id]` from detail page.

- [ ] **Step 1: Create `app/admin/usuarios/page.tsx`**

```tsx
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const supabase = createSupabaseAdmin()
  const q = searchParams.q ?? ''

  let query = supabase
    .from('users')
    .select('id, name, email, plan_id, cefr_level, streak_days, created_at, subscriptions(status)')
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data: users } = await query

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Usuários
        </h1>
        <form>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar nome ou email…"
            className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
          />
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Nome</th>
              <th className="pb-2 pr-4 font-medium">Email</th>
              <th className="pb-2 pr-4 font-medium">Plano</th>
              <th className="pb-2 pr-4 font-medium">Nível</th>
              <th className="pb-2 pr-4 font-medium">Streak</th>
              <th className="pb-2 pr-4 font-medium">Cadastro</th>
              <th className="pb-2 font-medium">Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr
                key={u.id}
                className="border-b border-surface-light-card dark:border-surface-dark-card hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
              >
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/usuarios/${u.id}`}
                    className="text-brand-cta hover:underline"
                  >
                    {u.name ?? '—'}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {u.email}
                </td>
                <td className="py-2 pr-4">{u.plan_id ?? 'free'}</td>
                <td className="py-2 pr-4">{u.cefr_level ?? '—'}</td>
                <td className="py-2 pr-4">{u.streak_days ?? 0}</td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {formatDate(u.created_at)}
                </td>
                <td className="py-2">
                  {(u.subscriptions as { status: string }[] | null)?.[0]?.status ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(users ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhum usuário encontrado.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/usuarios/[id]/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  return `${Math.round(seconds / 60)} min`
}

export default async function AdminUsuarioDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseAdmin()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, plan_id, cefr_level, streak_days, created_at, last_session_at')
    .eq('id', params.id)
    .single()

  if (!user) redirect('/admin/usuarios')

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, teacher:teachers(name)')
    .eq('user_id', params.id)
    .order('started_at', { ascending: false })
    .limit(5)

  const { data: errors } = await supabase
    .from('errors_log')
    .select('error_type, error_text, correct_form, seen_count')
    .eq('user_id', params.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(5)

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70"
        >
          ← Usuários
        </Link>
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          {user.name ?? user.email}
        </h1>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-2 text-sm">
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Email: </span>
          {user.email}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Plano: </span>
          {user.plan_id ?? 'free'}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Nível: </span>
          {user.cefr_level ?? '—'}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Streak: </span>
          {user.streak_days ?? 0} dias
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Cadastro: </span>
          {formatDate(user.created_at)}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Última aula: </span>
          {user.last_session_at ? formatDate(user.last_session_at) : '—'}
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Últimas 5 sessões
        </h2>
        <div className="flex flex-col gap-2">
          {(sessions ?? []).length === 0 && (
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              Nenhuma sessão.
            </p>
          )}
          {(sessions ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-sm"
            >
              <div>
                <p className="font-medium text-content-light dark:text-content-dark">
                  {formatDate(s.started_at)}
                </p>
                <p className="text-content-light-secondary dark:text-content-dark-secondary text-xs">
                  {(s.teacher as { name: string } | null)?.name ?? '—'} ·{' '}
                  {formatDuration(s.duration_seconds)}
                </p>
              </div>
              <Link
                href={`/admin/sessoes/${s.id}`}
                className="text-xs text-brand-cta hover:underline"
              >
                ver →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Erros frequentes
        </h2>
        <div className="flex flex-col gap-2">
          {(errors ?? []).length === 0 && (
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              Nenhum erro registrado.
            </p>
          )}
          {(errors ?? []).map((e, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-sm"
            >
              <p className="text-content-light dark:text-content-dark">
                &ldquo;{e.error_text}&rdquo; →{' '}
                <span className="text-brand-cta">{e.correct_form}</span>
              </p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {e.error_type} · visto {e.seen_count}×
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

1. Navigate to `http://localhost:3000/admin/usuarios` → table shows all users.
2. Type a name/email in the search box and press Enter → table filters.
3. Click a user name → detail page shows profile, sessions, errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/usuarios/
git commit -m "feat: admin users table + detail page"
```

---

### Task 4: Sessions table + detail page

**Files:**
- Create: `app/admin/sessoes/page.tsx`
- Create: `app/admin/sessoes/[id]/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin`

- [ ] **Step 1: Create `app/admin/sessoes/page.tsx`**

```tsx
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'

const PAGE_SIZE = 50

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  return `${Math.round(seconds / 60)} min`
}

export default async function AdminSessoesPage({
  searchParams,
}: {
  searchParams: { page?: string; from?: string; to?: string }
}) {
  const supabase = createSupabaseAdmin()
  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10))
  const from = searchParams.from ?? ''
  const to = searchParams.to ?? ''

  let query = supabase
    .from('sessions')
    .select(
      'id, started_at, duration_seconds, mode, user:users(name, email), teacher:teachers(name)',
      { count: 'exact' },
    )
    .order('started_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (from) query = query.gte('started_at', from)
  if (to) query = query.lte('started_at', `${to}T23:59:59`)

  const { data: sessions, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const pageUrl = (p: number) =>
    `?page=${p}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Sessões
        </h1>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="px-2 py-1 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
          />
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            até
          </span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="px-2 py-1 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
          />
          <button
            type="submit"
            className="px-3 py-1 text-sm rounded-lg bg-brand-cta text-white hover:opacity-90 transition-opacity"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Usuário</th>
              <th className="pb-2 pr-4 font-medium">Professor</th>
              <th className="pb-2 pr-4 font-medium">Modo</th>
              <th className="pb-2 pr-4 font-medium">Duração</th>
              <th className="pb-2 pr-4 font-medium">Data</th>
              <th className="pb-2 font-medium">Replay</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => (
              <tr
                key={s.id}
                className="border-b border-surface-light-card dark:border-surface-dark-card hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
              >
                <td className="py-2 pr-4">
                  {(s.user as { name: string | null; email: string } | null)?.name ??
                    (s.user as { name: string | null; email: string } | null)?.email ??
                    '—'}
                </td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {(s.teacher as { name: string } | null)?.name ?? '—'}
                </td>
                <td className="py-2 pr-4">{s.mode}</td>
                <td className="py-2 pr-4">{formatDuration(s.duration_seconds)}</td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {formatDate(s.started_at)}
                </td>
                <td className="py-2">
                  <Link
                    href={`/admin/sessoes/${s.id}`}
                    className="text-brand-cta hover:underline text-xs"
                  >
                    ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(sessions ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhuma sessão encontrada.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          {page > 0 && (
            <Link
              href={pageUrl(page - 1)}
              className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70"
            >
              ← Anterior
            </Link>
          )}
          <span className="text-content-light-secondary dark:text-content-dark-secondary">
            Página {page + 1} de {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link
              href={pageUrl(page + 1)}
              className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70"
            >
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/sessoes/[id]/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  return `${Math.round(seconds / 60)} min`
}

export default async function AdminSessionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseAdmin()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, user:users(name, email), teacher:teachers(name)')
    .eq('id', params.id)
    .single()

  if (!session) redirect('/admin/sessoes')

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, text, had_correction')
    .eq('session_id', params.id)
    .order('created_at', { ascending: true })

  const u = session.user as { name: string | null; email: string } | null
  const t = session.teacher as { name: string } | null

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/sessoes"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70"
        >
          ← Sessões
        </Link>
        <div>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {formatDate(session.started_at)}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {u?.name ?? u?.email ?? '—'} · {t?.name ?? '—'} ·{' '}
            {formatDuration(session.duration_seconds)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {(messages ?? []).map((m) => (
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
            Nenhuma mensagem nesta sessão.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

1. Navigate to `http://localhost:3000/admin/sessoes` → table shows all sessions across all users.
2. Set a date range and click Filtrar → filtered results.
3. With more than 50 sessions, check pagination links appear.
4. Click "ver →" on any session → replay shows conversation bubbles.

- [ ] **Step 4: Commit**

```bash
git add app/admin/sessoes/
git commit -m "feat: admin sessions table with date filter + pagination + session detail replay"
```

---

### Task 5: AI Costs page

**Files:**
- Create: `app/admin/custos/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseAdmin()` from `@/lib/supabase-admin`

- [ ] **Step 1: Create `app/admin/custos/page.tsx`**

```tsx
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const USD_TO_BRL = 5.5

interface UsageRow {
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}

interface CostBreakdown {
  whisper: number
  claude: number
  tts: number
  did: number
  total: number
}

function calcCost(row: UsageRow): CostBreakdown {
  const whisper = (row.whisper_minutes ?? 0) * 0.006 * USD_TO_BRL
  const claude = ((row.claude_tokens ?? 0) / 1_000_000) * 3 * USD_TO_BRL
  const tts = ((row.tts_chars ?? 0) / 1_000_000) * 15 * USD_TO_BRL
  const did = (row.did_credits ?? 0) * 0.1 * USD_TO_BRL
  return { whisper, claude, tts, did, total: whisper + claude + tts + did }
}

export default async function AdminCustosPage() {
  const supabase = createSupabaseAdmin()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: rows } = await supabase
    .from('usage_log')
    .select('date, whisper_minutes, tts_chars, claude_tokens, did_credits')
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: false })

  // Aggregate by date (multiple users may have rows for the same date)
  const byDate = new Map<string, UsageRow>()
  for (const row of rows ?? []) {
    const existing = byDate.get(row.date) ?? {
      whisper_minutes: 0,
      tts_chars: 0,
      claude_tokens: 0,
      did_credits: 0,
    }
    byDate.set(row.date, {
      whisper_minutes: existing.whisper_minutes + (row.whisper_minutes ?? 0),
      tts_chars: existing.tts_chars + (row.tts_chars ?? 0),
      claude_tokens: existing.claude_tokens + (row.claude_tokens ?? 0),
      did_credits: existing.did_credits + (row.did_credits ?? 0),
    })
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  )

  const totals = sorted.reduce(
    (acc, [, r]) => {
      const c = calcCost(r)
      return {
        total: acc.total + c.total,
      }
    },
    { total: 0 },
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-content-light dark:text-content-dark mb-6">
        Custos de AI — últimos 30 dias
      </h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Data</th>
              <th className="pb-2 pr-4 font-medium">Whisper (min)</th>
              <th className="pb-2 pr-4 font-medium">TTS (chars)</th>
              <th className="pb-2 pr-4 font-medium">Claude (tokens)</th>
              <th className="pb-2 pr-4 font-medium">D-ID (créditos)</th>
              <th className="pb-2 font-medium">Custo (R$)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([date, row]) => {
              const cost = calcCost(row)
              return (
                <tr
                  key={date}
                  className="border-b border-surface-light-card dark:border-surface-dark-card"
                >
                  <td className="py-2 pr-4 text-content-light dark:text-content-dark">
                    {date}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.whisper_minutes.toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.tts_chars.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.claude_tokens.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.did_credits}
                  </td>
                  <td className="py-2 font-semibold text-content-light dark:text-content-dark">
                    R$ {cost.total.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-light-card dark:border-surface-dark-card font-bold">
              <td className="pt-2 pr-4 text-content-light dark:text-content-dark" colSpan={5}>
                Total
              </td>
              <td className="pt-2 text-content-light dark:text-content-dark">
                R$ {totals.total.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
        {sorted.length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhum dado de uso ainda.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/admin/custos`. Expected: table with one row per day (last 30 days), aggregated usage across all users, R$ cost in last column, total row at bottom. If no usage data exists yet, the empty state message shows.

- [ ] **Step 3: Commit**

```bash
git add app/admin/custos/
git commit -m "feat: admin AI costs page — last 30 days aggregated from usage_log"
```
