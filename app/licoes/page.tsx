import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import { LessonCard } from '@/components/lesson/LessonCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { UserLessonProgress } from '@/types/lesson'

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

  const [{ data: progressRows }, { data: userData }] = await Promise.all([
    supabase
      .from('user_lesson_progress')
      .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
      .eq('user_id', user.id),
    supabase.from('users').select('cefr_level').eq('id', user.id).single(),
  ])

  const userLevel = (userData?.cefr_level as string | null) ?? 'A1'

  const allLessons = getAllLessons()
  // Show lessons at or below the user's CEFR level
  const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const userLevelIndex = LEVEL_ORDER.indexOf(userLevel)
  const eligibleLevels = LEVEL_ORDER.slice(0, userLevelIndex + 1)
  const lessons = allLessons.filter(l => eligibleLevels.includes(l.level))

  const mergedBase = mergeWithProgress(lessons, (progressRows ?? []) as UserLessonProgress[])
  const merged = [...mergedBase]

  if (merged[0] && !merged[0].progress) {
    merged[0] = {
      ...merged[0],
      progress: { lesson_slug: merged[0].slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 },
    }
  }

  const completedCount = merged.filter(l => l.progress?.status === 'completed').length

  // Group lessons by level
  const lessonsByLevel = eligibleLevels.reduce<Record<string, typeof merged>>((acc, lvl) => {
    acc[lvl] = merged.filter(l => l.level === lvl)
    return acc
  }, {})

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
          Minhas Lições
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full flex flex-col gap-6">
        {/* User level badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-interactive uppercase tracking-wide">
            Seu nível: {LEVEL_LABELS[userLevel] ?? userLevel}
          </span>
        </div>

        {/* Progress summary */}
        {merged.length > 0 && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              Seu progresso
            </p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-1">
              {completedCount} / {merged.length} lições
            </p>
            <div className="mt-3 h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-interactive transition-all duration-500"
                style={{ width: `${(completedCount / Math.max(merged.length, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Lessons grouped by level */}
        {merged.length === 0 ? (
          <div className="p-6 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center flex flex-col gap-2">
            <p className="text-base font-semibold text-content-light dark:text-content-dark">
              Conteúdo {LEVEL_LABELS[userLevel] ?? userLevel} em breve!
            </p>
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              Estamos preparando lições para o seu nível. Por enquanto, pratique com a sua professora virtual na aba Aula.
            </p>
            <Link
              href="/aula"
              className="mt-3 py-3 px-4 rounded-xl bg-brand-cta text-content-dark text-sm font-semibold hover:opacity-90 transition-opacity text-center"
            >
              Ir para a Aula
            </Link>
          </div>
        ) : (
          eligibleLevels.map(lvl => {
            const lvlLessons = lessonsByLevel[lvl]
            if (!lvlLessons?.length) return null
            return (
              <section key={lvl}>
                <h2 className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
                  Nível {LEVEL_LABELS[lvl] ?? lvl}
                </h2>
                <div className="flex flex-col gap-3">
                  {lvlLessons.map(lesson => (
                    <LessonCard key={lesson.slug} lesson={lesson} />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </main>
  )
}
