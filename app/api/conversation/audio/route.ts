import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { synthesizeTtsWithRetry } from '@/lib/tts'
import { createStageTimer } from '@/lib/timing'
import type { AudioFetchResponse } from '@/types'

export async function POST(request: Request) {
  const timer = createStageTimer('conversation_audio')
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
    .select('*, teacher:teachers(tts_voice)')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const teacherVoice = (session.teacher as { tts_voice?: string } | null)?.tts_voice ?? 'alloy'

  try {
    const { dataUrl, buffer } = await synthesizeTtsWithRetry(message.text, teacherVoice)
    timer.mark('tts')

    const supabaseAdmin = createSupabaseAdmin()
    const storagePath = `${user.id}/${message.session_id}/${crypto.randomUUID()}.mp3`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-replay')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false })

    const audioUrl = uploadError
      ? dataUrl
      : supabaseAdmin.storage.from('audio-replay').getPublicUrl(storagePath).data.publicUrl
    if (uploadError) console.error('Audio upload failed, using inline data URL:', uploadError.message)
    timer.mark('upload')

    await supabase.from('messages').update({ audio_url: audioUrl, audio_status: 'ready' }).eq('id', messageId)

    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await supabase.rpc('increment_usage_log', {
      p_user_id: user.id,
      p_date: today,
      p_whisper_minutes: 0,
      p_tts_chars: message.text.length,
      p_claude_tokens: 0,
      p_did_credits: 0,
    })

    timer.finish({ message_id: messageId })
    const response: AudioFetchResponse = { audio_url: audioUrl, audio_status: 'ready' }
    return NextResponse.json(response)
  } catch (err) {
    console.error('TTS synthesis failed after retries:', err)
    await supabase.from('messages').update({ audio_status: 'failed' }).eq('id', messageId)
    timer.finish({ message_id: messageId, failed: true })
    const response: AudioFetchResponse = { audio_url: null, audio_status: 'failed' }
    return NextResponse.json(response, { status: 502 })
  }
}
