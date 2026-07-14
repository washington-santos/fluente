import type { CefrLevel } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function levelBelow(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx > 0 ? CEFR_ORDER[idx - 1] : null
}

export function isAtOrBelow(candidate: CefrLevel, ceiling: CefrLevel): boolean {
  return CEFR_ORDER.indexOf(candidate) <= CEFR_ORDER.indexOf(ceiling)
}

export type LevelHistoryReason =
  | 'placement_recommended'
  | 'placement_chose_lower'
  | 'confirmation_suggestion_accepted'
  | 'manual_downgrade'
  | 'reinforcement_auto_return'

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
