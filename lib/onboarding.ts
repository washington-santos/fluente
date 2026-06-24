import type { CefrLevel, McqQuestion } from '@/types'

export const MCQ_QUESTIONS: McqQuestion[] = [
  {
    id: 'q1',
    text: 'Complete the sentence: "_____ is your name?"',
    options: ['What', 'Which', 'Who', 'How'],
    correct: 'What',
  },
  {
    id: 'q2',
    text: 'Complete the sentence: "She _____ to work every day."',
    options: ['go', 'goes', 'going', 'went'],
    correct: 'goes',
  },
  {
    id: 'q3',
    text: 'Complete the sentence: "By the time we arrived, the movie _____."',
    options: ['already started', 'has already started', 'had already started', 'already was starting'],
    correct: 'had already started',
  },
  {
    id: 'q4',
    text: 'Choose the correct passive form: "The project _____ by the team last year."',
    options: ['was completed', 'has completed', 'completed itself', 'is been completed'],
    correct: 'was completed',
  },
  {
    id: 'q5',
    text: 'Complete the conditional: "Had she told me sooner, I _____ something about it."',
    options: ['would do', 'will have done', 'would have done', 'would be doing'],
    correct: 'would have done',
  },
]

const CORRECT_ANSWERS = MCQ_QUESTIONS.map((q) => q.correct)

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function scoreMcqs(answers: string[]): CefrLevel {
  const correct = answers.filter((a, i) => a === CORRECT_ANSWERS[i]).length
  if (correct <= 1) return 'A1'
  if (correct === 2) return 'A2'
  if (correct === 3) return 'B1'
  if (correct === 4) return 'B2'
  return 'C1'
}

export function combineLevels(a: CefrLevel, b: CefrLevel): CefrLevel {
  const idxA = LEVEL_ORDER.indexOf(a)
  const idxB = LEVEL_ORDER.indexOf(b)
  return LEVEL_ORDER[Math.round((idxA + idxB) / 2)]
}

export function stepToRoute(step: number): string {
  if (step >= 5) return '/cadastro/professor'
  if (step >= 4) return '/cadastro/conversa'
  if (step >= 3) return '/cadastro/nivelamento'
  if (step >= 2) return '/cadastro/horario'
  if (step >= 1) return '/cadastro/objetivo'
  return '/cadastro/boas-vindas'
}
