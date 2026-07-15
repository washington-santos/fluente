import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import type { CefrLevel } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { word } = await request.json() as { word?: string }
  if (!word) return NextResponse.json({ error: 'word required' }, { status: 400 })

  const { data: userData } = await supabase.from('users').select('cefr_level').eq('id', user.id).single()
  const cefrLevel = (userData as { cefr_level?: CefrLevel | null } | null)?.cefr_level ?? 'A1'

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `You are an English teacher helping a Brazilian student (CEFR ${cefrLevel}) who is struggling with the word "${word}".
Give ONE additional example sentence using "${word}" (different from a typical textbook example), plus a slightly more detailed Portuguese explanation of how/when to use the word.
Respond ONLY with JSON:
{"example_sentence_en":"...","example_sentence_pt":"...","explanation_pt":"..."}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}') as Record<string, unknown>
    return NextResponse.json({
      example_sentence_en: String(parsed.example_sentence_en ?? ''),
      example_sentence_pt: String(parsed.example_sentence_pt ?? ''),
      explanation_pt: String(parsed.explanation_pt ?? ''),
    })
  } catch (err) {
    console.error('[lesson/extra-example] generation failed:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
