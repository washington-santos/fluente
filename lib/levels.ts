import type { CefrLevel } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTopicsForLevel } from '@/lib/topics'

export type { LevelHistoryReason } from '@/types'

export const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function levelBelow(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx > 0 ? CEFR_ORDER[idx - 1] : null
}

export function isAtOrBelow(candidate: CefrLevel, ceiling: CefrLevel): boolean {
  return CEFR_ORDER.indexOf(candidate) <= CEFR_ORDER.indexOf(ceiling)
}

export interface DowngradeResult {
  newLevel: CefrLevel
  reinforcementTargetLevel: CefrLevel
}

export async function downgradeLevel(
  supabase: SupabaseClient,
  userId: string,
  currentLevel: CefrLevel,
  reason: 'manual_downgrade' | 'confirmation_suggestion_accepted',
): Promise<DowngradeResult | null> {
  const target = levelBelow(currentLevel)
  if (!target) return null

  const { data: userRow } = await supabase
    .from('users')
    .select('reinforcement_target_level')
    .eq('id', userId)
    .single()

  const reinforcementTargetLevel =
    (userRow as { reinforcement_target_level?: CefrLevel | null } | null)?.reinforcement_target_level ?? currentLevel

  await supabase.from('users').update({
    cefr_level: target,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
    reinforcement_target_level: reinforcementTargetLevel,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId,
    from_level: currentLevel,
    to_level: target,
    reason,
  })

  return { newLevel: target, reinforcementTargetLevel }
}

export function shouldSuggestDowngrade(passedFlags: boolean[]): boolean {
  if (passedFlags.length > 5) throw new RangeError('expected at most the first 5 assessments')
  const failures = passedFlags.filter((p) => !p).length
  return failures >= 3
}

export async function checkAndApplyReinforcementReturn(
  supabase: SupabaseClient,
  userId: string,
): Promise<CefrLevel | null> {
  const { data: userRow } = await supabase
    .from('users')
    .select('cefr_level, reinforcement_target_level')
    .eq('id', userId)
    .single()

  const cefrLevel = (userRow as { cefr_level?: CefrLevel | null } | null)?.cefr_level
  const reinforcementTargetLevel = (userRow as { reinforcement_target_level?: CefrLevel | null } | null)
    ?.reinforcement_target_level

  if (!cefrLevel || !reinforcementTargetLevel) return null

  const topics = getTopicsForLevel(cefrLevel)
  if (topics.length === 0) return null

  const { data: progressRows } = await supabase
    .from('user_topic_progress')
    .select('topic_id, mastery_status')
    .eq('user_id', userId)
    .eq('cefr_level', cefrLevel)

  const masteredTopicIds = new Set(
    ((progressRows ?? []) as { topic_id: string; mastery_status: string }[])
      .filter((r) => r.mastery_status === 'mastered')
      .map((r) => r.topic_id),
  )

  const allMastered = topics.every((t) => masteredTopicIds.has(t.key))
  if (!allMastered) return null

  await supabase.from('users').update({
    cefr_level: reinforcementTargetLevel,
    reinforcement_target_level: null,
    level_confirmed_at: new Date().toISOString(),
    confirmation_suggestion_dismissed: false,
  }).eq('id', userId)

  await supabase.from('level_history').insert({
    user_id: userId,
    from_level: cefrLevel,
    to_level: reinforcementTargetLevel,
    reason: 'reinforcement_auto_return',
  })

  return reinforcementTargetLevel
}
