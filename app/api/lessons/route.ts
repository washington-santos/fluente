import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import type { UserLessonProgress } from '@/types/lesson'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
    .eq('user_id', user.id)

  const lessons = getAllLessons()
  const progress = (progressRows ?? []) as UserLessonProgress[]
  const merged = mergeWithProgress(lessons, progress)

  // Ensure first lesson is always available even without a DB row
  if (merged[0] && !merged[0].progress) {
    merged[0] = {
      ...merged[0],
      progress: { lesson_slug: merged[0].slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 },
    }
  }

  return NextResponse.json({ lessons: merged })
}
