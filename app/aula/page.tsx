import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { isUserVip } from '@/lib/vip'
import { AulaClient } from './AulaClient'
import type { Teacher } from '@/types'

export default async function AulaPage() {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!userData?.teacher_id) redirect('/cadastro/boas-vindas')

  // Guard: require active subscription or active demo with time remaining
  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', authUser.id)
    .eq('status', 'active')
    .maybeSingle()

  const vipUser = await isUserVip(authUser.email ?? '')

  if (!activeSub && !vipUser) {
    const demoStatus = userData.demo_status as string | null
    const isExpired = demoStatus === 'expired' || demoStatus === 'exhausted'
    const isTimeExpired =
      userData.demo_expires_at && new Date(userData.demo_expires_at) <= new Date()

    if (!demoStatus || isExpired || isTimeExpired) {
      redirect('/planos?demo_ended=1')
    }
  }

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', userData.teacher_id)
    .single()

  if (!teacher) redirect('/dashboard')

  return <AulaClient teacher={teacher as Teacher} cefrLevel={userData.cefr_level ?? null} />
}
