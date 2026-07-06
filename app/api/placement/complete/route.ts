import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import type { PlacementAnswer, CefrLevel } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const VALID_CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { answers, goal } = await request.json() as { answers: PlacementAnswer[]; goal: string }
  if (!answers?.length) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  const answerSummary = answers.map(a =>
    `[${a.phase.toUpperCase()}] Q:${a.question_id} Score:${a.score.toFixed(2)} — "${a.transcript}"`
  ).join('\n')

  const prompt = `You are analyzing placement test results for an English learner from Brazil.
Student goal: "${goal}"

Test answers (phase, question, score 0-1, student's transcript):
${answerSummary}

Based on the transcripts and scores, generate a comprehensive diagnostic.
Respond ONLY with JSON (no markdown):
{
  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "speaking_pct": 0-100,
  "listening_pct": 0-100,
  "grammar_pct": 0-100,
  "vocabulary_pct": 0-100,
  "pronunciation_pct": 0-100,
  "confidence_pct": 0-100,
  "biggest_difficulty": "one specific difficulty in Portuguese",
  "biggest_strength": "one specific strength in Portuguese",
  "next_objective": "one concrete next step in Portuguese",
  "focus_areas": ["pronunciation","grammar"],
  "plan_summary_pt": "2-3 sentences describing the personalized plan in Portuguese"
}`

  let diagnostic: Record<string, unknown>
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      response_format: { type: 'json_object' },
    })
    diagnostic = JSON.parse(completion.choices[0].message.content ?? '{}')
  } catch {
    return NextResponse.json({ error: 'Diagnosis generation failed' }, { status: 500 })
  }

  const cefrRaw = String(diagnostic.cefr_level ?? '').toUpperCase()
  const cefr: CefrLevel = VALID_CEFR.has(cefrRaw) ? (cefrRaw as CefrLevel) : 'A2'

  const resultRow = {
    user_id: user.id,
    cefr_level: cefr,
    speaking_pct: Number(diagnostic.speaking_pct) || 0,
    listening_pct: Number(diagnostic.listening_pct) || 0,
    grammar_pct: Number(diagnostic.grammar_pct) || 0,
    vocabulary_pct: Number(diagnostic.vocabulary_pct) || 0,
    pronunciation_pct: Number(diagnostic.pronunciation_pct) || 0,
    confidence_pct: Number(diagnostic.confidence_pct) || 0,
    biggest_difficulty: String(diagnostic.biggest_difficulty || ''),
    biggest_strength: String(diagnostic.biggest_strength || ''),
    next_objective: String(diagnostic.next_objective || ''),
    completed_at: new Date().toISOString(),
  }

  const planRow = {
    user_id: user.id,
    goal,
    focus_areas: Array.isArray(diagnostic.focus_areas) ? diagnostic.focus_areas : [],
    plan_summary_pt: String(diagnostic.plan_summary_pt || ''),
    cefr_at_creation: cefr,
    created_at: new Date().toISOString(),
  }

  const [{ error: resErr }, { error: planErr }] = await Promise.all([
    supabase.from('placement_results').upsert(resultRow, { onConflict: 'user_id' }),
    supabase.from('learning_plans').upsert(planRow, { onConflict: 'user_id' }),
  ])

  if (resErr || planErr) {
    return NextResponse.json({ error: 'Failed to save results' }, { status: 500 })
  }

  const { error: userErr } = await supabase.from('users').update({ cefr_level: cefr }).eq('id', user.id)
  if (userErr) console.error('[placement/complete] Failed to update users.cefr_level:', userErr.message)

  return NextResponse.json({ result: { ...resultRow, id: '' }, plan: { ...planRow, id: '' } })
}
