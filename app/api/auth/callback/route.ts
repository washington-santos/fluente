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
      // Decode the full path until stable — handles any encoding depth and %2F-encoded slashes within segments
      let decodedPath = rawPath
      while (true) {
        try { const d = decodeURIComponent(decodedPath); if (d === decodedPath) break; decodedPath = d } catch { break }
      }
      const hasTraversal = decodedPath.split('/').some((seg) => seg === '..')
      if (!hasTraversal) {
        const parsed = new URL(raw, origin)
        if (parsed.origin === origin) {
          const safeHash = parsed.hash && !parsed.hash.slice(1).split('/').some((s) => s === '..') ? parsed.hash : ''
          next = decodedPath.split('/').map(encodeURIComponent).join('/') + parsed.search + safeHash
        }
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
