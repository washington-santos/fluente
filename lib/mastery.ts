export const COMPETENCY_WEIGHTS = {
  speaking: 0.25,
  listening: 0.20,
  pronunciation: 0.20,
  vocabulary: 0.15,
  grammar: 0.10,
  confidence: 0.05,
  fluency: 0.05,
} as const

export const ESSENTIAL_COMPETENCIES = ['speaking', 'listening', 'pronunciation'] as const
export const ESSENTIAL_MIN_SCORE = 60
export const OVERALL_MIN_SCORE = 65

export const METHODOLOGIES = ['conversation', 'roleplay', 'story', 'challenge', 'game'] as const
export type Methodology = typeof METHODOLOGIES[number]

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 90]

export interface CompetencyScores {
  speaking: number
  listening: number
  pronunciation: number
  vocabulary: number
  grammar: number
  confidence: number
  fluency: number
}

export const COMPETENCY_LABELS_PT: Record<keyof CompetencyScores, string> = {
  speaking: 'Conversação',
  listening: 'Compreensão',
  pronunciation: 'Pronúncia',
  vocabulary: 'Vocabulário',
  grammar: 'Gramática',
  confidence: 'Confiança',
  fluency: 'Fluência',
}

export function calculateFinalScore(scores: CompetencyScores): number {
  return Math.round(
    scores.speaking * COMPETENCY_WEIGHTS.speaking +
    scores.listening * COMPETENCY_WEIGHTS.listening +
    scores.pronunciation * COMPETENCY_WEIGHTS.pronunciation +
    scores.vocabulary * COMPETENCY_WEIGHTS.vocabulary +
    scores.grammar * COMPETENCY_WEIGHTS.grammar +
    scores.confidence * COMPETENCY_WEIGHTS.confidence +
    scores.fluency * COMPETENCY_WEIGHTS.fluency,
  )
}

export function checkPassed(scores: CompetencyScores): { passed: boolean; failedCompetencies: string[] } {
  const finalScore = calculateFinalScore(scores)
  const failedEssentials = ESSENTIAL_COMPETENCIES.filter(c => scores[c] < ESSENTIAL_MIN_SCORE)
  return {
    passed: finalScore >= OVERALL_MIN_SCORE && failedEssentials.length === 0,
    failedCompetencies: failedEssentials,
  }
}

export function nextMethodology(lastMethodology: string | null): Methodology {
  const idx = METHODOLOGIES.indexOf(lastMethodology as Methodology)
  return METHODOLOGIES[(idx + 1) % METHODOLOGIES.length]
}

export function nextReviewDate(currentIntervalDays: number): { date: Date; nextInterval: number } {
  const idx = REVIEW_INTERVALS_DAYS.indexOf(currentIntervalDays)
  const nextInterval = REVIEW_INTERVALS_DAYS[Math.min(idx + 1, REVIEW_INTERVALS_DAYS.length - 1)]
  const date = new Date()
  date.setDate(date.getDate() + currentIntervalDays)
  return { date, nextInterval }
}

export const METHODOLOGY_INSTRUCTIONS: Record<Methodology, string> = {
  conversation: 'Use a natural Q&A conversation. Teacher asks open questions about the topic, student answers freely.',
  roleplay: 'Set up a real-world role-play scenario using the topic (e.g. at a store, meeting someone, ordering food). Give student a clear role.',
  story: 'Tell a short story using the topic vocabulary. Then ask the student comprehension questions about the story.',
  challenge: 'Use a quick-fire challenge format — rapid short questions requiring brief answers. Increase difficulty gradually.',
  game: 'Use a game format: vocabulary guessing (describe without saying the word), true/false, or fill-in-the-blank activities.',
}

export const METHODOLOGY_NAMES_PT: Record<Methodology, string> = {
  conversation: 'Conversa livre',
  roleplay: 'Roleplay',
  story: 'Narrativa',
  challenge: 'Desafio rápido',
  game: 'Jogo educativo',
}

export function getMasteryLabel(status: string | null): { emoji: string; label: string; color: string } {
  switch (status) {
    case 'mastered':  return { emoji: '🟢', label: 'Dominado',          color: 'text-green-500' }
    case 'reviewing': return { emoji: '🟠', label: 'Em revisão',        color: 'text-orange-400' }
    case 'learning':  return { emoji: '🟡', label: 'Em aprendizado',    color: 'text-yellow-400' }
    case 'needs_reinforcement': return { emoji: '🔴', label: 'Reforçar', color: 'text-red-400' }
    default:          return { emoji: '⚪', label: 'Não iniciado',       color: 'text-content-light-secondary' }
  }
}
