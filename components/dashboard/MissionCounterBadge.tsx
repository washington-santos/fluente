interface Props {
  count: number
}

export function MissionCounterBadge({ count }: Props) {
  if (count === 0) return null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex items-center gap-3">
      <span className="text-xl shrink-0">🎯</span>
      <p className="text-sm text-content-light dark:text-content-dark">
        <span className="font-bold">{count}</span> {count === 1 ? 'missão cumprida' : 'missões cumpridas'}
      </p>
    </div>
  )
}
