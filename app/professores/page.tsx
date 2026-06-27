import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { TeacherSwitcher } from './TeacherSwitcher'

export default async function ProfessoresPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: teachers }] = await Promise.all([
    supabase.from('users').select('teacher_id').eq('id', user.id).single(),
    supabase.from('teachers').select('id, slug, name, correction_style').order('name'),
  ])

  if (!userData) redirect('/login')

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="font-bold text-content-light dark:text-content-dark">Professores</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full">
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mb-6">
          Escolha o professor que melhor se adapta ao seu nível e estilo de aprendizado.
        </p>

        <TeacherSwitcher
          teachers={teachers ?? []}
          currentTeacherId={userData.teacher_id ?? ''}
          userId={user.id}
        />
      </div>
    </main>
  )
}
