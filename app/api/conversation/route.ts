import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { synthesizeTts } from '@/lib/tts'
import { createTalk, DID_VOICE_IDS } from '@/lib/did'
import { getTopicByKey } from '@/lib/topics'
import type { ConversationResponse, ErrorReport, ErrorType } from '@/types'
import { isUserVip } from '@/lib/vip'

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
  new_words: Array<{ word: string; definition: string }> | null
  suggested_replies: string[] | null
  reply_pt: string | null
  prompt_hint: string | null
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Quota check ─────────────────────────────────────────────────────────
  // VIP check first — avoids unnecessary DB queries for VIP users
  const vipUser = await isUserVip(user.email ?? '')

  if (!vipUser) {
    const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const firstOfMonth = `${nowBR.getUTCFullYear()}-${String(nowBR.getUTCMonth() + 1).padStart(2, '0')}-01`

    const [{ data: subData, error: quotaSubError }, { data: demoUserData, error: quotaDemoError }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plans!inner(minutes_per_month)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('users')
        .select('demo_status, demo_started_at, demo_expires_at')
        .eq('id', user.id)
        .single(),
    ])

    // '42703' = column does not exist — demo columns not yet migrated, treat as no demo
    const demoColumnsMissing = quotaDemoError?.code === '42703'

    if (quotaSubError || (quotaDemoError && !demoColumnsMissing)) {
      console.error('Quota check DB error', quotaSubError ?? quotaDemoError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (subData) {
      // ── Active subscription path ───────────────────────────────────────
      const minutesLimit = (subData.plans as unknown as { minutes_per_month: number }).minutes_per_month
      const { data: usageRows, error: usageError } = await supabase
        .from('usage_log')
        .select('whisper_minutes')
        .eq('user_id', user.id)
        .gte('date', firstOfMonth)

      if (usageError) {
        console.error('Quota usage DB error', usageError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      const minutesUsed: number = (usageRows ?? []).reduce(
        (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
        0,
      )
      if (minutesUsed >= minutesLimit) {
        return NextResponse.json({ error: 'quota_exceeded', minutesUsed, minutesLimit }, { status: 429 })
      }
    } else if (demoColumnsMissing) {
      // Demo columns not yet in DB — block until migration is applied
      return NextResponse.json({ error: 'demo_required', minutesUsed: 0, minutesLimit: 30 }, { status: 403 })
    } else {
      // ── Demo path ──────────────────────────────────────────────────────
      const demo = demoUserData

      if (!demo?.demo_status) {
        return NextResponse.json({ error: 'demo_required', minutesUsed: 0, minutesLimit: 30 }, { status: 403 })
      }
      if (demo.demo_status === 'expired') {
        return NextResponse.json({ error: 'demo_expired', minutesUsed: 0, minutesLimit: 30 }, { status: 429 })
      }
      if (demo.demo_status === 'exhausted') {
        return NextResponse.json({ error: 'demo_exhausted', minutesUsed: 30, minutesLimit: 30 }, { status: 429 })
      }
      if (demo.demo_expires_at && new Date(demo.demo_expires_at) <= new Date()) {
        await supabase.from('users').update({ demo_status: 'expired' }).eq('id', user.id)
        return NextResponse.json({ error: 'demo_expired', minutesUsed: 0, minutesLimit: 30 }, { status: 429 })
      }

      const demoStartDate = (demo.demo_started_at ?? new Date().toISOString()).slice(0, 10)
      const { data: demoUsageRows, error: demoUsageError } = await supabase
        .from('usage_log')
        .select('whisper_minutes')
        .eq('user_id', user.id)
        .gte('date', demoStartDate)

      if (demoUsageError) {
        console.error('Demo quota usage DB error', demoUsageError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      const DEMO_MINUTES_LIMIT = 30
      const minutesUsed: number = (demoUsageRows ?? []).reduce(
        (sum: number, r: { whisper_minutes: number }) => sum + (r.whisper_minutes ?? 0),
        0,
      )
      if (minutesUsed >= DEMO_MINUTES_LIMIT) {
        await supabase.from('users').update({ demo_status: 'exhausted' }).eq('id', user.id)
        return NextResponse.json(
          { error: 'demo_exhausted', minutesUsed, minutesLimit: DEMO_MINUTES_LIMIT },
          { status: 429 },
        )
      }
    }
  } // end if (!vipUser) — VIP users skip quota enforcement
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
  const lessonPlan = (session as Record<string, unknown>).lesson_plan_json as {
    title_pt?: string
    objective_pt?: string
    teacher_greeting?: string
    lesson_instructions?: string
    vocabulary_focus?: string[]
  } | null

  const topicBlock = lessonPlan
    ? `\nPERSONALIZED LESSON PLAN FOR TODAY:
Topic: "${lessonPlan.title_pt ?? topicData?.labelPt ?? ''}"
Objective: "${lessonPlan.objective_pt ?? ''}"
On your FIRST message, open with: "${lessonPlan.teacher_greeting ?? ''}"
Session instructions: ${lessonPlan.lesson_instructions ?? 'Follow normal lesson structure.'}
${lessonPlan.vocabulary_focus?.length ? `Vocabulary to cover: ${lessonPlan.vocabulary_focus.join(', ')}` : ''}`
    : topicData
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
  const anatomyBlock = lessonPlan
    ? `\nLESSON STRUCTURE — you are the TEACHER, you lead every step:
1. OPENING (your very first message): Use the personalized greeting above, then IMMEDIATELY begin teaching the first vocabulary item or concept. Do NOT just ask a question — start teaching.
2. TEACH BEFORE YOU TEST — for every new word or concept:
   a) YOU introduce it: say it clearly + give the Portuguese translation + give a simple relatable example (e.g. "RED 🔴 — in Portuguese, 'vermelho'. Think of a red apple or a traffic light!")
   b) Only AFTER explaining, ask the student to repeat or use it: "Can you say 'red'?"
   c) If the student struggles or gets it wrong, YOU say the word again clearly, then ask once more. Never move on without the student getting it right.
3. BUILD PROGRESSIVELY: After introducing 2–3 items, create a small practice moment combining what was taught. Never introduce all items at once — interleave teaching and practice.
4. WRAP UP: At the end, do a quick friendly review of everything covered. Be warm and encouraging.

CRITICAL RULE: NEVER ask the student to say or use something they have NOT been taught in this session yet. You are a teacher guiding a beginner — not a quiz master testing them cold.`
    : `\nSession anatomy — follow this structure:
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
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null,"suggested_replies":null,"reply_pt":null,"prompt_hint":null}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
When the student's transcript reveals a common Brazilian pronunciation pattern issue (e.g. "th" pronounced as "d" or "t", dropping final "s", wrong word stress, "ed" pronounced as a full syllable), set pronunciation_hint to a single clear tip under 20 words. Otherwise set pronunciation_hint to null.
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.
For suggested_replies: provide 2-3 very short English phrases (under 8 words each) the student could realistically say next, appropriate for ${cefrLevel} level. If no student response is needed, set to null.
For reply_pt: always provide a Brazilian Portuguese translation of your "reply" field.
For prompt_hint: if the student might not know how to start responding, provide a short tip in Portuguese starting with "Tente dizer:" (e.g., "Tente dizer: My name is ___"). Set to null if the expected response is obvious.`

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
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null, suggested_replies: null, reply_pt: null, prompt_hint: null }
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

  // Parse new_words from GPT response
  const newWordsRaw: Array<{ word: string; definition: string }> = Array.isArray(parsed.new_words)
    ? (parsed.new_words as unknown[]).filter(
        (w): w is { word: string; definition: string } =>
          typeof (w as { word?: unknown }).word === 'string' &&
          typeof (w as { definition?: unknown }).definition === 'string'
      )
    : []

  const suggestedRepliesRaw: string[] | null = Array.isArray(parsed.suggested_replies)
    ? (parsed.suggested_replies as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, 3)
    : null

  const replyPt: string | null = (typeof parsed.reply_pt === 'string' && parsed.reply_pt.length > 0)
    ? parsed.reply_pt
    : null

  const promptHint: string | null = (typeof parsed.prompt_hint === 'string' && parsed.prompt_hint.length > 0)
    ? parsed.prompt_hint
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

  // Run TTS and D-ID in parallel to reduce response latency
  const supabaseAdmin = createSupabaseAdmin()
  const didOrigin = process.env.EF_PUBLIC_ORIGIN

  const [ttsSettled, didSettled] = await Promise.allSettled([
    synthesizeTts(replyText, teacher.tts_voice ?? 'alloy').then(async ({ dataUrl, buffer }) => {
      const storagePath = `${user.id}/${sessionId}/${crypto.randomUUID()}.mp3`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('audio-replay')
        .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })
      const stored = uploadError
        ? null
        : supabaseAdmin.storage.from('audio-replay').getPublicUrl(storagePath).data.publicUrl
      if (uploadError) console.error('Audio upload failed:', uploadError.message)
      return { audioUrl: dataUrl, storedAudioUrl: stored }
    }),
    didOrigin
      ? createTalk(replyText, DID_VOICE_IDS[teacher.slug] ?? 'en-US-JennyNeural', `${didOrigin}${teacher.avatar_image_url}`)
      : Promise.resolve(null),
  ])

  let audioUrl: string | null = null
  let storedAudioUrl: string | null = null
  if (ttsSettled.status === 'fulfilled') {
    audioUrl = ttsSettled.value.audioUrl
    storedAudioUrl = ttsSettled.value.storedAudioUrl
  } else {
    console.error('TTS/storage failed, continuing without audio:', ttsSettled.reason)
  }

  let videoUrl: string | null = null
  if (didSettled.status === 'fulfilled') {
    videoUrl = didSettled.value
  } else {
    console.error('D-ID failed, continuing without video:', didSettled.reason)
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

  // Upsert vocabulary words — ignoreDuplicates keeps existing spaced rep state
  if (newWordsRaw.length > 0) {
    const { error: vocabError } = await supabase
      .from('vocab_log')
      .upsert(
        newWordsRaw.map((w) => ({
          user_id: user.id,
          word: w.word.toLowerCase().trim(),
          definition: w.definition.trim(),
        })),
        { onConflict: 'user_id,word', ignoreDuplicates: true }
      )
    if (vocabError) console.error('Vocab log upsert failed:', vocabError.message)
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
    audio_url: storedAudioUrl ?? audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
    transcript,
    pronunciation_hint: pronunciationHint,
    new_words: newWordsRaw.length > 0 ? newWordsRaw.map((w) => w.word) : null,
    suggested_replies: suggestedRepliesRaw,
    reply_pt: replyPt,
    prompt_hint: promptHint,
  }

  return NextResponse.json(response)
}
