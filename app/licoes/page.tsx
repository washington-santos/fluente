import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import { LessonCard } from '@/components/lesson/LessonCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { UserLessonProgress } from '@/types/lesson'

export default async function LicoesPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
    .eq('user_id', user.id)

  const lessons = getAllLessons()
  let merged = mergeWithProgress(lessons, (progressRows ?? []) as UserLessonProgress[])

  if (merged[0] && !merged[0].progress) {
    merged[0] = {
      ...merged[0],
      progress: { lesson_slug: merged[0].slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 },
    }
  }

  const completedCount = merged.filter(l => l.progress?.status === 'completed').length

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
        {/* Progress summary */}
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

        {/* A1 section */}
        <section>
          <h2 className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
            Nível A1 — Iniciante
          </h2>
          <div className="flex flex-col gap-3">
            {merged.filter(l => l.level === 'A1').map(lesson => (
              <LessonCard key={lesson.slug} lesson={lesson} />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
