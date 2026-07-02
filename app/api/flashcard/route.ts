// app/api/flashcard/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const INTERVAL_DAYS = [1, 3, 7, 14, 30]

export async function GET(_request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()

  const { data: cards } = await supabase
    .from('errors_log')
    .select('id, error_type, error_text, correct_form, review_count')
    .eq('user_id', user.id)
    .is('resolved_at', null)
    .lte('next_review_at', now)
    .order('next_review_at', { ascending: true })
    .limit(20)

  return NextResponse.json({ cards: cards ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { errorId, knewIt, currentReviewCount } = await request.json() as {
    errorId: string
    knewIt: boolean
    currentReviewCount: number
  }

  const now = new Date()
  let newReviewCount: number
  let nextReviewAt: Date

  if (knewIt) {
    newReviewCount = Math.min(currentReviewCount + 1, INTERVAL_DAYS.length - 1)
    const days = INTERVAL_DAYS[newReviewCount]
    nextReviewAt = new Date(now.getTime() + days * 86_400_000)
  } else {
    newReviewCount = 0
    nextReviewAt = new Date(now.getTime() + INTERVAL_DAYS[0] * 86_400_000)
  }

  const { error } = await supabase
    .from('errors_log')
    .update({
      review_count: newReviewCount,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReviewAt.toISOString(),
    })
    .eq('id', errorId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, nextReviewAt: nextReviewAt.toISOString() })
}
