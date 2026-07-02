'use client'

import { CheckCircle } from 'lucide-react'

interface MissionCardProps {
  titlePt: string
  descriptionPt: string
  completed: boolean
}

export function MissionCard({ titlePt, descriptionPt, completed }: MissionCardProps) {
  return (
    <div className={`p-4 rounded-xl flex items-start gap-3 ${
      completed
        ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900'
        : 'bg-surface-light-card dark:bg-surface-dark-card'
    }`}>
      <CheckCircle
        size={20}
        className={`mt-0.5 flex-shrink-0 ${
          completed ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary opacity-30'
        }`}
      />
      <div>
        <p className={`text-sm font-semibold ${
          completed ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
        }`}>
          {completed ? 'Missão concluída — ' : ''}{titlePt}
        </p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
          {descriptionPt}
        </p>
      </div>
    </div>
  )
}
