import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { downgradeLevel } from '@/lib/levels'
import type { CefrLevel } from '@/types'

const ALLOWED_REASONS = new Set(['manual_downgrade', 'confirmation_suggestion_accepted'])

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await request.json() as { reason: string }
  if (!ALLOWED_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const { data: userRow } = await supabase.from('users').select('cefr_level').eq('id', user.id).single()
  const currentLevel = (userRow as { cefr_level?: CefrLevel | null } | null)?.cefr_level
  if (!currentLevel) return NextResponse.json({ error: 'No current level set' }, { status: 400 })

  const result = await downgradeLevel(
    supabase,
    user.id,
    currentLevel,
    reason as 'manual_downgrade' | 'confirmation_suggestion_accepted',
  )
  if (!result) return NextResponse.json({ error: 'No lower level available' }, { status: 400 })

  return NextResponse.json({ level: result.newLevel, reinforcement_target_level: result.reinforcementTargetLevel })
}
