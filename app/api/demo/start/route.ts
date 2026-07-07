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
  const { error: updateError } = await supabase.from('users').update({
    demo_started_at: now.toISOString(),
    demo_expires_at: new Date(now.getTime() + DEMO_DURATION_MS).toISOString(),
    demo_status: 'active',
    plan_id: 'demo',
  }).eq('id', user.id)

  if (updateError) {
    console.error('Demo start DB update failed:', updateError.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ started: true })
}
