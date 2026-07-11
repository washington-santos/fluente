import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { pollDidTalk } from '@/lib/did'
import type { AvatarPollResponse } from '@/types'

export async function GET(request: Request, { params }: { params: { talkId: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { talkId } = params

  const { data: message } = await supabase
    .from('messages')
    .select('id, session_id, did_talk_id, video_status, video_url')
    .eq('did_talk_id', talkId)
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'Talk not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Talk not found' }, { status: 404 })

  if (message.video_status === 'ready') {
    const response: AvatarPollResponse = { status: 'ready', video_url: message.video_url }
    return NextResponse.json(response)
  }
  if (message.video_status === 'failed') {
    const response: AvatarPollResponse = { status: 'failed', video_url: null }
    return NextResponse.json(response)
  }

  const result = await pollDidTalk(talkId)

  if (result.status === 'done') {
    await supabase.from('messages').update({ video_status: 'ready', video_url: result.resultUrl }).eq('id', message.id)
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await supabase.rpc('increment_usage_log', {
      p_user_id: user.id, p_date: today, p_whisper_minutes: 0, p_tts_chars: 0, p_claude_tokens: 0, p_did_credits: 1,
    })
    const response: AvatarPollResponse = { status: 'ready', video_url: result.resultUrl }
    return NextResponse.json(response)
  }
  if (result.status === 'error') {
    await supabase.from('messages').update({ video_status: 'failed' }).eq('id', message.id)
    const response: AvatarPollResponse = { status: 'failed', video_url: null }
    return NextResponse.json(response)
  }

  const response: AvatarPollResponse = { status: 'pending', video_url: null }
  return NextResponse.json(response)
}
