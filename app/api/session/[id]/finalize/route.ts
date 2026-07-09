import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { generateSessionMemory } from '@/lib/memory'
import { getMissionForDate } from '@/lib/missions'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  // Verify session ownership; also load duration_seconds to decide streak eligibility
  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, duration_seconds')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Load user profile
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level, streak_days, last_session_at')
    .eq('id', user.id)
    .single()

  // Load all messages for this session
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('role, text, had_correction')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    console.error('Failed to load session messages:', messagesError.message)
    return NextResponse.json({ error: 'Failed to load session data' }, { status: 500 })
  }

  const msgs: Array<{
    role: string
    text: string
    had_correction: boolean
  }> = messages ?? []

  // 1 — Generate and store session memory (skip if no messages — nothing to summarise)
  if (msgs.length > 0) {
    try {
      const memory = await generateSessionMemory(
        msgs.map((m) => ({ role: m.role, text: m.text })),
        userData?.name ?? 'Student',
        userData?.cefr_level ?? 'B1',
      )
      await supabase.from('session_memory').insert({
        user_id: user.id,
        summary: memory.summary,
        key_topics: memory.key_topics,
        personal_details: memory.personal_details,
      })
    } catch (err) {
      console.error('Memory generation failed:', err)
    }
  }

  // 2 — Update streak if the session had actual practice time (duration set by /end PATCH
  // before finalize fires). Using duration_seconds avoids the race where finalize runs
  // before the conversation route has committed the last messages INSERT.
  // Use Brazil local date (UTC-3) so evening sessions don't roll to the next UTC day
  const brazilOffset = -3 * 60 * 60 * 1000

  if ((session.duration_seconds ?? 0) > 0) {
    const nowBrazil = new Date(Date.now() + brazilOffset)
    const yesterdayBrazil = new Date(Date.now() + brazilOffset - 86_400_000)
    const today = nowBrazil.toISOString().slice(0, 10)
    const yesterday = yesterdayBrazil.toISOString().slice(0, 10)
    const lastDate = userData?.last_session_at
      ? new Date(new Date(userData.last_session_at).getTime() + brazilOffset).toISOString().slice(0, 10)
      : null

    let newStreak = userData?.streak_days ?? 0
    if (lastDate === today) {
      // Already counted today — no change
    } else if (lastDate === yesterday) {
      newStreak += 1
    } else {
      newStreak = 1
    }

    const { error: streakError } = await supabase
      .from('users')
      .update({ streak_days: newStreak, last_session_at: new Date().toISOString() })
      .eq('id', user.id)
    if (streakError) console.error('Streak update failed:', streakError.message)
  }

  // 3 — Mark daily mission complete if user sent enough turns
  const userMsgCount = msgs.filter((m) => m.role === 'user').length
  const todayBrazil = new Date(Date.now() + brazilOffset).toISOString().slice(0, 10)
  const mission = getMissionForDate(userData?.cefr_level, todayBrazil)

  if (userMsgCount >= mission.minUserTurns) {
    const { error: missionError } = await supabase
      .from('daily_missions_log')
      .upsert(
        { user_id: user.id, date: todayBrazil, mission_key: mission.key },
        { onConflict: 'user_id,date', ignoreDuplicates: true },
      )
    if (missionError) console.error('Mission completion failed:', missionError.message)
  }

  return NextResponse.json({ ok: true })
}
