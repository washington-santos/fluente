import type { SupabaseClient } from '@supabase/supabase-js'

export interface StudentContext {
  userId: string
  name: string | null
  cefrLevel: string
  personalContext: string[]
  goal: string | null
  focusAreas: string[]
  taughtTopicIds: string[]
  topicsNeedingReview: string[]
  frequentErrors: string[]
  recentSessionSummary: string | null
  biggestDifficulty: string | null
  streakDays: number
}

export async function getStudentContext(userId: string, supabase: SupabaseClient): Promise<StudentContext> {
  const [
    { data: userData },
    { data: planData },
    { data: topicRows },
    { data: memoryData },
    { data: errorRows },
    { data: placementData },
  ] = await Promise.all([
    supabase.from('users').select('name, cefr_level, personal_context, streak_days').eq('id', userId).single(),
    supabase.from('learning_plans').select('goal, focus_areas').eq('user_id', userId).maybeSingle(),
    supabase.from('user_topic_progress').select('topic_id, mastery_status, taught_count').eq('user_id', userId),
    supabase.from('session_memory').select('summary').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('errors_log').select('error_text').eq('user_id', userId).is('resolved_at', null).order('seen_count', { ascending: false }).limit(3),
    supabase.from('placement_results').select('biggest_difficulty').eq('user_id', userId).maybeSingle(),
  ])

  const taughtTopicIds = (topicRows ?? [])
    .filter((r: { taught_count: number }) => r.taught_count >= 1)
    .map((r: { topic_id: string }) => r.topic_id)

  const topicsNeedingReview = (topicRows ?? [])
    .filter((r: { mastery_status: string | null; taught_count: number }) =>
      r.mastery_status === 'needs_reinforcement' || (r.mastery_status === 'learning' && r.taught_count >= 1))
    .map((r: { topic_id: string }) => r.topic_id)

  return {
    userId,
    name: (userData as { name?: string | null } | null)?.name ?? null,
    cefrLevel: (userData as { cefr_level?: string } | null)?.cefr_level ?? 'A1',
    personalContext: ((userData as { personal_context?: string[] | null } | null)?.personal_context) ?? [],
    goal: (planData as { goal?: string | null } | null)?.goal ?? null,
    focusAreas: ((planData as { focus_areas?: string[] | null } | null)?.focus_areas) ?? [],
    taughtTopicIds,
    topicsNeedingReview,
    frequentErrors: ((errorRows ?? []) as { error_text: string }[]).map(e => e.error_text).filter(Boolean),
    recentSessionSummary: (memoryData as { summary?: string | null } | null)?.summary ?? null,
    biggestDifficulty: (placementData as { biggest_difficulty?: string | null } | null)?.biggest_difficulty ?? null,
    streakDays: (userData as { streak_days?: number } | null)?.streak_days ?? 0,
  }
}
