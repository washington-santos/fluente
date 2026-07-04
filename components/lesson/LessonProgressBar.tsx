interface LessonProgressBarProps {
  currentIndex: number
  total: number
}

export function LessonProgressBar({ currentIndex, total }: LessonProgressBarProps) {
  const pct = total <= 1 ? 100 : (currentIndex / (total - 1)) * 100
  return (
    <div
      className="h-1.5 bg-surface-light-card dark:bg-surface-dark-card rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemax={total}
    >
      <div
        className="h-full bg-brand-interactive rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
