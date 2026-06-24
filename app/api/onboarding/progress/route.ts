import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: progress } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ progress })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    step: number
    written_answers?: string[]
    conversation_transcript?: string
    completed?: boolean
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    current_step: body.step,
  }
  if (body.written_answers !== undefined) payload.written_answers = body.written_answers
  if (body.conversation_transcript !== undefined) payload.conversation_transcript = body.conversation_transcript
  if (body.completed) payload.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from('onboarding_progress')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
