import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import type { PlacementPhase } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SCORING_PROMPT: Record<PlacementPhase, string> = {
  listening: `You are scoring English listening comprehension for a placement test.
The student was asked: "{prompt_tts}"
Expected topic: {expected_topic}
Student response transcript: "{transcript}"
Score 0.0–1.0: did they understand and respond appropriately?
Respond ONLY with JSON: {"score":0.7,"feedback_pt":"one encouraging sentence in Portuguese"}`,

  speaking: `You are scoring English speaking ability for a placement test.
The student was asked: "{prompt_tts}"
Expected topic: {expected_topic}
Student response: "{transcript}"
Score 0.0–1.0 based on fluency, vocabulary range, and clarity.
Respond ONLY with JSON: {"score":0.7,"feedback_pt":"one encouraging sentence in Portuguese"}`,

  vocabulary: `You are scoring English vocabulary knowledge for a placement test.
The student was asked: "{prompt_tts}"
Expected word/topic: {expected_topic}
Student said: "{transcript}"
Score: 1.0 if correct word used, 0.5 if partially correct, 0.0 if wrong or blank.
Respond ONLY with JSON: {"score":1.0,"feedback_pt":"one encouraging sentence in Portuguese"}`,

  grammar: `You are scoring English grammar for a placement test.
The student was asked: "{prompt_tts}"
Expected grammar topic: {expected_topic}
Student said: "{transcript}"
Score 0.0–1.0 based on correct use of verb tenses and sentence structure.
Respond ONLY with JSON: {"score":0.6,"feedback_pt":"one encouraging sentence in Portuguese"}`,

  pronunciation: `You are scoring English pronunciation for a placement test.
The student was asked to repeat: "{prompt_tts}"
Target sounds: {expected_topic}
Student said: "{transcript}"
Score 0.0–1.0 based on clarity and correct articulation of target sounds.
Respond ONLY with JSON: {"score":0.5,"feedback_pt":"one encouraging sentence in Portuguese"}`,
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const audio = formData.get('audio') as Blob | null
  const phase = formData.get('phase') as PlacementPhase | null
  const expectedTopic = formData.get('expected_topic') as string | null
  const promptTts = formData.get('prompt_tts') as string | null

  if (!audio || !phase || !expectedTopic || !promptTts) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!SCORING_PROMPT[phase]) {
    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
  }

  let transcript = ''
  try {
    const file = new File([audio], 'recording.webm', { type: audio.type || 'audio/webm' })
    const result = await openai.audio.transcriptions.create({ model: 'whisper-1', file, language: 'en' })
    transcript = result.text.trim()
  } catch {
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }

  if (!transcript) {
    return NextResponse.json({ score: 0, transcript: '', feedback_pt: 'Não consegui ouvir. Tente novamente.' })
  }

  const prompt = SCORING_PROMPT[phase]
    .replace('{prompt_tts}', promptTts)
    .replace('{expected_topic}', expectedTopic)
    .replace('{transcript}', transcript)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80,
      response_format: { type: 'json_object' },
    })
    const raw = JSON.parse(completion.choices[0].message.content ?? '{}')
    const score = Math.min(1, Math.max(0, Number(raw.score) || 0))
    return NextResponse.json({ score, transcript, feedback_pt: raw.feedback_pt ?? 'Boa tentativa!' })
  } catch {
    return NextResponse.json({ score: 0.5, transcript, feedback_pt: 'Resposta registrada.' })
  }
}
