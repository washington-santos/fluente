import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'

export async function POST(request: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type') as string | null
  const target = formData.get('target') as string
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('text') as string | null
  const allowedVocabRaw = formData.get('allowed_vocab') as string | null

  if (type !== 'pronunciation') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Parse vocab early so Whisper can use it as a hint for better recognition
  const vocab: string[] = (() => {
    try { return allowedVocabRaw ? JSON.parse(allowedVocabRaw) : [] }
    catch { return [] }
  })()

  // Transcribe audio or use panic text
  let transcript = panicText?.trim() ?? null
  if (audio && !transcript) {
    try {
      const audioFile = new File([audio], 'recording.webm', { type: audio.type || 'audio/webm' })
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: 'en',
        // Hint Whisper about expected words — improves recognition of accented speech
        prompt: vocab.length > 0 ? `The student will say one of: ${vocab.join(', ')}.` : undefined,
      })
      transcript = transcription.text
    } catch {
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }
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
    try {
      const result = JSON.parse(completion.choices[0].message.content ?? '{}')
      return NextResponse.json(result)
    } catch {
      return NextResponse.json({ error: 'Assessment parse error' }, { status: 500 })
    }
  }
}
