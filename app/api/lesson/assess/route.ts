import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

async function transcodeToWav(input: Buffer): Promise<Buffer> {
  const id = randomUUID()
  const inputPath = join(tmpdir(), `${id}-in`)
  const outputPath = join(tmpdir(), `${id}-out.wav`)
  await writeFile(inputPath, input)
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as unknown as string, ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', outputPath])
      proc.on('error', reject)
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))))
    })
    return await readFile(outputPath)
  } finally {
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

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

  if (type !== 'pronunciation') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const trimmedPanicText = panicText?.trim() || null
  if (!audio && !trimmedPanicText) {
    return NextResponse.json({ error: 'No audio or text' }, { status: 400 })
  }

  try {
    if (trimmedPanicText) {
      const prompt = `You are assessing English pronunciation for an A1 learner from Brazil.
Target: "${target}"
Student said: "${trimmedPanicText}"

Respond ONLY with valid JSON (no markdown):
{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0].message.content ?? '{}')
      return NextResponse.json(result)
    }

    const inputBuffer = Buffer.from(await (audio as Blob).arrayBuffer())
    const wavBuffer = await transcodeToWav(inputBuffer)

    const prompt = `You are assessing English pronunciation for an A1 learner from Brazil by listening to their recording.
Target word: "${target}"

Listen carefully to the audio and respond with ONLY a raw JSON object, no markdown code fences, no explanation before or after:
{"assessment":"correct or close or incorrect","score":0.0 to 1.0,"feedback_pt":"short encouraging feedback in Portuguese","phoneme_note_pt":"one plain-Portuguese sentence naming the specific sound that was wrong and how to fix it, or null if assessment is correct"}`

    // gpt-audio does not support response_format:"json_object" — it only
    // works with modalities:["text"]-only chat models — so the model may
    // occasionally wrap its JSON in a markdown code fence despite the
    // prompt instruction; strip fences before parsing.
    const completion = await openai.chat.completions.create({
      model: 'gpt-audio',
      modalities: ['text'],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'input_audio', input_audio: { data: wavBuffer.toString('base64'), format: 'wav' } },
        ],
      }],
      max_tokens: 200,
    })
    const rawContent = completion.choices[0].message.content ?? '{}'
    const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch (e) {
    console.error('lesson/assess pronunciation failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Assessment failed' }, { status: 500 })
  }
}
