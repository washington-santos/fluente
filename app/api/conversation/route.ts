import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { synthesizeTts } from '@/lib/tts'
import { createTalk, DID_VOICE_IDS } from '@/lib/did'
import { getTopicByKey } from '@/lib/topics'
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
  pronunciation_hint: string | null
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Quota check ─────────────────────────────────────────────────────────
  // Brazil UTC-3 — consistent with usage_log date storage
  const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const firstOfMonth = `${nowBR.getUTCFullYear()}-${String(nowBR.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [{ data: subData, error: quotaSubError }, { data: usageRows, error: quotaUsageError }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plans!inner(minutes_per_month)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('usage_log')
      .select('whisper_minutes')
      .eq('user_id', user.id)
      .gte('date', firstOfMonth),
  ])

  if (quotaSubError || quotaUsageError) {
    console.error('Quota check DB error', quotaSubError ?? quotaUsageError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const minutesLimit: number = subData
    ? (subData.plans as unknown as { minutes_per_month: number }).minutes_per_month
    : 10 // free plan default

  const minutesUsed: number = (usageRows ?? []).reduce(
    (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
    0,
  )

  if (minutesUsed >= minutesLimit) {
    return NextResponse.json(
      { error: 'quota_exceeded', minutesUsed, minutesLimit },
      { status: 429 },
    )
  }
  // ── End quota check ──────────────────────────────────────────────────────

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

  const teacher = session.teacher as {
    id: string; slug: string; name: string; system_prompt: string
    tts_voice: string; avatar_image_url: string; correction_style: string
  } | null
  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // Load user profile
  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level')
    .eq('id', user.id)
    .single()

  // Load latest session memory for cross-session context
  const { data: sessionMemory } = await supabase
    .from('session_memory')
    .select('summary, key_topics, personal_details')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Load top recurring error for error-review block
  const { data: topError } = await supabase
    .from('errors_log')
    .select('error_text, correct_form, error_type')
    .eq('user_id', user.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  // Load conversation history (last 20 messages, most-recent first, then reversed for chronological order)
  const { data: prevMessages } = await supabase
    .from('messages')
    .select('role, text')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(20)

  const chronologicalMessages = (prevMessages ?? []).reverse()

  const memoryBlock = sessionMemory
    ? `\nPrevious session context:\n${sessionMemory.summary}\nTopics covered: ${(sessionMemory.key_topics ?? []).join(', ')}\nAbout the student: ${(sessionMemory.personal_details ?? []).join('; ')}`
    : ''

  const topicData = getTopicByKey(session.topic as string | null)
  const topicBlock = topicData
    ? `\nToday's lesson topic: "${topicData.labelPt}" — ${topicData.promptEn}. Naturally guide the conversation toward this theme while staying responsive to the student.`
    : ''

  const errorContextBlock = topError
    ? `\nRecurring error to revisit: The student frequently makes this mistake — "${topError.error_text}" (correct: "${topError.correct_form}"). Early in the session, naturally reference this and give a brief practice moment.`
    : ''

  const cefrLevel = userData?.cefr_level ?? 'B1'
  const interventionBlock = (cefrLevel === 'A1' || cefrLevel === 'A2')
    ? `\nIntervention timing: Help quickly — if the student hesitates more than a moment, gently supply the missing word or rephrase your question to keep confidence high.`
    : (cefrLevel === 'B1' || cefrLevel === 'B2')
    ? `\nIntervention timing: Let the student work through difficulties before helping. Pause and allow them to self-correct. Only step in if they seem genuinely stuck.`
    : `\nIntervention timing: Only intervene when explicitly asked. Push the student to self-correct and rephrase. Expect near-native fluency and challenge them accordingly.`

  const studentName = userData?.name ?? 'the student'
  const anatomyBlock = `\nSession anatomy — follow this structure:
1. WARM-UP (your first message): Greet ${studentName} by name. Ask one casual question about their day or week.
2. ERROR REVIEW (next 1-2 exchanges): If a recurring error is listed above, naturally revisit it with a short practice moment.
3. NEW CONTENT + PRACTICE (main body): Introduce or reinforce a grammar structure or vocabulary area appropriate for ${cefrLevel} level through natural questions — not explicit drills.
4. FREE CONVERSATION (closing): Converse freely on today's topic. Correct errors naturally within the flow without interrupting the conversation.`

  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${studentName}
