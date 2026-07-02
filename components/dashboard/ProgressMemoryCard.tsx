interface ProgressMemoryCardProps {
  resolvedErrors: number
  newVocab: number
}

export function ProgressMemoryCard({ resolvedErrors, newVocab }: ProgressMemoryCardProps) {
  if (resolvedErrors === 0 && newVocab === 0) return null

  const parts: string[] = []
  if (resolvedErrors > 0) {
    parts.push(`corrigiu ${resolvedErrors} ${resolvedErrors === 1 ? 'erro recorrente' : 'erros recorrentes'}`)
  }
  if (newVocab > 0) {
    parts.push(`aprendeu ${newVocab} ${newVocab === 1 ? 'palavra nova' : 'palavras novas'}`)
  }

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border-l-4 border-brand-streak">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1 font-medium uppercase tracking-wide">
        Este mês
      </p>
      <p className="text-sm text-content-light dark:text-content-dark">
        Você {parts.join(' e ')}.
      </p>
    </div>
  )
}
