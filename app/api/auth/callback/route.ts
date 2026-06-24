import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const raw = searchParams.get('next') ?? ''
  // Accept only same-origin relative paths; block protocol-relative and path traversal at any encoding depth
  let next = '/dashboard'
  try {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      const rawPath = raw.split('?')[0].split('#')[0]
      const hasTraversal = rawPath.split('/').some((seg) => {
        let s = seg
        // Decode until stable: catches %2e%2e, %252e%252e, and deeper double-encoding
        while (true) {
          if (s === '..') return true
          try { const d = decodeURIComponent(s); if (d === s) return false; s = d } catch { return false }
        }
      })
      if (!hasTraversal) {
        const parsed = new URL(raw, origin)
        // Include parsed.hash: searchParams.get() already decodes %23→#, so a hash in raw is intentional
        if (parsed.origin === origin) next = parsed.pathname + parsed.search + parsed.hash
      }
    }
  } catch { /* malformed URL — keep default */ }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