- CEFR level: ${cefrLevel}
${memoryBlock}${topicBlock}${errorContextBlock}${anatomyBlock}${interventionBlock}
Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
When the student's transcript reveals a common Brazilian pronunciation pattern issue (e.g. "th" pronounced as "d" or "t", dropping final "s", wrong word stress, "ed" pronounced as a full syllable), set pronunciation_hint to a single clear tip under 20 words. Otherwise set pronunciation_hint to null.
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.`

  const openaiChat = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const chatRes = await openaiChat.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      ...(chronologicalMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }))),
      { role: 'user', content: transcript },
    ],
  })

  const rawText = chatRes.choices[0]?.message?.content ?? '{}'
  let parsed: ClaudeOutput
  try {
    parsed = JSON.parse(rawText) as ClaudeOutput
  } catch {
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null }
  }

  // Fix 3: Only fall back to rawText when parsed.reply is not a string at all.
  // Whitespace-only strings are still better than speaking the full JSON blob.
  const replyText: string = (typeof parsed.reply === 'string' && parsed.reply.length > 0)
    ? parsed.reply
    : rawText
  const correctionRaw = parsed.correction ?? {}
  const pronunciationHint: string | null = (typeof parsed.pronunciation_hint === 'string' && parsed.pronunciation_hint.length > 0)
    ? parsed.pronunciation_hint
    : null

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
  let storedAudioUrl: string | null = null
  try {
    const { dataUrl, buffer } = await synthesizeTts(replyText, teacher.tts_voice ?? 'alloy')
    audioUrl = dataUrl

    // Upload to Storage for replay — use admin client to bypass RLS
    const supabaseAdmin = createSupabaseAdmin()
    const storagePath = `${user.id}/${sessionId}/${crypto.randomUUID()}.mp3`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-replay')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })

    if (!uploadError) {
      storedAudioUrl = supabaseAdmin.storage
        .from('audio-replay')
        .getPublicUrl(storagePath).data.publicUrl
    } else {
      console.error('Audio upload failed:', uploadError.message)
    }
  } catch (err) {
    console.error('TTS/storage failed, continuing without audio:', err)
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

  // Always insert ASSISTANT message; store the Supabase Storage URL (or null if upload failed)
  const { error: assistantInsertError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'assistant', text: replyText, audio_url: storedAudioUrl, had_correction: errorReport.error_detected, pronunciation_hint: pronunciationHint },
  ])
  if (assistantInsertError) console.error('Assistant message insert failed:', assistantInsertError.message)

  // Atomic errors_log upsert via RPC — avoids SELECT-then-INSERT race under concurrent requests
  if (errorReport.error_detected && errorReport.error_text && errorReport.correct_form && errorReport.error_type) {
    const { error: errLogError } = await supabase.rpc('upsert_error_log', {
      p_user_id: user.id,
      p_error_type: errorReport.error_type,
      p_error_text: errorReport.error_text,
      p_correct_form: errorReport.correct_form,
    })
    if (errLogError) console.error('Error log upsert failed:', errLogError.message)
  }

  // Atomic usage_log increment via RPC — avoids SELECT-then-UPSERT race
  const usage = chatRes.usage
  // Brazil local date (UTC-3) so usage_log rows match the streak date from finalize
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { error: usageError } = await supabase.rpc('increment_usage_log', {
    p_user_id: user.id,
    p_date: today,
    p_whisper_minutes: audio ? 0.5 : 0,
    p_tts_chars: replyText.length,
    p_claude_tokens: (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
    p_did_credits: videoUrl ? 1 : 0,
  })
  if (usageError) console.error('Usage log increment failed:', usageError.message)

  const response: ConversationResponse = {
    text: replyText,
    audio_url: audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
    transcript,
    pronunciation_hint: pronunciationHint,
  }

  return NextResponse.json(response)
}
