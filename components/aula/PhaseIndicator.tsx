interface PhaseIndicatorProps {
  assistantMessageCount: number
}

const PHASES = [
  { label: 'Aquecimento', minCount: 0 },
  { label: 'Revisão de erros', minCount: 2 },
  { label: 'Prática', minCount: 4 },
  { label: 'Conversa livre', minCount: 10 },
] as const

export function PhaseIndicator({ assistantMessageCount }: PhaseIndicatorProps) {
  const currentIndex = PHASES.reduce((acc, phase, i) => {
    return assistantMessageCount >= phase.minCount ? i : acc
  }, 0)

  return (
    <div className="flex items-center justify-center gap-1 px-4 flex-wrap" data-testid="phase-indicator">
      {PHASES.map((phase, i) => (
        <div key={phase.label} className="flex items-center gap-1">
          {i > 0 && <div className="w-3 h-px bg-gray-200 dark:bg-slate-700" />}
          <span
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              i === currentIndex
                ? 'bg-brand-interactive text-white'
                : i < currentIndex
                ? 'text-brand-interactive'
                : 'text-content-light-secondary dark:text-content-dark-secondary'
            }`}
            data-testid={`phase-${i}`}
          >
            {phase.label}
          </span>
        </div>
      ))}
    </div>
  )
}
