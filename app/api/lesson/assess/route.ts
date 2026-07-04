import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type') as 'pronunciation' | 'conversation'
  const target = formData.get('target') as string
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('text') as string | null
  const allowedVocabRaw = formData.get('allowed_vocab') as string | null
  const historyRaw = formData.get('history') as string | null

  // Transcribe audio or use panic text
  let transcript = panicText?.trim() ?? null
  if (audio && !transcript) {
    const audioFile = new File([audio], 'recording.webm', { type: audio.type || 'audio/webm' })
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'en',
    })
    transcript = transcription.text
  }
  if (!transcript) return NextResponse.json({ error: 'No audio or text' }, { status: 400 })

  if (type === 'pronunciation') {
    const prompt = `You are assessing English pronunciation for an A1 learner from Brazil.
Target: "${target}"
Student said: "${transcript}"

Respond ONLY with valid JSON (no markdown):
{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!"}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
      response_format: { type: 'json_object' },
    })
    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(result)
  }

  if (type === 'conversation') {
    const vocab: string[] = allowedVocabRaw ? JSON.parse(allowedVocabRaw) : []
    const history: Array<{ role: string; content: string }> = historyRaw ? JSON.parse(historyRaw) : []

    const system = `You are Mrs. Carol, teaching English to an A1 learner.
ALLOWED WORDS ONLY: ${vocab.join(', ')}.
Rules: ask only YES/NO questions or ask student to say a word. Max 1 sentence. Give feedback in Portuguese when needed.
Respond ONLY with valid JSON: {"reply":"...","reply_pt":"...","feedback_pt":"..."}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: transcript },
      ],
      max_tokens: 150,
      response_format: { type: 'json_object' },
    })
    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...result, transcript })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
