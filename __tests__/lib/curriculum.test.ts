// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getAllLessons, getLessonBySlug, getNextLesson, mergeWithProgress } from '@/lib/curriculum'

describe('curriculum', () => {
  it('getAllLessons returns 3 lessons sorted by order', () => {
    const lessons = getAllLessons()
    expect(lessons).toHaveLength(3)
    expect(lessons[0].slug).toBe('a1-lesson-01-greetings')
    expect(lessons[1].slug).toBe('a1-lesson-02-numbers')
    expect(lessons[2].slug).toBe('a1-lesson-03-colors')
  })

  it('getLessonBySlug returns correct lesson with vocabulary', () => {
    const lesson = getLessonBySlug('a1-lesson-01-greetings')
    expect(lesson.title_pt).toBe('Cumprimentos e Frases Básicas')
    expect(lesson.vocabulary).toHaveLength(8)
    expect(lesson.vocabulary[0].word).toBe('Hello')
  })

  it('getLessonBySlug throws for unknown slug', () => {
    expect(() => getLessonBySlug('not-a-lesson')).toThrow('Lesson not found: not-a-lesson')
  })

  it('getNextLesson returns the next lesson', () => {
    const next = getNextLesson('a1-lesson-01-greetings')
    expect(next?.slug).toBe('a1-lesson-02-numbers')
  })

  it('getNextLesson returns null for the last lesson', () => {
    expect(getNextLesson('a1-lesson-03-colors')).toBeNull()
  })

  it('mergeWithProgress attaches progress to matching lessons', () => {
    const lessons = getAllLessons()
    const progress = [{
      lesson_slug: 'a1-lesson-01-greetings',
      status: 'completed' as const,
      current_step_index: 23,
      vocab_scores: { Hello: 0.9 },
      completed_at: '2026-07-03T00:00:00Z',
      xp_earned: 50,
    }]
    const merged = mergeWithProgress(lessons, progress)
    expect(merged[0].progress?.status).toBe('completed')
    expect(merged[1].progress).toBeNull()
    expect(merged[2].progress).toBeNull()
  })
})
