import type { LessonContent, UserLessonProgress, LessonWithProgress } from '@/types/lesson'
import lesson01 from '@/content/curriculum/a1/lesson-01-greetings.json'
import lesson02 from '@/content/curriculum/a1/lesson-02-numbers.json'
import lesson03 from '@/content/curriculum/a1/lesson-03-colors.json'

const CATALOG: LessonContent[] = [
  lesson01 as LessonContent,
  lesson02 as LessonContent,
  lesson03 as LessonContent,
]

export function getAllLessons(): LessonContent[] {
  return [...CATALOG].sort((a, b) => a.order - b.order)
}

export function getLessonBySlug(slug: string): LessonContent {
  const lesson = CATALOG.find(l => l.slug === slug)
  if (!lesson) throw new Error(`Lesson not found: ${slug}`)
  return lesson
}

export function getNextLesson(currentSlug: string): LessonContent | null {
  const sorted = getAllLessons()
  const idx = sorted.findIndex(l => l.slug === currentSlug)
  if (idx === -1 || idx === sorted.length - 1) return null
  return sorted[idx + 1]
}

export function mergeWithProgress(
  lessons: LessonContent[],
  progressList: UserLessonProgress[],
): LessonWithProgress[] {
  const map = new Map(progressList.map(p => [p.lesson_slug, p]))
  return lessons.map(l => ({ ...l, progress: map.get(l.slug) ?? null }))
}
