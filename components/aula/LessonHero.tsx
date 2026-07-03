'use client'

import type { Topic } from '@/lib/topics'
import type { CefrLevel } from '@/types'

interface LessonHeroProps {
  topic: Topic
  cefrLevel: CefrLevel | null
}

export function LessonHero({ topic, cefrLevel }: LessonHeroProps) {
  return (
    <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl" role="img" aria-label={topic.labelPt}>{topic.emoji}</span>
          <div>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary font-medium uppercase tracking-wide">
              Tema da aula
            </p>
            <h2 className="text-lg font-bold text-content-light dark:text-content-dark leading-tight">
              {topic.labelPt}
            </h2>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {cefrLevel && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-interactive/10 text-brand-interactive">
              {cefrLevel}
            </span>
          )}
          <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary whitespace-nowrap">
            ~{topic.estimatedMinutes} min
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary mb-2 uppercase tracking-wide">
          Hoje você aprenderá:
        </p>
        <ul className="flex flex-col gap-1.5">
          {topic.objectivesPt.map((obj) => (
            <li key={obj} className="flex items-start gap-2 text-sm text-content-light dark:text-content-dark">
              <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
