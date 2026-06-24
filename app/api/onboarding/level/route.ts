import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { CefrLevel, OnboardingLevelResponse } from '@/types'

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
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
  })
  const transcript = transcription.text.trim()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system:
      'You are an English level assessor. Given a speech transcript, output ONLY one CEFR code: A1, A2, B1, B2, C1, or C2. Nothing else.',
    messages: [{ role: 'user', content: `Transcript: "${transcript}"` }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text.trim().toUpperCase()
  const level: CefrLevel = VALID_LEVELS.has(raw) ? (raw as CefrLevel) : 'A2'

  const body: OnboardingLevelResponse = { level, transcript }
  return NextResponse.json(body)
}
