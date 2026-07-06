import type { VocabItem, LearningObjective } from '@/types/lesson'

interface SummaryStepProps {
  vocabulary: VocabItem[]
  vocabScores: Record<string, number>
  learningObjectives: LearningObjective[]
  xpEarned: number
  lessonTitle: string
  onFinish: () => void
}

export function SummaryStep({ vocabulary, vocabScores, learningObjectives, xpEarned, lessonTitle, onFinish }: SummaryStepProps) {
  const scores = Object.values(vocabScores)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pronunciationPct = Math.round(avg * 100)

  const objectiveResults = learningObjectives.map(obj => {
    const wordScores = obj.vocab_words.map(w => vocabScores[w] ?? 0)
    const objAvg = wordScores.length ? wordScores.reduce((a, b) => a + b, 0) / wordScores.length : 0
    return { ...obj, achieved: objAvg >= 0.7 }
  })

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <p className="text-5xl" aria-hidden>🏆</p>
        <h2 className="text-2xl font-bold text-content-light dark:text-content-dark mt-4">
          Aula concluída!
        </h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
          {lessonTitle}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
          <p className="text-2xl font-bold text-brand-streak">+{xpEarned} XP</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">ganhos</p>
        </div>
        {pronunciationPct > 0 && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
            <p className="text-2xl font-bold text-brand-interactive">{pronunciationPct}%</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">pronúncia</p>
          </div>
        )}
      </div>

      {objectiveResults.length > 0 && (
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
            Objetivos da aula:
          </p>
          <ul className="flex flex-col gap-2">
            {objectiveResults.map(obj => (
              <li key={obj.id} className="flex items-start gap-2">
                <span className="text-base mt-0.5" aria-hidden>{obj.achieved ? '✅' : '⏳'}</span>
                <div>
                  <span className="text-sm text-content-light dark:text-content-dark">{obj.description_pt}</span>
                  {!obj.achieved && (
                    <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                      Precisa de mais prática
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Hoje você aprendeu:
        </p>
        <div className="flex flex-col gap-2">
          {vocabulary.map(v => (
            <div
              key={v.word}
              className="flex items-center gap-2 p-2 rounded-lg bg-surface-light-card dark:bg-surface-dark-card"
            >
              <span className="text-brand-interactive font-bold">✓</span>
              <span className="font-semibold text-content-light dark:text-content-dark">{v.word}</span>
              <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
                — {v.translation_pt}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onFinish}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Continuar aprendendo →
      </button>
    </div>
  )
}
