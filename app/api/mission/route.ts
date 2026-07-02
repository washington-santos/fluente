import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getMissionForDate } from '@/lib/missions'

export async function GET(_request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: userData } = await supabase
    .from('users')
    .select('cefr_level')
    .eq('id', user.id)
    .single()

  const mission = getMissionForDate(userData?.cefr_level, today)

  const { data: log } = await supabase
    .from('daily_missions_log')
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  return NextResponse.json({
    mission,
    today,
    completed: !!log?.completed_at,
    completed_at: log?.completed_at ?? null,
  })
}
