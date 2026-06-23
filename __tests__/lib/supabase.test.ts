process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

import { createSupabaseClient } from '@/lib/supabase'

describe('createSupabaseClient', () => {
  it('returns an object with auth property', () => {
    const client = createSupabaseClient()
    expect(client).toHaveProperty('auth')
  })

  it('returns an object with from() method', () => {
    const client = createSupabaseClient()
    expect(typeof client.from).toBe('function')
  })
})
