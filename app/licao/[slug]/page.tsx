import { redirect, notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getLessonBySlug } from '@/lib/curriculum'
import { LessonEngine } from './LessonEngine'
import type { UserLessonProgress } from '@/types/lesson'

export default async function LicaoPage({ params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let lesson
  try {
    lesson = getLessonBySlug(params.slug)
  } catch {
    notFound()
  }

  const [{ data: userData }, { data: progressRow }] = await Promise.all([
    supabase.from('users').select('teacher_id').eq('id', user.id).single(),
    supabase
      .from('user_lesson_progress')
      .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
      .eq('user_id', user.id)
      .eq('lesson_slug', params.slug)
      .maybeSingle(),
  ])

  const { data: teacher } = userData?.teacher_id
    ? await supabase.from('teachers').select('name, avatar_image_url, tts_voice').eq('id', userData.teacher_id).single()
    : { data: null }

  // Block access if lesson is locked
  const progressStatus = (progressRow as UserLessonProgress | null)?.status
  if (lesson.unlock_after && (!progressRow || progressStatus === 'locked')) {
    redirect('/licoes')
  }

  return (
    <LessonEngine
      lesson={lesson}
      initialProgress={progressRow as UserLessonProgress | null}
      teacherName={teacher?.name ?? 'Mrs. Carol'}
      teacherImageUrl={teacher?.avatar_image_url ?? '/avatars/mrs-carol.png'}
      ttsVoice={teacher?.tts_voice ?? 'alloy'}
    />
  )
}
