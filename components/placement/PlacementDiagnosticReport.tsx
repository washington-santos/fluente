import { motion } from 'framer-motion'
import type { PlacementResult, LearningPlan } from '@/types'

interface PlacementDiagnosticReportProps {
  result: PlacementResult
  plan: LearningPlan
  onContinue: () => void
}

const SKILL_LABELS: Array<{ key: keyof PlacementResult; label: string; emoji: string }> = [
  { key: 'speaking_pct',      label: 'Fala',        emoji: '🗣️' },
  { key: 'listening_pct',     label: 'Compreensão', emoji: '👂' },
  { key: 'grammar_pct',       label: 'Gramática',   emoji: '✏️' },
  { key: 'vocabulary_pct',    label: 'Vocabulário', emoji: '📚' },
  { key: 'pronunciation_pct', label: 'Pronúncia',   emoji: '🎤' },
]

function SkillBar({ pct, label, emoji }: { pct: number; label: string; emoji: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-light-secondary dark:text-content-dark-secondary">
          {emoji} {label}
        </span>
        <span className="font-bold text-content-light dark:text-content-dark">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-light-card dark:bg-surface-dark-card overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-brand-interactive"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
        />
      </div>
    </div>
  )
}

export function PlacementDiagnosticReport({ result, plan, onContinue }: PlacementDiagnosticReportProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 p-6"
    >
      <div className="text-center">
        <p className="text-4xl" aria-hidden>🎯</p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-3">
          Seu diagnóstico
        </h2>
        <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-interactive">
          <span className="text-2xl font-bold text-content-dark">{result.cefr_level}</span>
          <span className="text-sm text-content-dark opacity-80">nível geral</span>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-3">
        {SKILL_LABELS.map(({ key, label, emoji }) => (
          <SkillBar
            key={key}
            pct={result[key] as number}
            label={label}
            emoji={emoji}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Maior dificuldade
          </p>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {result.biggest_difficulty}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Maior facilidade
          </p>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {result.biggest_strength}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
          Seu plano personalizado
        </p>
        <p className="text-sm text-content-light dark:text-content-dark">{plan.plan_summary_pt}</p>
        <p className="text-xs text-brand-interactive mt-2 font-medium">
          Próximo objetivo: {result.next_objective}
        </p>
      </div>

      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
        aria-label="Começar as aulas"
      >
        Começar as aulas →
      </button>
    </motion.div>
  )
}
