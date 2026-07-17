import type { SupabaseClient } from '@supabase/supabase-js'

export type BadgeKey =
  | 'primeira_conversa'
  | 'sequencia_3'
  | 'sequencia_7'
  | 'sequencia_30'
  | 'primeiro_topico_dominado'
  | 'cinco_topicos_dominados'
  | 'subiu_de_nivel'
  | 'pronuncia_afiada'
  | 'perfeccionista'
  | 'dez_missoes'

export interface BadgeDefinition {
  key: BadgeKey
  title_pt: string
  description_pt: string
  icon: string // lucide-react icon name, looked up by components/dashboard/BadgeIcon.tsx
  category: 'constancia' | 'dominio'
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: 'primeira_conversa', title_pt: 'Primeira conversa', description_pt: 'Complete sua primeira sessão de prática.', icon: 'MessageCircle', category: 'constancia' },
  { key: 'sequencia_3', title_pt: 'Sequência de 3 dias', description_pt: 'Pratique 3 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'sequencia_7', title_pt: 'Sequência de 7 dias', description_pt: 'Pratique 7 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'sequencia_30', title_pt: 'Sequência de 30 dias', description_pt: 'Pratique 30 dias seguidos.', icon: 'Flame', category: 'constancia' },
  { key: 'primeiro_topico_dominado', title_pt: 'Primeiro tópico dominado', description_pt: 'Domine seu primeiro tópico.', icon: 'BookOpen', category: 'dominio' },
  { key: 'cinco_topicos_dominados', title_pt: '5 tópicos dominados', description_pt: 'Domine 5 tópicos.', icon: 'Trophy', category: 'dominio' },
  { key: 'subiu_de_nivel', title_pt: 'Subiu de nível', description_pt: 'Avance para um novo nível CEFR.', icon: 'ArrowUpCircle', category: 'dominio' },
  { key: 'pronuncia_afiada', title_pt: 'Pronúncia afiada', description_pt: 'Alcance 90%+ em pronúncia em uma avaliação.', icon: 'Mic', category: 'dominio' },
  { key: 'perfeccionista', title_pt: 'Perfeccionista', description_pt: 'Alcance 95%+ de nota final em uma avaliação.', icon: 'Sparkles', category: 'dominio' },
  { key: 'dez_missoes', title_pt: '10 missões cumpridas', description_pt: 'Complete 10 missões do dia.', icon: 'CheckCircle2', category: 'constancia' },
]

export async function checkAndAwardBadges(
  supabase: SupabaseClient,
  userId: string,
): Promise<BadgeKey[]> {
  try {
    const [
      { count: sessionCount },
      { data: userRow },
      { count: masteredCount },
      { count: levelUpCount },
      { data: assessmentRows },
    ] = await Promise.all([
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('duration_seconds', 0),
      supabase.from('users').select('streak_days, missions_completed_count').eq('id', userId).single(),
      supabase.from('user_topic_progress').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('mastery_status', 'mastered'),
      supabase.from('level_history').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('reason', 'auto_promotion'),
      supabase.from('topic_assessments').select('pronunciation, final_score').eq('user_id', userId),
    ])

    const streakDays = (userRow as { streak_days?: number } | null)?.streak_days ?? 0
    const missionsCompleted = (userRow as { missions_completed_count?: number } | null)?.missions_completed_count ?? 0
    const rows = (assessmentRows ?? []) as Array<{ pronunciation: number; final_score: number }>

    const metCriteria: BadgeKey[] = []
    if ((sessionCount ?? 0) >= 1) metCriteria.push('primeira_conversa')
    if (streakDays >= 3) metCriteria.push('sequencia_3')
    if (streakDays >= 7) metCriteria.push('sequencia_7')
    if (streakDays >= 30) metCriteria.push('sequencia_30')
    if ((masteredCount ?? 0) >= 1) metCriteria.push('primeiro_topico_dominado')
    if ((masteredCount ?? 0) >= 5) metCriteria.push('cinco_topicos_dominados')
    if ((levelUpCount ?? 0) >= 1) metCriteria.push('subiu_de_nivel')
    if (rows.some(r => r.pronunciation >= 90)) metCriteria.push('pronuncia_afiada')
    if (rows.some(r => r.final_score >= 95)) metCriteria.push('perfeccionista')
    if (missionsCompleted >= 10) metCriteria.push('dez_missoes')

    if (metCriteria.length === 0) return []

    const { data: inserted, error } = await supabase
      .from('user_badges')
      .upsert(
        metCriteria.map(key => ({ user_id: userId, badge_key: key })),
        { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
      )
      .select('badge_key')

    if (error) {
      console.error('user_badges upsert failed:', error.message)
      return []
    }

    return ((inserted ?? []) as Array<{ badge_key: BadgeKey }>).map(row => row.badge_key)
  } catch (err) {
    console.error('checkAndAwardBadges failed:', err)
    return []
  }
}
