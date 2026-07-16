import type { Methodology } from '@/lib/mastery'
import { METHODOLOGY_NAMES_PT } from '@/lib/mastery'

export function explainLessonChoice(params: {
  isRetry: boolean
  isReview: boolean
  methodology: Methodology
  topicLabelPt: string
}): string {
  const { isRetry, isReview, methodology, topicLabelPt } = params
  if (isRetry) {
    return `Você já praticou "${topicLabelPt}" antes — hoje vamos tentar de um jeito diferente (${METHODOLOGY_NAMES_PT[methodology]}) pra ajudar a fixar.`
  }
  if (isReview) {
    return `Faz um tempo que você não pratica "${topicLabelPt}" — hoje é dia de revisão pra manter na memória.`
  }
  return `Hoje é um tópico novo pra você: "${topicLabelPt}".`
}
