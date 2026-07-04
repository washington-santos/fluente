import type { IntroStep as IntroStepType, VocabItem } from '@/types/lesson'

interface IntroStepProps {
  step: IntroStepType
  vocabulary: VocabItem[]
  onContinue: () => void
}

export function IntroStep({ step, vocabulary, onContinue }: IntroStepProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Nesta aula
        </p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-1">
          {step.title_pt}
        </h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">
          {step.description_pt}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {vocabulary.map(v => (
          <div
            key={v.word}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
          >
            <span className="text-2xl" aria-hidden>{v.emoji}</span>
            <div>
              <p className="font-semibold text-content-light dark:text-content-dark">{v.word}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
                {v.translation_pt}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Começar →
      </button>
    </div>
  )
}
