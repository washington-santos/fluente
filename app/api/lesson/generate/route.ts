import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'
import { getTopicsForLevel } from '@/lib/topics'
import type { Topic } from '@/lib/topics'

function selectNextTopic(cefrLevel: string, taughtIds: Set<string>, reviewIds: Set<string>): Topic | null {
  const topics = getTopicsForLevel(cefrLevel)
  const reviewTopic = topics.find(t => reviewIds.has(t.key))
  if (reviewTopic) return reviewTopic
  const newTopic = topics.find(t => !taughtIds.has(t.key))
  if (newTopic) return newTopic
  return topics[0] ?? null
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

  const context = await getStudentContext(user.id, supabase)

  const topic = selectNextTopic(
    context.cefrLevel,
    new Set(context.taughtTopicIds),
    new Set(context.topicsNeedingReview),
  )

  if (!topic) return NextResponse.json({ error: 'No topic available' }, { status: 500 })

  // Generate personalized lesson plan
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const contextLines: string[] = []
  if (context.personalContext.length > 0) contextLines.push(context.personalContext.slice(0, 3).join('; '))
  if (context.goal) contextLines.push(`Goal: ${context.goal}`)
  if (context.recentSessionSummary) contextLines.push(`Last session: ${context.recentSessionSummary}`)
  if (context.biggestDifficulty) contextLines.push(`Biggest difficulty: ${context.biggestDifficulty}`)

  const prompt = `Create a personalized English lesson plan for a Brazilian student.

STUDENT:
- Name: ${context.name ?? 'Aluno'}
- CEFR Level: ${context.cefrLevel}
- Streak: ${context.streakDays} days
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}
${context.frequentErrors.length > 0 ? `- Frequent mistakes: ${context.frequentErrors.join(', ')}` : ''}

TODAY'S TOPIC: ${topic.labelPt} (${topic.promptEn})
OBJECTIVES: ${topic.objectivesPt.join(', ')}

Generate:
1. A warm, personalized greeting to open the lesson (use student's name if provided, reference their personal context or goal naturally)
2. Instructions for HOW the teacher should conduct this session (what to focus on, pacing, correction style)

Return ONLY valid JSON:
{
  "title_pt": "lesson title in Portuguese (max 5 words)",
  "objective_pt": "one sentence — what the student will achieve today (Portuguese)",
  "teacher_greeting": "teacher's warm opening in English (2-3 sentences, mention student's name, naturally introduce today's topic)",
  "teacher_greeting_pt": "Portuguese translation of teacher_greeting",
  "lesson_instructions": "How to run this session — what to focus on and how to correct errors (2-3 sentences in English)",
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
      lesson_instructions: `Focus on: ${topic.promptEn}. Be encouraging and patient with the student.`,
      vocabulary_focus: [],
    }
  }

  const lessonPlanFull = {
    ...lessonPlan,
    topic_key: topic.key,
    topic_label_pt: topic.labelPt,
    topic_prompt_en: topic.promptEn,
    generated_at: new Date().toISOString(),
  }

  // Close any dangling open sessions for this teacher so GET /api/session finds the new one
  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  // Create session with embedded lesson plan
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

  // Track topic progress atomically
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
    },
  })
}
