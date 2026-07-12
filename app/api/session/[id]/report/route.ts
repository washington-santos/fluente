import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getOrGenerateTodaysMission } from '@/lib/missions'

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

  const [{ data: messages }, mission] = await Promise.all([
    supabase
      .from('messages')
      .select('role, text, had_correction, pronunciation_hint')
      .eq('session_id', sessionId),
    getOrGenerateTodaysMission(user.id, supabase),
  ])

  const msgs: Array<{ role: string; text: string; had_correction: boolean; pronunciation_hint: string | null }> = messages ?? []
  const userMessages = msgs.filter((m) => m.role === 'user').length
  const corrections = msgs.filter((m) => m.had_correction).length
  const pronunciationHints = msgs.filter((m) => m.pronunciation_hint).length

  let missionCompleted = mission.completed

  if (!missionCompleted && userMessages >= mission.minUserTurns) {
    const transcript = msgs.filter((m) => m.role === 'user').map((m) => m.text).join(' ')

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 20,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: `Mission: "${mission.descriptionPt}"\n\nStudent said (in this conversation): "${transcript}"\n\nDid the student's conversation address this mission? Respond ONLY valid JSON: {"covered": true or false}`,
        }],
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { covered?: boolean }

      if (parsed.covered === true) {
        missionCompleted = true
        const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

        const { data: updatedRows, error: missionError } = await supabase
          .from('daily_missions_log')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('date', today)
          .is('completed_at', null)
          .select('id')
        if (missionError) console.error('Mission completion update failed:', missionError.message)

        if (updatedRows && updatedRows.length > 0) {
          const { error: rpcError } = await supabase.rpc('increment_missions_completed', { p_user_id: user.id })
          if (rpcError) console.error('Mission counter increment failed:', rpcError.message)
        }
      }
    } catch (err) {
      console.error('Mission verification failed:', err)
    }
  }

  return NextResponse.json({
    userMessages,
    corrections,
    pronunciationHints,
    durationSeconds: session.duration_seconds ?? 0,
    missionCompleted,
    missionTitle: mission.titlePt,
  })
}
