import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const INTERVAL_DAYS = [1, 3, 7, 14, 30]

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()
  const { data: vocabCards, error } = await supabase
    .from('vocab_log')
    .select('id, word, definition, review_count, next_review_at')
    .eq('user_id', user.id)
    .lte('next_review_at', now)
    .order('next_review_at', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ vocabCards: vocabCards ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { vocabId?: unknown; knewIt?: unknown; currentReviewCount?: unknown }
  const { vocabId, knewIt, currentReviewCount } = body
  if (typeof vocabId !== 'string' || typeof knewIt !== 'boolean' || typeof currentReviewCount !== 'number' || !Number.isInteger(currentReviewCount) || currentReviewCount < 0 || currentReviewCount >= INTERVAL_DAYS.length) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const newCount = knewIt ? Math.min(currentReviewCount + 1, INTERVAL_DAYS.length - 1) : 0
  const daysUntilNext = INTERVAL_DAYS[newCount]
  const nextReviewAt = new Date(Date.now() + daysUntilNext * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('vocab_log')
    .update({
      review_count: newCount,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: nextReviewAt,
    })
    .match({ id: vocabId, user_id: user.id })

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
