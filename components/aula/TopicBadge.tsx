'use client'

interface TopicBadgeProps {
  topic: string
}

export function TopicBadge({ topic }: TopicBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-light-card dark:bg-surface-dark-card">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-cta flex-shrink-0" />
      <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary font-medium">
        {topic}
      </span>
    </div>
  )
}
