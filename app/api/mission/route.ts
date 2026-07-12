import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getOrGenerateTodaysMission } from '@/lib/missions'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mission = await getOrGenerateTodaysMission(user.id, supabase)

  return NextResponse.json({ mission })
}
