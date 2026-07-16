import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getTopicsForLevel } from '@/lib/topics'
import { ThemeToggle } from '@/components/ThemeToggle'
import { StartLessonButton } from '@/components/lesson/StartLessonButton'
import { getMasteryLabel, rankCompetencies, COMPETENCY_LABELS_PT } from '@/lib/mastery'
import type { CompetencyScores } from '@/lib/mastery'

const LEVEL_LABELS: Record<string, string> = {
  A1: 'A1 — Iniciante',
  A2: 'A2 — Básico',
  B1: 'B1 — Intermediário',
  B2: 'B2 — Intermediário Avançado',
  C1: 'C1 — Avançado',
  C2: 'C2 — Proficiente',
}

interface TopicRow {
  topic_id: string
  mastery_status: string | null
  best_score: number | null
}

export default async function LicoesPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: topicRows }, { data: avgScores }] = await Promise.all([
    supabase.from('users').select('cefr_level, streak_days').eq('id', user.id).single(),
    supabase.from('user_topic_progress').select('topic_id, mastery_status, best_score').eq('user_id', user.id),
    supabase.from('topic_assessments').select('speaking, listening, pronunciation, vocabulary, grammar, confidence, fluency').eq('user_id', user.id),
  ])

  const cefrLevel = (userData as { cefr_level?: string } | null)?.cefr_level ?? 'A1'
  const streakDays = (userData as { streak_days?: number } | null)?.streak_days ?? 0
  const progressMap = new Map(((topicRows ?? []) as TopicRow[]).map(r => [r.topic_id, r]))
  const allTopics = getTopicsForLevel(cefrLevel)

  const masteredTopics = allTopics.filter(t => progressMap.get(t.key)?.mastery_status === 'mastered').length
  const nextTopic = allTopics.find(t => {
    const s = progressMap.get(t.key)?.mastery_status ?? null
    return s !== 'mastered'
  }) ?? allTopics[0]

  // Average competency scores for "strengths" summary
  const assessments = (avgScores ?? []) as Array<Partial<CompetencyScores>>
  const ranked = rankCompetencies(assessments)
  const strongestCompetency = ranked.length > 0 ? COMPETENCY_LABELS_PT[ranked[0].key] : null
  const weakestCompetency = ranked.length > 0 ? COMPETENCY_LABELS_PT[ranked[ranked.length - 1].key] : null

  const dominioPct = Math.round((masteredTopics / Math.max(allTopics.length, 1)) * 100)

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link href="/dashboard" className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity">
          ← Dashboard
        </Link>
        <h1 className="text-base font-bold text-content-light dark:text-content-dark">Minhas Aulas</h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full flex flex-col gap-6">

        {/* Level + streak */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-interactive uppercase tracking-wide">
            {LEVEL_LABELS[cefrLevel] ?? cefrLevel}
          </span>
          {streakDays > 0 && <span className="text-sm font-bold text-orange-400">🔥 {streakDays} dias</span>}
        </div>

        {/* Mastery progress */}
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">Domínio do nível</p>
              <p className="text-3xl font-black text-content-light dark:text-content-dark mt-0.5">{dominioPct}%</p>
            </div>
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              {masteredTopics}/{allTopics.length} tópicos
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
            <div className="h-full rounded-full bg-brand-interactive transition-all duration-700" style={{ width: `${dominioPct}%` }} />
          </div>
          {(strongestCompetency || weakestCompetency) && (
            <div className="flex gap-3 mt-1">
              {strongestCompetency && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">Mais forte</p>
                  <p className="text-xs font-bold text-green-500 mt-0.5">✓ {strongestCompetency}</p>
                </div>
              )}
              {weakestCompetency && strongestCompetency !== weakestCompetency && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">A melhorar</p>
                  <p className="text-xs font-bold text-amber-400 mt-0.5">↗ {weakestCompetency}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Next AI lesson */}
        {nextTopic && (
          <div className="p-5 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-4">
            <div>
              <p className="text-xs text-brand-interactive font-semibold uppercase tracking-wide mb-2">
                ✨ Próxima aula personalizada por IA
              </p>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{nextTopic.emoji}</span>
                <div>
                  <p className="text-base font-bold text-content-light dark:text-content-dark">{nextTopic.labelPt}</p>
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">~{nextTopic.estimatedMinutes} min</p>
                </div>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {nextTopic.objectivesPt.map((obj, i) => (
                <li key={i} className="text-xs text-content-light-secondary dark:text-content-dark-secondary flex items-start gap-2">
                  <span className="text-brand-interactive mt-0.5 shrink-0">✓</span>
                  {obj}
                </li>
              ))}
            </ul>
            <StartLessonButton />
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-content-light-secondary dark:text-content-dark-secondary">
          <span>🟢 Dominado</span>
          <span>🟡 Em aprendizado</span>
          <span>🟠 Em revisão</span>
          <span>🔴 Reforçar</span>
          <span>⚪ Não iniciado</span>
        </div>

        {/* Topic map */}
        {allTopics.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
              Mapa de tópicos — {cefrLevel}
            </h2>
            <div className="flex flex-col gap-2">
              {allTopics.map(topic => {
                const p = progressMap.get(topic.key)
                const { emoji: statusEmoji, label: statusLabel } = getMasteryLabel(p?.mastery_status ?? null)
                const score = p?.best_score ?? null
                const mastered = p?.mastery_status === 'mastered'
                return (
                  <div key={topic.key} className="flex items-center gap-3 p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
                    <span className="text-xl">{statusEmoji}</span>
                    <span className="text-xl">{topic.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${mastered ? 'text-content-light-secondary dark:text-content-dark-secondary' : 'text-content-light dark:text-content-dark'}`}>
                        {topic.labelPt}
                      </p>
                      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{statusLabel}</p>
                    </div>
                    {score !== null && (
                      <span className={`text-xs font-bold ${score >= 65 ? 'text-green-500' : 'text-amber-400'}`}>
                        {score}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
