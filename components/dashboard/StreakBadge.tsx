interface Props {
  streakDays: number
}

export function StreakBadge({ streakDays }: Props) {
  if (streakDays === 0) {
    return (
      <div className="text-center py-3 px-6 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Comece seu streak hoje!
        </p>
      </div>
    )
  }

  return (
    <div className="text-center py-3 px-6 rounded-xl bg-brand-cta/10 border border-brand-cta/30">
      <p className="text-3xl font-bold text-brand-cta">{streakDays}</p>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
        dias seguidos
      </p>
    </div>
  )
}
