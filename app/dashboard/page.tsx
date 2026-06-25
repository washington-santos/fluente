import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Teacher, User } from '@/types'

export default async function DashboardPage() {
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

  const u = userData as User
  const t = teacher as Teacher | null

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4">
        <h1 className="text-lg font-bold text-content-light dark:text-content-dark">
          English Fluent
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-center">
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm mb-1">
            Olá, {u.name ?? 'aluno'}!
          </p>
          <p className="text-2xl font-bold text-content-light dark:text-content-dark">
            Pronto para praticar?
          </p>
        </div>

        {t && (
          <div className="w-full max-w-sm p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              Seu professor
            </p>
            <p className="font-bold text-content-light dark:text-content-dark">{t.name}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
              Nível {u.cefr_level}
            </p>
          </div>
        )}

        <Link
          href="/aula"
          className="w-full max-w-sm py-4 rounded-xl bg-brand-cta text-white font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Começar aula
        </Link>
      </div>
    </main>
  )
}
