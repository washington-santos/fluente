import type { IntroStep as IntroStepType, VocabItem, LearningObjective } from '@/types/lesson'

interface IntroStepProps {
  step: IntroStepType
  vocabulary: VocabItem[]
  learningObjectives: LearningObjective[]
  onContinue: () => void
}

export function IntroStep({ step, vocabulary, learningObjectives, onContinue }: IntroStepProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {step.choice_explanation_pt && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-interactive/10">
          <span className="text-base" aria-hidden>💡</span>
          <p className="text-xs text-content-light dark:text-content-dark">{step.choice_explanation_pt}</p>
        </div>
      )}

      {step.npc_intro_pt && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-interactive/10">
          <span className="text-base" aria-hidden>🎭</span>
          <p className="text-xs text-content-light dark:text-content-dark">{step.npc_intro_pt}</p>
        </div>
      )}

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

      {learningObjectives.length > 0 && (
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
            Ao final desta aula você será capaz de:
          </p>
          <ul className="flex flex-col gap-2">
            {learningObjectives.map(obj => (
              <li key={obj.id} className="flex items-center gap-2">
                <span className="text-base" aria-hidden>⬜</span>
                <span className="text-sm text-content-light dark:text-content-dark">{obj.description_pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
