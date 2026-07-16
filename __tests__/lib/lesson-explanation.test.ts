import { describe, it, expect } from 'vitest'
import { explainLessonChoice } from '@/lib/lesson-explanation'

describe('explainLessonChoice', () => {
  it('explains a retry with the methodology name', () => {
    const text = explainLessonChoice({ isRetry: true, isReview: false, methodology: 'roleplay', topicLabelPt: 'Apresentações pessoais' })
    expect(text).toContain('Apresentações pessoais')
    expect(text).toContain('Roleplay')
  })

  it('explains a review', () => {
    const text = explainLessonChoice({ isRetry: false, isReview: true, methodology: 'conversation', topicLabelPt: 'Família' })
    expect(text).toContain('Família')
    expect(text).toContain('revisão')
  })

  it('explains a new topic', () => {
    const text = explainLessonChoice({ isRetry: false, isReview: false, methodology: 'conversation', topicLabelPt: 'Cores' })
    expect(text).toContain('Cores')
    expect(text).toContain('novo')
  })

  it('prioritizes retry over review when both flags are true (should not happen given selectNextTopic()\'s mutually-exclusive branches, but the function must still be deterministic)', () => {
    const text = explainLessonChoice({ isRetry: true, isReview: true, methodology: 'game', topicLabelPt: 'Comida' })
    expect(text).toContain('jeito diferente')
  })
})
