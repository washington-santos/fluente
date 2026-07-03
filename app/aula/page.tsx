import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
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

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', userData.teacher_id)
    .single()

  if (!teacher) redirect('/dashboard')

  return <AulaClient teacher={teacher as Teacher} cefrLevel={userData.cefr_level ?? null} />
}
