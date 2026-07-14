import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { LevelCard } from '@/components/perfil/LevelCard'
import { ProfileForm } from './ProfileForm'

export default async function PerfilPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('name, cefr_level, streak_days, created_at, reinforcement_target_level')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')

  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('ended_at', 'is', null)

  const memberSince = userData.created_at
    ? new Date(userData.created_at).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      })
    : '—'

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="font-bold text-content-light dark:text-content-dark">Meu perfil</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full flex flex-col gap-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
            <p className="text-xl font-bold text-brand-cta">{userData.streak_days ?? 0}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">streak</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
            <p className="text-xl font-bold text-brand-interactive">{sessionCount ?? 0}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">aulas</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
            <p className="text-xl font-bold text-content-light dark:text-content-dark">
              {userData.reinforcement_target_level ?? userData.cefr_level ?? '—'}
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">nível</p>
          </div>
        </div>

        {/* Level */}
        {userData.cefr_level && (
          <LevelCard
            cefrLevel={userData.cefr_level}
            reinforcementTargetLevel={userData.reinforcement_target_level ?? null}
          />
        )}
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary -mt-4">
          Membro desde {memberSince}
        </p>

        {/* Edit form */}
        <ProfileForm
          userId={user.id}
          email={user.email ?? ''}
          initialName={userData.name ?? ''}
        />

        {/* Teacher link */}
        <Link
          href="/professores"
          className="block text-center py-3 rounded-xl border border-surface-light-card dark:border-surface-dark-card text-sm text-content-light dark:text-content-dark hover:opacity-70 transition-opacity"
        >
          Trocar professor
        </Link>

        {/* Planos link */}
        <Link
          href="/planos"
          className="block text-center py-3 rounded-xl bg-brand-cta text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Ver planos e assinaturas
        </Link>

      </div>
    </main>
  )
}
