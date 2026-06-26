import type { ErrorType } from '@/types'

const ERROR_LABELS: Record<ErrorType, string> = {
  verb_tense: 'Tempo verbal',
  vocabulary: 'Vocabulário',
  preposition: 'Preposição',
  pronunciation: 'Pronúncia',
  other: 'Outro',
}

interface Props {
  errorText: string
  correctForm: string
  errorType: ErrorType
  seenCount: number
}

export function ErrorCard({ errorText, correctForm, errorType, seenCount }: Props) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
      <div>
        <p className="text-sm text-content-light dark:text-content-dark">
          <span className="line-through text-content-light-secondary dark:text-content-dark-secondary">{errorText}</span>
          <span className="mx-2 text-content-light-secondary dark:text-content-dark-secondary">→</span>
          <span className="font-medium text-brand-cta">{correctForm}</span>
        </p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
          {ERROR_LABELS[errorType]}
        </p>
      </div>
      <span className="text-xs font-bold text-brand-cta">{seenCount}×</span>
    </div>
  )
}
