import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getTopicsForLevel } from '@/lib/topics'
import { ThemeToggle } from '@/components/ThemeToggle'
import { StartLessonButton } from '@/components/lesson/StartLessonButton'

const LEVEL_LABELS: Record<string, string> = {
  A1: 'A1 — Iniciante',
  A2: 'A2 — Básico',
  B1: 'B1 — Intermediário',
  B2: 'B2 — Intermediário Avançado',
  C1: 'C1 — Avançado',
  C2: 'C2 — Proficiente',
}

export default async function LicoesPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: topicRows }] = await Promise.all([
    supabase.from('users').select('cefr_level, streak_days').eq('id', user.id).single(),
    supabase.from('user_topic_progress').select('topic_id').eq('user_id', user.id),
  ])

  const cefrLevel = (userData as { cefr_level?: string } | null)?.cefr_level ?? 'A1'
  const streakDays = (userData as { streak_days?: number } | null)?.streak_days ?? 0
  const taughtTopicIds = new Set(((topicRows ?? []) as { topic_id: string }[]).map(r => r.topic_id))
  const allTopics = getTopicsForLevel(cefrLevel)
  const nextTopic = allTopics.find(t => !taughtTopicIds.has(t.key)) ?? allTopics[0]
  const completedTopics = allTopics.filter(t => taughtTopicIds.has(t.key)).length

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="text-base font-bold text-content-light dark:text-content-dark">
          Minhas Aulas
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full flex flex-col gap-6">
        {/* Level + streak */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-interactive uppercase tracking-wide">
            {LEVEL_LABELS[cefrLevel] ?? cefrLevel}
          </span>
          {streakDays > 0 && (
            <span className="text-sm font-bold text-orange-400">🔥 {streakDays} dias</span>
          )}
        </div>

        {/* Progress bar */}
        {allTopics.length > 0 && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              Tópicos concluídos
            </p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-1">
              {completedTopics} / {allTopics.length}
            </p>
            <div className="mt-3 h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-interactive transition-all duration-500"
                style={{ width: `${(completedTopics / Math.max(allTopics.length, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Next AI lesson card */}
        {nextTopic && (
          <div className="p-5 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-4">
            <div>
              <p className="text-xs text-brand-interactive font-semibold uppercase tracking-wide mb-2">
                ✨ Próxima aula personalizada por IA
              </p>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{nextTopic.emoji}</span>
                <div>
                  <p className="text-base font-bold text-content-light dark:text-content-dark">
                    {nextTopic.labelPt}
                  </p>
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                    ~{nextTopic.estimatedMinutes} min
                  </p>
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

        {/* Topic checklist */}
        {allTopics.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
              Tópicos do nível {cefrLevel}
            </h2>
            <div className="flex flex-col gap-2">
              {allTopics.map(topic => {
                const done = taughtTopicIds.has(topic.key)
                return (
                  <div
                    key={topic.key}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
                  >
                    <span className="text-2xl">{topic.emoji}</span>
                    <p className={`flex-1 text-sm font-medium ${done ? 'line-through text-content-light-secondary dark:text-content-dark-secondary' : 'text-content-light dark:text-content-dark'}`}>
                      {topic.labelPt}
                    </p>
                    {done && <span className="text-green-500 text-sm font-bold">✓</span>}
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
