'use client'

import { X, MessageCircle, AlertCircle, Mic, Clock, Target } from 'lucide-react'
import { COMPETENCY_LABELS_PT, type CompetencyScores } from '@/lib/mastery'

interface AssessmentData {
  scores: CompetencyScores
  final_score: number
  passed: boolean
  failed_competencies: string[]
  feedback_pt: string
  highlight_pt: string
  attempt_count: number
}

interface SessionReportProps {
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
  assessment?: AssessmentData | null
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function ScoreBar({ label, score, isEssential, failed }: { label: string; score: number; isEssential: boolean; failed: boolean }) {
  const color = failed ? 'bg-red-500' : score >= 65 ? 'bg-green-500' : 'bg-yellow-400'
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs w-28 shrink-0 ${failed ? 'text-red-400 font-semibold' : 'text-content-light-secondary dark:text-content-dark-secondary'}`}>
        {label}{isEssential ? ' *' : ''}
      </span>
      <div className="flex-1 h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${failed ? 'text-red-400' : 'text-content-light dark:text-content-dark'}`}>
        {score}%
      </span>
    </div>
  )
}

export function SessionReport({
  userMessages,
  corrections,
  pronunciationHints,
  durationSeconds,
  missionCompleted,
  missionTitle,
  assessment,
  onClose,
}: SessionReportProps) {
  const essentials = new Set(['speaking', 'listening', 'pronunciation'])
  const failedSet = new Set(assessment?.failed_competencies ?? [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-content-light dark:text-content-dark">
            Resumo da aula
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar resumo"
            className="text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mastery assessment */}
        {assessment && (
          <div className="flex flex-col gap-4">
            {/* Pass/retry banner */}
            <div className={`rounded-xl p-4 flex flex-col gap-2 ${assessment.passed ? 'bg-green-50 dark:bg-green-950/30' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${assessment.passed ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {assessment.passed ? '🎉 Tópico dominado!' : '📚 Continue praticando'}
                </span>
                <span className={`text-xl font-black ${assessment.passed ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {assessment.final_score}%
                </span>
              </div>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
                {assessment.feedback_pt}
              </p>
              {!assessment.passed && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                  Mínimo: 65% geral e 60% em Conversação, Compreensão e Pronúncia.
                </p>
              )}
            </div>

            {/* Competency bars */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
                Competências <span className="font-normal normal-case">(* obrigatório ≥ 60%)</span>
              </p>
              {(Object.keys(COMPETENCY_LABELS_PT) as Array<keyof CompetencyScores>).map(key => (
                <ScoreBar
                  key={key}
                  label={COMPETENCY_LABELS_PT[key]}
                  score={assessment.scores[key]}
                  isEssential={essentials.has(key)}
                  failed={failedSet.has(key)}
                />
              ))}
            </div>

            {/* Highlight */}
            <p className="text-xs text-content-light dark:text-content-dark italic">
              ✨ {assessment.highlight_pt}
            </p>
          </div>
        )}

        {/* Session stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <MessageCircle size={16} className="text-brand-cta" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{userMessages}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">falas enviadas</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <AlertCircle size={16} className="text-brand-streak" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{corrections}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">erros corrigidos</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Mic size={16} className="text-amber-500" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{pronunciationHints}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">dicas de pronúncia</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Clock size={16} className="text-content-light-secondary dark:text-content-dark-secondary" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{formatDuration(durationSeconds)}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">duração</p>
          </div>
        </div>

        <div className={`rounded-xl p-3 flex items-center gap-3 ${
          missionCompleted ? 'bg-green-50 dark:bg-green-950/20' : 'bg-surface-light-card dark:bg-surface-dark-card'
        }`}>
          <Target size={20} className={missionCompleted ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary'} />
          <div>
            <p className={`text-sm font-semibold ${missionCompleted ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'}`}>
              {missionCompleted ? 'Missão concluída!' : 'Missão do dia'}
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{missionTitle}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
        >
          {assessment?.passed ? 'Avançar para o próximo tópico →' : 'Praticar novamente →'}
        </button>
      </div>
    </div>
  )
}
