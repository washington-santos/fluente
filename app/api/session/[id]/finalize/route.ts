import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { generateSessionMemory } from '@/lib/memory'
import type { ErrorType } from '@/types'

const VALID_ERROR_TYPES = new Set<string>(['verb_tense', 'vocabulary', 'preposition', 'pronunciation', 'other'])

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
    .select('role, text, had_correction, error_text, correct_form, error_type')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const msgs: Array<{
    role: string
    text: string
    had_correction: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }> = messages ?? []

  // 1 — Generate and store session memory
  try {
    const memory = await generateSessionMemory(
      msgs.map((m) => ({ role: m.role, text: m.text })),
      userData?.name ?? 'Student',
      userData?.cefr_level ?? 'B1',
    )
    await supabase.from('session_memories').insert({
      user_id: user.id,
      summary: memory.summary,
      key_topics: memory.key_topics,
      personal_details: memory.personal_details,
    })
  } catch (err) {
    console.error('Memory generation failed:', err)
  }

  // 2 — Upsert error_log for messages with corrections
  const corrections = msgs.filter(
    (m) => m.had_correction && m.error_text && m.correct_form,
  )
  for (const c of corrections) {
    if (!VALID_ERROR_TYPES.has(c.error_type ?? '')) continue
    const { data: existing } = await supabase
      .from('error_log')
      .select('id, seen_count')
      .eq('user_id', user.id)
      .eq('error_text', c.error_text)
      .eq('correct_form', c.correct_form)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('error_log')
        .update({ seen_count: existing.seen_count + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('error_log').insert({
        user_id: user.id,
        error_type: c.error_type as ErrorType,
        error_text: c.error_text,
        correct_form: c.correct_form,
        seen_count: 1,
        last_seen_at: new Date().toISOString(),
      })
    }
  }

  // 3 — Update streak
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
