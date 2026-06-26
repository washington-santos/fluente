import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Fix 6: Parse body safely — bad JSON returns 400 instead of 500
  let duration_seconds = 0
  try {
    const body = await request.json()
    duration_seconds = typeof body?.duration_seconds === 'number' ? body.duration_seconds : 0
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Fix 5: Verify ownership — check selectError so DB failures surface as 500, not 404
  const { data: existing, error: selectError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Fix 4: Chain .select('id') so a 0-row UPDATE is detected (session already ended)
  const { data: updated, error: updateError } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Session already ended or not found' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
