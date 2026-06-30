# Admin Panel — Design Spec

**Date:** 2026-06-30  
**Project:** English Fluent

---

## Overview

Internal backoffice at `/admin` for monitoring users, subscriptions, sessions, and AI costs. Access is restricted to hardcoded admin emails via environment variable. Built with Next.js 14 App Router server components and a Supabase service-role client that bypasses RLS.

---

## Access Control

- Middleware already blocks unauthenticated users from `/admin/*`.
- `app/admin/layout.tsx` performs a second check: reads `ADMIN_EMAILS` env var (comma-separated list), verifies `auth.getUser()` email is in that list. If not, redirects to `/`.
- No database schema change needed.
- `ADMIN_EMAILS` must be added to `.env.local` and deployment environment variables.

---

## Shared Infrastructure

### `lib/supabase-admin.ts`
Extracts the service-role client already used in `app/api/webhooks/mercadopago/route.ts` into a shared helper:

```ts
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```

### `app/admin/layout.tsx`
- Checks admin access (redirect to `/` if unauthorized).
- Renders sidebar with links to all 4 sections.
- Sidebar items: Overview, Usuários, Sessões, Custos de AI.
- Same dark/light theme tokens as the rest of the app.

---

## Screens

### 1. `/admin` — Overview

Stat cards in a 2×3 grid:

| Card | Query |
|------|-------|
| Total de usuários | `count` from `users` |
| Novos hoje | `count` from `users` where `created_at >= today` |
| Sessões hoje | `count` from `sessions` where `started_at >= today` |
| Sessões totais | `count` from `sessions` |
| MRR estimado (R$) | join `subscriptions` (status=active) + `plans`, sum `price_brl` |
| Custo de AI hoje (R$) | `usage_log` where `date = today`, aggregated + priced (see cost formula) |

All queries run server-side on page render. No client-side data fetching.

---

### 2. `/admin/usuarios` — Usuários

Server-rendered table of all users. Accepts `?q=` query param for search (name or email, case-insensitive, via Supabase `.ilike()`).

**Columns:** Nome, Email, Plano, Nível CEFR, Streak, Cadastro, Status assinatura

**Detail view:** `/admin/usuarios/[id]` — shows full user profile + last 5 sessions + top 5 recurring errors from `errors_log`.

---

### 3. `/admin/sessoes` — Sessões

Server-rendered table of all sessions across all users. Accepts `?page=` (50 per page) and `?from=`/`?to=` date filters.

**Columns:** Usuário, Professor, Modo, Duração, Data, Link replay

Replay links point to existing `/dashboard/sessao/[id]` page (admin is a user too, so the server page will load the session via service role if the admin's own auth doesn't own it — or we create `/admin/sessoes/[id]` as a thin wrapper that loads via service role).

> **Note:** Since the existing replay page uses user-scoped RLS, admin session detail needs its own page at `/admin/sessoes/[id]` using `createSupabaseAdmin()`.

---

### 4. `/admin/custos` — Custos de AI

Table of last 30 days aggregated from `usage_log`. One row per day.

**Columns:** Data, Whisper (min), TTS (chars), Claude (tokens), D-ID (créditos), Custo estimado (R$)

**Cost formula (R$ at USD 5.50 exchange rate):**
- Whisper: `whisper_minutes × 0.006 × 5.50`
- Claude Sonnet: `claude_tokens / 1_000_000 × 3 × 5.50`
- OpenAI TTS: `tts_chars / 1_000_000 × 15 × 5.50`
- D-ID: `did_credits × 0.10 × 5.50`

Total row at the bottom of the table.

---

## File Structure

```
app/admin/
  layout.tsx              ← admin guard + sidebar
  page.tsx                ← Overview (stat cards)
  usuarios/
    page.tsx              ← users table (search via ?q=)
    [id]/page.tsx         ← user detail
  sessoes/
    page.tsx              ← sessions table (pagination + date filter)
    [id]/page.tsx         ← session detail (service role replay)
  custos/
    page.tsx              ← AI cost table (last 30 days)
lib/
  supabase-admin.ts       ← createSupabaseAdmin() helper
```

---

## Out of Scope

- Teacher CRUD (teachers are seeded via migration; no admin UI needed now)
- Subscription management (cancel/refund) — handled directly in Mercado Pago dashboard
- Email sending from admin panel
- Export to CSV
