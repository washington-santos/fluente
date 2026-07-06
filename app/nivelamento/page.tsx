import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { PlacementTestEngine } from './PlacementTestEngine'

export default async function NivelamentoPage() {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const [{ data: placementResult }, { data: userData }] = await Promise.all([
    supabase.from('placement_results').select('id').eq('user_id', authUser.id).maybeSingle(),
    supabase.from('users').select('teacher_id, written_answers').eq('id', authUser.id).single(),
  ])

  if (placementResult) redirect('/dashboard')

  const { data: teacherData } = await supabase
    .from('teachers')
    .select('name, tts_voice')
    .eq('id', userData?.teacher_id ?? '')
    .maybeSingle()

  const teacherName = teacherData?.name ?? 'Mrs. Carol'
  const teacherVoice = teacherData?.tts_voice ?? 'shimmer'
  const writtenAnswers: string[] = userData?.written_answers ?? []
  const userGoal = writtenAnswers[1] ?? 'conversação'

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark overflow-y-auto">
      <div className="max-w-md mx-auto pt-6">
        <PlacementTestEngine
          teacherName={teacherName}
          teacherVoice={teacherVoice}
          userGoal={userGoal}
        />
      </div>
    </div>
  )
}
