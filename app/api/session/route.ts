import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { SessionMode } from '@/types'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(*)')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) return NextResponse.json({ session: null })

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(20)

  return NextResponse.json({ session: { ...session, messages: messages ?? [] } })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { teacher_id: string; mode?: SessionMode }
  if (!body.teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({ user_id: user.id, teacher_id: body.teacher_id, mode: body.mode ?? 'daily' })
    .select('id')
    .single()

  if (error || !newSession) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', body.teacher_id)
    .single()

  return NextResponse.json({ session_id: newSession.id, teacher })
}
