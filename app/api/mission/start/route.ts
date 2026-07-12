import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getOrGenerateTodaysMission } from '@/lib/missions'

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('teacher_id, cefr_level')
    .eq('id', user.id)
    .single()

  if (!userData?.teacher_id) return NextResponse.json({ error: 'No teacher assigned' }, { status: 400 })

  const mission = await getOrGenerateTodaysMission(user.id, supabase)

  // Close dangling open sessions so GET /api/session finds the new one
  // (same pattern as app/api/lesson/generate/route.ts)
  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: userData.teacher_id,
      mode: 'daily',
      topic: mission.missionKey,
      lesson_topic_id: mission.missionKey,
      lesson_plan_json: {
        title_pt: mission.titlePt,
        objective_pt: mission.descriptionPt,
        teacher_greeting: `Today's mission: ${mission.descriptionPt}. Let's work on that together!`,
        lesson_instructions: `Guide the student toward accomplishing this mission during the conversation: "${mission.descriptionPt}". Don't announce the mission mechanically — weave it naturally into the conversation.`,
        vocabulary_focus: [],
      },
    })
    .select('id')
    .single()

  if (error || !newSession) return NextResponse.json({ error: error?.message ?? 'Session creation failed' }, { status: 500 })

  return NextResponse.json({ session_id: newSession.id })
}
