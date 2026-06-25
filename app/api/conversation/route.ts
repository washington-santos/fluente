import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { synthesizeTts } from '@/lib/tts'
import { createTalk, DID_VOICE_IDS } from '@/lib/did'
import type { ConversationResponse, ErrorReport, ErrorType } from '@/types'

const VALID_ERROR_TYPES = new Set<string>(['verb_tense', 'vocabulary', 'preposition', 'pronunciation', 'other'])

interface ClaudeOutput {
  reply: string
  correction: {
    error_detected: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const sessionId = formData.get('session_id') as string | null
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('panic_text') as string | null

  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  if (!audio && !panicText) return NextResponse.json({ error: 'audio or panic_text required' }, { status: 400 })

  // Load session with teacher
  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Load user profile
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level')
    .eq('id', user.id)
    .single()

  // Transcribe audio or use panic text
  let transcript: string
  if (audio) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    // Pass the blob directly; the real SDK accepts Blob, and mocks don't validate the type
    const result = await openai.audio.transcriptions.create({
      file: audio as unknown as File,
      model: 'whisper-1',
      language: 'en',
    })
    transcript = result.text.trim()
  } else {
    transcript = (panicText as string).trim()
  }

  // Load conversation history (last 20 messages)
  const { data: prevMessages } = await supabase
    .from('messages')
    .select('role, text')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(20)

  const teacher = session.teacher as any
  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${userData?.name ?? 'Student'}
- CEFR level: ${userData?.cefr_level ?? 'B1'}

Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.`

  // Call Claude Sonnet
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const claudeRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      ...((prevMessages ?? []).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.text }))),
      { role: 'user', content: transcript },
    ],
  })

  const rawText = claudeRes.content[0]?.type === 'text' ? (claudeRes.content[0] as any).text : '{}'
  let parsed: ClaudeOutput
  try {
    parsed = JSON.parse(rawText) as ClaudeOutput
  } catch {
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null } }
  }

  const replyText = parsed.reply
  const correctionRaw = parsed.correction

  const errorReport: ErrorReport = {
    error_detected: correctionRaw.error_detected ?? false,
    error_text: correctionRaw.error_text ?? undefined,
    correct_form: correctionRaw.correct_form ?? undefined,
    error_type: VALID_ERROR_TYPES.has(correctionRaw.error_type ?? '') ? (correctionRaw.error_type as ErrorType) : undefined,
  }

  // TTS
  const audioUrl = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')

  // D-ID (optional)
  const origin = process.env.EF_PUBLIC_ORIGIN ?? ''
  const sourceUrl = origin ? `${origin}${teacher.avatar_image_url}` : ''
  const videoUrl = sourceUrl
    ? await createTalk(replyText, DID_VOICE_IDS[teacher.slug] ?? 'en-US-JennyNeural', sourceUrl)
    : null

  // Persist messages
  await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', text: transcript, audio_url: null, had_correction: false },
    { session_id: sessionId, role: 'assistant', text: replyText, audio_url: null, had_correction: errorReport.error_detected },
  ])

  // Update usage log
  const usage = claudeRes.usage
  await supabase.from('usage_log').upsert(
    {
      user_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      whisper_minutes: audio ? 0.5 : 0,
      tts_chars: replyText.length,
      claude_tokens: usage.input_tokens + usage.output_tokens,
      did_credits: videoUrl ? 1 : 0,
    },
    { onConflict: 'user_id,date', ignoreDuplicates: false }
  )

  const response: ConversationResponse = {
    text: replyText,
    audio_url: audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
  }

  return NextResponse.json(response)
}
