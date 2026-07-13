import type { WarmupReviewStep as StepType } from '@/types/lesson'

interface WarmupReviewStepProps {
  step: StepType
  onContinue: () => void
}

export function WarmupReviewStep({ step, onContinue }: WarmupReviewStepProps) {
  const hasContent = !!step.recent_summary_pt || step.frequent_errors_pt.length > 0 || step.recent_words.length > 0

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Antes de começar
        </p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-1">
          Revisão rápida
        </h2>
      </div>

      {!hasContent && (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Vamos começar!
        </p>
      )}

      {step.recent_summary_pt && (
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
            Na última aula
          </p>
          <p className="text-sm text-content-light dark:text-content-dark">{step.recent_summary_pt}</p>
        </div>
      )}

      {step.frequent_errors_pt.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">
            Fique de olho
          </p>
          <ul className="flex flex-col gap-1.5">
            {step.frequent_errors_pt.map((err, i) => (
              <li key={i} className="text-sm text-content-light dark:text-content-dark">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {step.recent_words.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
            Palavras recentes
          </p>
          <div className="flex flex-wrap gap-2">
            {step.recent_words.map(w => (
              <span key={w} className="px-3 py-1.5 rounded-full text-sm bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Continuar →
      </button>
    </div>
  )
}
