import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    lesson_slug: string
    step_index: number
    word?: string
    score?: number
  }
  const { lesson_slug, step_index, word, score } = body

  // Get existing vocab_scores to merge
  const { data: existing } = await supabase
    .from('user_lesson_progress')
    .select('vocab_scores')
    .eq('user_id', user.id)
    .eq('lesson_slug', lesson_slug)
    .maybeSingle()

  const vocabScores = {
    ...(existing?.vocab_scores as Record<string, number> ?? {}),
    ...(word !== undefined && score !== undefined ? { [word]: score } : {}),
  }

  const { error } = await supabase
    .from('user_lesson_progress')
    .upsert({
      user_id: user.id,
      lesson_slug,
      status: 'in_progress',
      current_step_index: step_index,
      vocab_scores: vocabScores,
    }, { onConflict: 'user_id,lesson_slug' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert word mastery
  if (word !== undefined && score !== undefined) {
    const { error: masteryError } = await supabase
      .from('user_word_mastery')
      .upsert({
        user_id: user.id,
        word,
        lesson_slug,
        pronunciation_avg: score,
        last_reviewed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,word' })
    if (masteryError) console.error('word_mastery upsert error:', masteryError.message)
  }

  return NextResponse.json({ ok: true })
}
