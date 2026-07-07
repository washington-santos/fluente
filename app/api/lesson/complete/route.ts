import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getLessonBySlug, getNextLesson } from '@/lib/curriculum'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lesson_slug } = await request.json() as {
    lesson_slug: string
    vocab_scores?: Record<string, number>
  }

  let lesson
  try {
    lesson = getLessonBySlug(lesson_slug)
  } catch {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }
  if (lesson.unlock_after) {
    const { data: prereq } = await supabase
      .from('user_lesson_progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('lesson_slug', lesson.unlock_after)
      .maybeSingle()
    if (!prereq || prereq.status !== 'completed') {
      return NextResponse.json({ error: 'Lesson locked' }, { status: 403 })
    }
  }

  // Use server-stored scores, not client-supplied ones
  const { data: existingProg } = await supabase
    .from('user_lesson_progress')
    .select('vocab_scores')
    .eq('user_id', user.id)
    .eq('lesson_slug', lesson_slug)
    .maybeSingle()
  const serverVocabScores = (existingProg?.vocab_scores as Record<string, number>) ?? {}

  const scores = Object.values(serverVocabScores)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const xp = avg >= 0.8 ? lesson.xp_reward + 10 : lesson.xp_reward

  await supabase
    .from('user_lesson_progress')
    .upsert({
      user_id: user.id,
      lesson_slug,
      status: 'completed',
      vocab_scores: serverVocabScores,
      completed_at: new Date().toISOString(),
      xp_earned: xp,
    }, { onConflict: 'user_id,lesson_slug' })

  const nextLesson = getNextLesson(lesson_slug)
  if (nextLesson) {
    // Only create progress row if it doesn't already exist
    const { data: existing } = await supabase
      .from('user_lesson_progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('lesson_slug', nextLesson.slug)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from('user_lesson_progress')
        .insert({
          user_id: user.id,
          lesson_slug: nextLesson.slug,
          status: 'available',
          current_step_index: 0,
          vocab_scores: {},
        })
    }
  }

  return NextResponse.json({ ok: true, xp_earned: xp, next_lesson_slug: nextLesson?.slug ?? null })
}
