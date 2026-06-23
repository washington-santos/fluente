import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'

function mockUser(user: object | null) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`)
}

describe('middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects unauthenticated request to /dashboard → /login', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects unauthenticated request to /aula → /login', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/aula'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects authenticated request to /login → /dashboard', async () => {
    mockUser({ id: 'user-123' })
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/login'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('allows unauthenticated request to / through', async () => {
    mockUser(null)
    const { middleware } = await import('@/middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })
})
