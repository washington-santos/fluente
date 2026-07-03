import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/aula', '/licoes', '/licao', '/professores', '/planos', '/perfil', '/admin']
// /cadastro sub-paths (onboarding steps) require auth; root /cadastro is the signup page (public)
const PROTECTED_SUBPATHS = ['/cadastro']
const AUTH_ONLY = ['/login', '/cadastro']
const NO_NEXT_REDIRECT = new Set(['/cadastro/boas-vindas'])

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname, search } = request.nextUrl

  const isProtected =
    PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    PROTECTED_SUBPATHS.some((p) => pathname.startsWith(p + '/'))
  const isAuthOnly = AUTH_ONLY.includes(pathname)

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    if (!NO_NEXT_REDIRECT.has(pathname)) loginUrl.searchParams.set('next', pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
}
