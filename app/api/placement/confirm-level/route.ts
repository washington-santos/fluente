import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { CEFR_ORDER, isAtOrBelow } from '@/lib/levels'
import type { CefrLevel } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chosen_level } = await request.json() as { chosen_level: string }

  if (!CEFR_ORDER.includes(chosen_level as CefrLevel)) {
    return NextResponse.json({ error: 'Invalid CEFR level' }, { status: 400 })
  }
  const chosen = chosen_level as CefrLevel

  const { data: placementResult } = await supabase
    .from('placement_results')
    .select('cefr_level')
    .eq('user_id', user.id)
    .maybeSingle()

  const recommended = (placementResult as { cefr_level?: CefrLevel } | null)?.cefr_level
  if (!recommended) {
    return NextResponse.json({ error: 'No placement result found' }, { status: 400 })
  }

  if (!isAtOrBelow(chosen, recommended)) {
    return NextResponse.json({ error: 'Chosen level cannot exceed the recommendation' }, { status: 400 })
  }

  const { error: userErr } = await supabase.from('users').update({
    cefr_level: chosen,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
    reinforcement_target_level: null,
  }).eq('id', user.id)
  if (userErr) return NextResponse.json({ error: 'Failed to save level' }, { status: 500 })

  const { error: historyErr } = await supabase.from('level_history').insert({
    user_id: user.id,
    from_level: null,
    to_level: chosen,
    reason: chosen === recommended ? 'placement_recommended' : 'placement_chose_lower',
  })
  if (historyErr) return NextResponse.json({ error: 'Failed to save level' }, { status: 500 })

  return NextResponse.json({ level: chosen })
}
