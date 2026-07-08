import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import type { UserLessonProgress } from '@/types/lesson'

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: progressRows }, { data: userData }] = await Promise.all([
    supabase
      .from('user_lesson_progress')
      .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
      .eq('user_id', user.id),
    supabase.from('users').select('cefr_level').eq('id', user.id).single(),
  ])

  const userLevel = (userData?.cefr_level as string | null) ?? 'A1'
  const userLevelIndex = LEVEL_ORDER.indexOf(userLevel)
  const eligibleLevels = new Set(LEVEL_ORDER.slice(0, userLevelIndex + 1))

  const allLessons = getAllLessons()
  const lessons = allLessons.filter(l => eligibleLevels.has(l.level))
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
