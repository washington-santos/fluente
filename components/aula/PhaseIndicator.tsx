interface PhaseIndicatorProps {
  assistantMessageCount: number
}

const PHASES = [
  { label: 'Aquecimento', minCount: 0, emoji: '🔥' },
  { label: 'Revisão de erros', minCount: 2, emoji: '✏️' },
  { label: 'Prática', minCount: 4, emoji: '💪' },
  { label: 'Conversa livre', minCount: 10, emoji: '🗣️' },
] as const

export function PhaseIndicator({ assistantMessageCount }: PhaseIndicatorProps) {
  const currentIndex = PHASES.reduce((acc, phase, i) => {
    return assistantMessageCount >= phase.minCount ? i : acc
  }, 0)

  const progressPct = Math.min(
    100,
    currentIndex === PHASES.length - 1
      ? 100
      : ((assistantMessageCount - PHASES[currentIndex].minCount) /
          (PHASES[currentIndex + 1].minCount - PHASES[currentIndex].minCount)) *
          100,
  )

  return (
    <div className="px-4 py-2" data-testid="phase-indicator">
      {/* Phase label */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" aria-hidden>{PHASES[currentIndex].emoji}</span>
          <span className="text-xs font-semibold text-content-light dark:text-content-dark">
            {PHASES[currentIndex].label}
          </span>
        </div>
        <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          {currentIndex + 1}/{PHASES.length}
        </span>
      </div>

      {/* Progress bar track */}
      <div className="relative h-1.5 rounded-full bg-surface-light-card dark:bg-surface-dark-card overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-interactive transition-all duration-500 ease-out"
          style={{ width: `${((currentIndex / (PHASES.length - 1)) * 100 * 0.9) + (progressPct * 0.1 * (1 / (PHASES.length - 1)) * 100)}%` }}
        />
        {/* Phase dots */}
        {PHASES.map((phase, i) => {
          const dotPct = (i / (PHASES.length - 1)) * 100
          const isPassed = i <= currentIndex
          return (
            <div
              key={phase.label}
              className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-colors ${
                i === currentIndex
                  ? 'bg-brand-interactive border-brand-interactive'
                  : isPassed
                  ? 'bg-brand-interactive/40 border-brand-interactive/40'
                  : 'bg-surface-light dark:bg-surface-dark border-surface-light-card dark:border-surface-dark-card'
              }`}
              style={{ left: `calc(${dotPct}% - 4px)` }}
              data-testid={`phase-${i}`}
              aria-label={`${phase.label}${i === currentIndex ? ' (atual)' : ''}`}
            />
          )
        })}
      </div>

      {/* Phase names below */}
      <div className="flex justify-between mt-1">
        {PHASES.map((phase, i) => (
          <span
            key={phase.label}
            className={`text-[10px] transition-colors ${
              i === currentIndex
                ? 'text-brand-interactive font-semibold'
                : i < currentIndex
                ? 'text-brand-interactive/60'
                : 'text-content-light-secondary dark:text-content-dark-secondary'
            }`}
          >
            {i === 0 ? phase.label : i === PHASES.length - 1 ? phase.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
