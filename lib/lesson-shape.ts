import type { CefrLevel } from '@/types'

export interface LessonShape {
  vocabCount: number
  translationDefaultVisible: boolean
  minExchangesPractice: number
  minExchangesChallenge: number
  exercisesPerWord: number
}

const LESSON_SHAPES: Record<CefrLevel, LessonShape> = {
  A1: { vocabCount: 3, translationDefaultVisible: true, minExchangesPractice: 3, minExchangesChallenge: 4, exercisesPerWord: 1 },
  A2: { vocabCount: 4, translationDefaultVisible: true, minExchangesPractice: 4, minExchangesChallenge: 5, exercisesPerWord: 1 },
  B1: { vocabCount: 4, translationDefaultVisible: false, minExchangesPractice: 5, minExchangesChallenge: 6, exercisesPerWord: 1 },
  B2: { vocabCount: 5, translationDefaultVisible: false, minExchangesPractice: 5, minExchangesChallenge: 7, exercisesPerWord: 1 },
  C1: { vocabCount: 5, translationDefaultVisible: false, minExchangesPractice: 6, minExchangesChallenge: 8, exercisesPerWord: 1 },
  C2: { vocabCount: 6, translationDefaultVisible: false, minExchangesPractice: 6, minExchangesChallenge: 8, exercisesPerWord: 1 },
}

export function getLessonShape(cefrLevel: CefrLevel): LessonShape {
  return LESSON_SHAPES[cefrLevel] ?? LESSON_SHAPES.A1
}
