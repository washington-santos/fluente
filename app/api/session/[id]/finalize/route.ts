import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { generateSessionMemory } from '@/lib/memory'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  // Verify session ownership
  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id')
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
  const { data: messages } = await supabase
    .from('messages')
    .select('role, text, had_correction')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const msgs: Array<{
    role: string
    text: string
    had_correction: boolean
  }> = messages ?? []

  // 1 — Generate and store session memory
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

  // 2 — Update streak
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const lastDate = userData?.last_session_at ? userData.last_session_at.slice(0, 10) : null

  let newStreak = userData?.streak_days ?? 0
  if (lastDate === today) {
    // Already counted today — no change
  } else if (lastDate === yesterday) {
    newStreak += 1
  } else {
    newStreak = 1
  }

  await supabase
    .from('users')
    .update({ streak_days: newStreak, last_session_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
