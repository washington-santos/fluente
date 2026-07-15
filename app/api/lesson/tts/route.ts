import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { synthesizeTts } from '@/lib/tts'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const text = formData.get('text') as string | null
  const voice = (formData.get('voice') as string | null) ?? 'alloy'
  const speedRaw = formData.get('speed') as string | null
  const speed = speedRaw ? Math.min(4.0, Math.max(0.25, parseFloat(speedRaw))) : 1.0

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const { dataUrl } = await synthesizeTts(text, voice, speed)
    return NextResponse.json({ audio_url: dataUrl })
  } catch (err) {
    console.error('TTS error:', err)
    return NextResponse.json({ error: 'TTS failed' }, { status: 502 })
  }
}
