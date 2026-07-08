import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import {
  calculateFinalScore,
  checkPassed,
  nextMethodology,
  nextReviewDate,
  REVIEW_INTERVALS_DAYS,
  type CompetencyScores,
} from '@/lib/mastery'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, topic, lesson_topic_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const topicId = (session as Record<string, unknown>).lesson_topic_id as string | null
    ?? (session as Record<string, unknown>).topic as string | null
  if (!topicId) return NextResponse.json({ too_short: true, message: 'Sem tópico nesta sessão.' })

  const [{ data: userData }, { data: messages }] = await Promise.all([
    supabase.from('users').select('name, cefr_level').eq('id', user.id).single(),
    supabase.from('messages').select('role, text').eq('session_id', sessionId).order('created_at', { ascending: true }),
  ])

  const msgs = (messages ?? []) as Array<{ role: string; text: string }>
  const studentMessages = msgs.filter(m => m.role === 'user')

  if (studentMessages.length < 3) {
    return NextResponse.json({ too_short: true, message: 'Pratique um pouco mais antes da avaliação!' })
  }

  const conversationText = msgs
    .map(m => `${m.role === 'user' ? 'Aluno' : 'Professora'}: ${m.text}`)
    .join('\n')

  const cefrLevel = (userData as { cefr_level?: string } | null)?.cefr_level ?? 'A1'
  const studentName = (userData as { name?: string } | null)?.name ?? 'Aluno'

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `You are evaluating an English student's session. Score their performance on 7 competencies.

STUDENT: ${studentName} (CEFR ${cefrLevel})
TOPIC: ${topicId}

CONVERSATION:
${conversationText}

IMPORTANT: Calibrate scores for ${cefrLevel} level — not absolute fluency.
- An A1 student answering basic questions correctly = 70-80 in Speaking.
- Only give below 50 if the student clearly failed to communicate.

Score each 0–100:
- speaking: Did the student respond and attempt to communicate?
- listening: Did the student understand and answer on-topic?
- pronunciation: Clarity and accuracy for their level?
- vocabulary: Appropriate word choice? Used new words?
- grammar: Grammatically correct for ${cefrLevel}?
- confidence: Participated eagerly, low hesitation?
- fluency: Natural, flowing speech?

feedback_pt: 2-3 motivating Portuguese sentences. Highlight progress, frame weaknesses positively. NEVER say "reprovado", "falhou", "errado".
highlight_pt: Their single biggest strength, 1 sentence in Portuguese.

Respond ONLY valid JSON:
{"speaking":75,"listening":80,"pronunciation":68,"vocabulary":90,"grammar":84,"confidence":79,"fluency":76,"feedback_pt":"...","highlight_pt":"..."}`

  let scores: CompetencyScores
  let feedbackPt: string
  let highlightPt: string

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 350,
      response_format: { type: 'json_object' },
    })
    const result = JSON.parse(completion.choices[0].message.content ?? '{}') as Record<string, unknown>
    scores = {
      speaking:      Math.min(100, Math.max(0, Number(result.speaking) || 50)),
      listening:     Math.min(100, Math.max(0, Number(result.listening) || 50)),
      pronunciation: Math.min(100, Math.max(0, Number(result.pronunciation) || 50)),
      vocabulary:    Math.min(100, Math.max(0, Number(result.vocabulary) || 50)),
      grammar:       Math.min(100, Math.max(0, Number(result.grammar) || 50)),
      confidence:    Math.min(100, Math.max(0, Number(result.confidence) || 50)),
      fluency:       Math.min(100, Math.max(0, Number(result.fluency) || 50)),
    }
    feedbackPt = typeof result.feedback_pt === 'string' ? result.feedback_pt : 'Você praticou bem hoje! Continue assim.'
    highlightPt = typeof result.highlight_pt === 'string' ? result.highlight_pt : 'Boa participação!'
  } catch {
    return NextResponse.json({ error: 'Assessment failed' }, { status: 500 })
  }

  const finalScore = calculateFinalScore(scores)
  const { passed, failedCompetencies } = checkPassed(scores)

  const { data: currentProgress } = await supabase
    .from('user_topic_progress')
    .select('mastery_status, best_score, attempt_count, review_interval_days, last_methodology')
    .eq('user_id', user.id)
    .eq('topic_id', topicId)
    .maybeSingle()

  const currentIntervalDays = (currentProgress as Record<string, unknown> | null)?.review_interval_days as number | null ?? REVIEW_INTERVALS_DAYS[0]
  const prevBestScore = (currentProgress as Record<string, unknown> | null)?.best_score as number | null ?? 0
  const attemptCount = ((currentProgress as Record<string, unknown> | null)?.attempt_count as number | null ?? 0) + 1
  const lastMethodology = (currentProgress as Record<string, unknown> | null)?.last_methodology as string | null

  let newMasteryStatus: string
  let nextReviewAt: string | null = null
  let nextIntervalDays = currentIntervalDays

  if (passed) {
    const { date, nextInterval } = nextReviewDate(currentIntervalDays)
    nextReviewAt = date.toISOString()
    nextIntervalDays = nextInterval
    newMasteryStatus = 'mastered'
  } else {
    newMasteryStatus = 'learning'
  }

  const currentMethodology = lastMethodology ?? 'conversation'
  const newLastMethodology = passed ? 'conversation' : nextMethodology(lastMethodology)

  await Promise.all([
    supabase.from('topic_assessments').insert({
      user_id: user.id,
      session_id: sessionId,
      topic_id: topicId,
      speaking: scores.speaking,
      listening: scores.listening,
      pronunciation: scores.pronunciation,
      vocabulary: scores.vocabulary,
      grammar: scores.grammar,
      confidence: scores.confidence,
      fluency: scores.fluency,
      final_score: finalScore,
      passed,
      failed_competencies: failedCompetencies,
      methodology: currentMethodology,
    }),
    supabase.from('user_topic_progress').upsert({
      user_id: user.id,
      topic_id: topicId,
      cefr_level: cefrLevel,
      mastery_status: newMasteryStatus,
      best_score: Math.max(finalScore, prevBestScore),
      attempt_count: attemptCount,
      next_review_at: nextReviewAt,
      review_interval_days: nextIntervalDays,
      last_methodology: newLastMethodology,
      last_taught_at: new Date().toISOString(),
    }, { onConflict: 'user_id,topic_id' }),
  ])

  return NextResponse.json({
    scores,
    final_score: finalScore,
    passed,
    failed_competencies: failedCompetencies,
    feedback_pt: feedbackPt,
    highlight_pt: highlightPt,
    attempt_count: attemptCount,
    next_methodology: newLastMethodology,
  })
}
