import type { VocabItem } from '@/types/lesson'

interface SummaryStepProps {
  vocabulary: VocabItem[]
  vocabScores: Record<string, number>
  xpEarned: number
  lessonTitle: string
  onFinish: () => void
}

export function SummaryStep({ vocabulary, vocabScores, xpEarned, lessonTitle, onFinish }: SummaryStepProps) {
  const scores = Object.values(vocabScores)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pronunciationPct = Math.round(avg * 100)

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
