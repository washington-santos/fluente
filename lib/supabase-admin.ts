import 'server-only'
import { createClient } from '@supabase/supabase-js'

// See lib/supabase-server.ts — without this, Next.js's Data Cache can cache
// Supabase REST responses indefinitely inside server-side code.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: 'no-store' })
}

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: noStoreFetch } },
  )
}
