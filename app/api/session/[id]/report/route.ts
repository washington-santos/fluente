import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getMissionForDate } from '@/lib/missions'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, duration_seconds, started_at')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: messages }, { data: userData }, { data: missionLog }] = await Promise.all([
    supabase
      .from('messages')
      .select('role, had_correction, pronunciation_hint')
      .eq('session_id', sessionId),
    supabase
      .from('users')
      .select('cefr_level')
      .eq('id', user.id)
      .single(),
    supabase
      .from('daily_missions_log')
      .select('completed_at')
      .eq('user_id', user.id)
      .eq('date', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .maybeSingle(),
  ])

  const msgs = messages ?? []
  const userMessages = msgs.filter((m: { role: string }) => m.role === 'user').length
  const corrections = msgs.filter((m: { had_correction: boolean }) => m.had_correction).length
  const pronunciationHints = msgs.filter((m: { pronunciation_hint: string | null }) => m.pronunciation_hint).length

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const mission = getMissionForDate(userData?.cefr_level, today)

  // Check if completed via log OR if current session meets the threshold
  const missionCompleted = !!missionLog?.completed_at || userMessages >= mission.minUserTurns

  return NextResponse.json({
    userMessages,
    corrections,
    pronunciationHints,
    durationSeconds: session.duration_seconds ?? 0,
    missionCompleted,
    missionTitle: mission.titlePt,
  })
}
