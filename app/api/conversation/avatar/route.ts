import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { createDidTalk, DID_VOICE_IDS } from '@/lib/did'
import type { AvatarCreateResponse } from '@/types'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { message_id?: string }
  const messageId = body.message_id
  if (!messageId) return NextResponse.json({ error: 'message_id required' }, { status: 400 })

  const { data: message } = await supabase
    .from('messages')
    .select('id, text, session_id')
    .eq('id', messageId)
    .eq('role', 'assistant')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('sessions')
    .select('*, teacher:teachers(slug, avatar_image_url)')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const didOrigin = process.env.EF_PUBLIC_ORIGIN
  if (!didOrigin) {
    const { error } = await supabase.from('messages').update({ video_status: 'skipped' }).eq('id', messageId)
    if (error) console.error('Message video_status skipped-update failed:', error.message)
    const response: AvatarCreateResponse = { talk_id: null, video_status: 'skipped' }
    return NextResponse.json(response)
  }

  const teacher = session.teacher as { slug?: string; avatar_image_url?: string } | null
  const talkId = await createDidTalk(
    message.text,
    DID_VOICE_IDS[teacher?.slug ?? ''] ?? 'en-US-JennyNeural',
    `${didOrigin}${teacher?.avatar_image_url ?? ''}`,
  )

  if (!talkId) {
    const { error } = await supabase.from('messages').update({ video_status: 'failed' }).eq('id', messageId)
    if (error) console.error('Message video_status failed-update failed:', error.message)
    const response: AvatarCreateResponse = { talk_id: null, video_status: 'failed' }
    return NextResponse.json(response)
  }

  const { error } = await supabase.from('messages').update({ did_talk_id: talkId, video_status: 'pending' }).eq('id', messageId)
  if (error) console.error('Message video_status pending-update failed:', error.message)
  const response: AvatarCreateResponse = { talk_id: talkId, video_status: 'pending' }
  return NextResponse.json(response)
}
