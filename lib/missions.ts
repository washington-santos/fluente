// lib/missions.ts
import type { CefrLevel } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'

export interface DailyMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
  completed: boolean
}

const MIN_USER_TURNS_BY_LEVEL: Record<CefrLevel, number> = {
  A1: 3,
  A2: 4,
  B1: 5,
  B2: 6,
  C1: 8,
  C2: 8,
}

interface FallbackMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
}

const FALLBACK_MISSIONS: Record<CefrLevel, FallbackMission> = {
  A1: { missionKey: 'a1-intro', titlePt: 'Apresentação completa', descriptionPt: 'Apresente-se em inglês: nome, de onde você é e quantos anos tem.' },
  A2: { missionKey: 'a2-weekend', titlePt: 'Fim de semana passado', descriptionPt: 'Conte o que você fez no último fim de semana usando o passado simples.' },
  B1: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme, série ou livro em inglês e explique por quê você gosta.' },
  B2: { missionKey: 'b2-debate', titlePt: 'Debate: redes sociais', descriptionPt: 'Dê sua opinião argumentada sobre o impacto das redes sociais na saúde mental.' },
  C1: { missionKey: 'c1-interview', titlePt: 'Entrevista simulada', descriptionPt: 'Conduza uma simulação de entrevista de emprego em inglês com naturalidade e linguagem formal.' },
  C2: { missionKey: 'c2-story', titlePt: 'Narrativa nativa', descriptionPt: 'Conte uma história com estrutura narrativa completa usando expressões idiomáticas naturalmente.' },
}

function todayBrazil(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface GeneratedMission {
  mission_key?: string
  title_pt?: string
  description_pt?: string
}

async function generateMission(level: CefrLevel, userId: string, supabase: SupabaseClient): Promise<FallbackMission> {
  try {
    const context = await getStudentContext(userId, supabase)
    const contextLines: string[] = []
    if (context.goal) contextLines.push(`Goal: ${context.goal}`)
    if (context.frequentErrors.length > 0) contextLines.push(`Frequent mistakes: ${context.frequentErrors.join(', ')}`)
    if (context.topicsNeedingReview.length > 0) contextLines.push(`Topics needing review: ${context.topicsNeedingReview.join(', ')}`)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Create one short daily speaking mission for a Brazilian English student.

STUDENT:
- CEFR Level: ${level}
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}

Return ONLY valid JSON:
{"mission_key":"kebab-case-slug","title_pt":"título curto em português (máx 5 palavras)","description_pt":"uma frase no imperativo em português dizendo o que o aluno deve falar, ex: 'Fale sobre...'"}`,
      }],
    })

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as GeneratedMission
    if (!parsed.mission_key || !parsed.title_pt || !parsed.description_pt) {
      throw new Error('Incomplete mission from AI')
    }
    return { missionKey: parsed.mission_key, titlePt: parsed.title_pt, descriptionPt: parsed.description_pt }
  } catch {
    return FALLBACK_MISSIONS[level] ?? FALLBACK_MISSIONS.A1
  }
}

export async function getOrGenerateTodaysMission(
  userId: string,
  supabase: SupabaseClient,
): Promise<DailyMission> {
  const date = todayBrazil()

  const [{ data: userRow }, { data: existing }] = await Promise.all([
    supabase.from('users').select('cefr_level').eq('id', userId).single(),
    supabase
      .from('daily_missions_log')
      .select('mission_key, title_pt, description_pt, completed_at')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ])

  const level = ((userRow as { cefr_level?: CefrLevel } | null)?.cefr_level ?? 'A1') as CefrLevel
  const minUserTurns = MIN_USER_TURNS_BY_LEVEL[level] ?? 3

  if (existing) {
    const row = existing as { mission_key: string; title_pt: string; description_pt: string; completed_at: string | null }
    return {
      missionKey: row.mission_key,
      titlePt: row.title_pt,
      descriptionPt: row.description_pt,
      minUserTurns,
      completed: !!row.completed_at,
    }
  }

  const generated = await generateMission(level, userId, supabase)

  await supabase.from('daily_missions_log').insert({
    user_id: userId,
    date,
    mission_key: generated.missionKey,
    title_pt: generated.titlePt,
    description_pt: generated.descriptionPt,
  })

  return { ...generated, minUserTurns, completed: false }
}
