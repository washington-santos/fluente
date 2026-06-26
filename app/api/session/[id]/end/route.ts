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
  const body = await request.json() as { duration_seconds: number }

  // Fix 9: Verify ownership first so the result doesn't depend on RLS SELECT/UPDATE
  // policy alignment — a SELECT policy more restrictive than UPDATE would cause
  // chained .select('id') after UPDATE to return [] even on success.
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Plain UPDATE without chained .select() — no RLS split-policy ambiguity
  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds: body.duration_seconds })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
