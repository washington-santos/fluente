import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Next.js patches global fetch to default to cache: 'force-cache' even inside
// dynamically-rendered routes (cookies()/headers() only opt the route itself
// out of static rendering, not each fetch call). Without this override,
// Supabase REST responses get cached indefinitely by Next's Data Cache —
// e.g. GET /api/session would keep returning the first-ever snapshot of a
// session's messages forever, never reflecting later updates.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: 'no-store' })
}

export function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie writes handled by middleware
          }
        },
      },
    }
  )
}
