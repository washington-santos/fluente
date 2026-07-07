import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { CefrLevel, OnboardingLevelResponse } from '@/types'

export const maxDuration = 60

const VALID_LEVELS = new Set<string>(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const audio = formData.get('audio') as Blob | null
  if (!audio) return NextResponse.json({ error: 'No audio field' }, { status: 400 })

  const arrayBuffer = await audio.arrayBuffer()
  const file = new File([arrayBuffer], 'recording.webm', { type: audio.type || 'audio/webm' })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let transcription
  try {
    transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    })
  } catch (e) {
    console.error('[onboarding/level] Whisper error:', e)
    return NextResponse.json({ error: 'whisper_failed' }, { status: 502 })
  }
  const transcript = transcription.text.trim()

  let levelRaw = 'A2'
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 5,
      messages: [
        {
          role: 'system',
          content: 'You are an English level assessor. Given a speech transcript, output ONLY one CEFR code: A1, A2, B1, B2, C1, or C2. Nothing else.',
        },
        { role: 'user', content: `Transcript: "${transcript}"` },
      ],
    })
    levelRaw = completion.choices[0]?.message?.content?.trim().toUpperCase() ?? 'A2'
  } catch (e) {
    console.error('[onboarding/level] GPT level error:', e)
    // fallback to A2 instead of failing entirely
  }

  const level: CefrLevel = VALID_LEVELS.has(levelRaw) ? (levelRaw as CefrLevel) : 'A2'

  const body: OnboardingLevelResponse = { level, transcript }
  return NextResponse.json(body)
}
