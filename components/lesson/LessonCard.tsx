import Link from 'next/link'
import type { LessonWithProgress } from '@/types/lesson'

interface LessonCardProps {
  lesson: LessonWithProgress
}

export function LessonCard({ lesson }: LessonCardProps) {
  const status = lesson.progress?.status ?? (lesson.unlock_after ? 'locked' : 'available')
  const isLocked = status === 'locked'
  const isCompleted = status === 'completed'
  const isAccessible = status === 'available' || status === 'in_progress'

  const inner = (
    <div className={`p-4 rounded-xl border-2 transition-all ${
      isCompleted
        ? 'bg-brand-interactive/10 border-brand-interactive'
        : isAccessible
        ? 'bg-surface-light-card dark:bg-surface-dark-card border-brand-cta'
        : 'bg-surface-light-card dark:bg-surface-dark-card border-surface-light-card dark:border-surface-dark-card opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>{lesson.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            Lição {lesson.order}
          </p>
          <p className="font-bold text-content-light dark:text-content-dark truncate">
            {lesson.title_pt}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            ~{lesson.estimated_minutes} min · {lesson.xp_reward} XP
          </p>
        </div>
        {isCompleted && <span className="text-brand-interactive font-bold text-lg flex-shrink-0">✓</span>}
        {isLocked && <span className="flex-shrink-0" aria-label="Bloqueada">🔒</span>}
        {isAccessible && (
          <span className="text-brand-cta text-lg flex-shrink-0" aria-hidden>›</span>
        )}
      </div>
      {status === 'in_progress' && lesson.progress && (
        <div className="mt-2 h-1 rounded-full bg-surface-light dark:bg-surface-dark">
          <div
            className="h-full rounded-full bg-brand-cta"
            style={{ width: `${Math.min(100, (lesson.progress.current_step_index / Math.max(lesson.steps.length, 1)) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )

  if (!isAccessible) return inner
  return <Link href={`/licao/${lesson.slug}`}>{inner}</Link>
}
