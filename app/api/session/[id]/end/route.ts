import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { duration_seconds: number }

  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds: body.duration_seconds })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
