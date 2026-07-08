import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'
import { getTopicsForLevel } from '@/lib/topics'
import { METHODOLOGY_INSTRUCTIONS, METHODOLOGY_NAMES_PT } from '@/lib/mastery'
import type { Topic } from '@/lib/topics'
import type { Methodology } from '@/lib/mastery'

interface TopicProgress {
  topic_id: string
  mastery_status: string | null
  last_methodology: string | null
  next_review_at: string | null
}

function selectNextTopic(
  cefrLevel: string,
  allProgress: TopicProgress[],
): { topic: Topic; isRetry: boolean; isReview: boolean; methodology: Methodology } | null {
  const topics = getTopicsForLevel(cefrLevel)
  const progressMap = new Map(allProgress.map(p => [p.topic_id, p]))
  const now = new Date()

  // 1. Topics still in "learning" (failed before) — retry with different methodology
  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'learning') {
      const nextMethod = (p.last_methodology ?? 'conversation') as Methodology
      return { topic: t, isRetry: true, isReview: false, methodology: nextMethod }
    }
  }

  // 2. Topics due for spaced review
  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'mastered' && p.next_review_at && new Date(p.next_review_at) <= now) {
      return { topic: t, isRetry: false, isReview: true, methodology: 'conversation' }
    }
  }

  // 3. Next unlearned topic
  for (const t of topics) {
    if (!progressMap.has(t.key)) {
      return { topic: t, isRetry: false, isReview: false, methodology: 'conversation' }
    }
  }

  // 4. All mastered, no reviews due — restart from first topic
  const first = topics[0]
  return first
    ? { topic: first, isRetry: false, isReview: true, methodology: 'conversation' }
    : null
}

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('teacher_id, cefr_level')
    .eq('id', user.id)
    .single()

  if (!userData?.teacher_id) return NextResponse.json({ error: 'No teacher assigned' }, { status: 400 })

  const [context, { data: allProgressRows }] = await Promise.all([
    getStudentContext(user.id, supabase),
    supabase
      .from('user_topic_progress')
      .select('topic_id, mastery_status, last_methodology, next_review_at')
      .eq('user_id', user.id),
  ])

  const allProgress = (allProgressRows ?? []) as TopicProgress[]
  const selection = selectNextTopic(context.cefrLevel, allProgress)

  if (!selection) return NextResponse.json({ error: 'No topic available' }, { status: 500 })

  const { topic, isRetry, isReview, methodology } = selection

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const contextLines: string[] = []
  if (context.personalContext.length > 0) contextLines.push(context.personalContext.slice(0, 3).join('; '))
  if (context.goal) contextLines.push(`Goal: ${context.goal}`)
  if (context.recentSessionSummary) contextLines.push(`Last session: ${context.recentSessionSummary}`)
  if (context.biggestDifficulty) contextLines.push(`Biggest difficulty: ${context.biggestDifficulty}`)

  const retryNote = isRetry
    ? `\nIMPORTANT: The student already attempted this topic before. Use a COMPLETELY DIFFERENT teaching approach this time.\nMETHODOLOGY THIS SESSION: ${METHODOLOGY_NAMES_PT[methodology]} — ${METHODOLOGY_INSTRUCTIONS[methodology]}`
    : isReview
    ? `\nIMPORTANT: This is a REVIEW session — the student learned this topic before. Make it feel fresh. Test retention with new examples.`
    : ''

  const prompt = `Create a personalized English lesson plan for a Brazilian student.

STUDENT:
- Name: ${context.name ?? 'Aluno'}
- CEFR Level: ${context.cefrLevel}
- Streak: ${context.streakDays} days
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}
${context.frequentErrors.length > 0 ? `- Frequent mistakes: ${context.frequentErrors.join(', ')}` : ''}

TODAY'S TOPIC: ${topic.labelPt} (${topic.promptEn})
OBJECTIVES: ${topic.objectivesPt.join(', ')}
${retryNote}

Return ONLY valid JSON:
{
  "title_pt": "lesson title in Portuguese (max 5 words)",
  "objective_pt": "one sentence — what the student will achieve today (Portuguese)",
  "teacher_greeting": "teacher's warm opening in English (2-3 sentences, mention student's name, naturally introduce today's topic)",
  "teacher_greeting_pt": "Portuguese translation of teacher_greeting",
  "lesson_instructions": "How to run this session — teaching methodology, pacing, correction style (2-3 sentences in English)",
  "vocabulary_focus": ["word1", "word2", "word3"]
}`

  let lessonPlan: Record<string, unknown>
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      response_format: { type: 'json_object' },
    })
    lessonPlan = JSON.parse(completion.choices[0].message.content ?? '{}')
  } catch {
    lessonPlan = {
      title_pt: topic.labelPt,
      objective_pt: topic.objectivesPt[0] ?? 'Praticar inglês',
      teacher_greeting: topic.starterPhrase,
      teacher_greeting_pt: null,
      lesson_instructions: `Focus on: ${topic.promptEn}. ${METHODOLOGY_INSTRUCTIONS[methodology]}`,
      vocabulary_focus: [],
    }
  }

  const lessonPlanFull = {
    ...lessonPlan,
    topic_key: topic.key,
    topic_label_pt: topic.labelPt,
    topic_prompt_en: topic.promptEn,
    methodology,
    is_retry: isRetry,
    is_review: isReview,
    generated_at: new Date().toISOString(),
  }

  // Close dangling open sessions so GET /api/session finds the new one
  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: userData.teacher_id,
      mode: 'daily',
      topic: topic.key,
      lesson_plan_json: lessonPlanFull,
      lesson_topic_id: topic.key,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Session creation failed' }, { status: 500 })
  }

  // Track topic start (only if not already in progress — mastery state is set by /assess)
  await supabase.rpc('increment_topic_progress', {
    p_user_id: user.id,
    p_topic_id: topic.key,
    p_cefr_level: context.cefrLevel,
  })

  return NextResponse.json({
    session_id: session.id,
    teacher_id: userData.teacher_id,
    lesson: {
      title_pt: lessonPlan.title_pt,
      objective_pt: lessonPlan.objective_pt,
      topic_key: topic.key,
      topic_label_pt: topic.labelPt,
      emoji: topic.emoji,
      methodology,
      is_retry: isRetry,
      is_review: isReview,
    },
  })
}
