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

  const trimmedPanicText = panicText ? panicText.trim() : null
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  if (!audio && !trimmedPanicText) return NextResponse.json({ error: 'No audio or panic_text' }, { status: 400 })

  // Load session with teacher — also checks user_id to prevent IDOR
  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

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
    transcript = trimmedPanicText as string
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

  // Fix 3: Only fall back to rawText when parsed.reply is not a string at all.
  // Whitespace-only strings are still better than speaking the full JSON blob.
  const replyText: string = (typeof parsed.reply === 'string' && parsed.reply.length > 0)
    ? parsed.reply
    : rawText
  const correctionRaw = parsed.correction ?? {}

  const errorReport: ErrorReport = {
    error_detected: correctionRaw.error_detected ?? false,
    error_text: correctionRaw.error_text ?? undefined,
    correct_form: correctionRaw.correct_form ?? undefined,
    error_type: VALID_ERROR_TYPES.has(correctionRaw.error_type ?? '') ? (correctionRaw.error_type as ErrorType) : undefined,
  }

  // Fix 1+2: Insert USER message — check error so DB failures are not silent
  const { error: userInsertError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', text: transcript, audio_url: null, had_correction: false },
  ])
  if (userInsertError) console.error('User message insert failed:', userInsertError.message)

  // Fix 1+2: TTS with graceful fallback — if TTS throws we still insert the assistant message
  let audioUrl: string | null = null
  try {
    audioUrl = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')
  } catch (err) {
    console.error('TTS failed, continuing without audio:', err)
  }

  // Fix 1+2: D-ID with graceful fallback
  let videoUrl: string | null = null
  try {
    const origin = process.env.EF_PUBLIC_ORIGIN
    if (origin) {
      videoUrl = await createTalk(replyText, DID_VOICE_IDS[teacher.slug] ?? 'en-US-JennyNeural', `${origin}${teacher.avatar_image_url}`)
    }
  } catch (err) {
    console.error('D-ID failed, continuing without video:', err)
  }

  // Fix 1+2: Always insert ASSISTANT message (audio_url may be null if TTS failed) — check error
  const { error: assistantInsertError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'assistant', text: replyText, audio_url: audioUrl, had_correction: errorReport.error_detected },
  ])
  if (assistantInsertError) console.error('Assistant message insert failed:', assistantInsertError.message)

  // Increment today's usage log
  const usage = claudeRes.usage
  const today = new Date().toISOString().slice(0, 10)
  const { data: existingUsage } = await supabase
    .from('usage_log')
    .select('whisper_minutes, tts_chars, claude_tokens, did_credits')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  await supabase.from('usage_log').upsert(
    {
      user_id: user.id,
      date: today,
      whisper_minutes: (existingUsage?.whisper_minutes ?? 0) + (audio ? 0.5 : 0),
      tts_chars: (existingUsage?.tts_chars ?? 0) + replyText.length,
      claude_tokens: (existingUsage?.claude_tokens ?? 0) + usage.input_tokens + usage.output_tokens,
      did_credits: (existingUsage?.did_credits ?? 0) + (videoUrl ? 1 : 0),
    },
    { onConflict: 'user_id,date' }
  )

  const response: ConversationResponse = {
    text: replyText,
    audio_url: audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
    transcript,
  }

  return NextResponse.json(response)
}
