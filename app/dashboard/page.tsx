import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { StreakBadge } from '@/components/dashboard/StreakBadge'
import { SessionCard } from '@/components/dashboard/SessionCard'
import { ErrorCard } from '@/components/dashboard/ErrorCard'
import type { Teacher, User, Session, ErrorLog, ErrorType } from '@/types'

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

  // Load recent completed sessions (last 5) with teacher name
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, teacher:teachers(name)')
    .eq('user_id', authUser.id)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(5)

  // Load top recurring errors (unresolved, ordered by seen_count desc)
  const { data: errors } = await supabase
    .from('error_log')
    .select('id, error_type, error_text, correct_form, seen_count')
    .eq('user_id', authUser.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(5)

  const u = userData as User
  const t = teacher as Teacher | null

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <h1 className="text-lg font-bold text-content-light dark:text-content-dark">
          English Fluent
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
        {/* Greeting */}
        <div>
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            Olá, {u.name ?? 'aluno'}!
          </p>
          <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-0.5">
            Pronto para praticar?
          </p>
        </div>

        {/* Streak */}
        <StreakBadge streakDays={u.streak_days ?? 0} />

        {/* CTA */}
        <Link
          href="/aula"
          className="w-full py-4 rounded-xl bg-brand-cta text-white font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Começar aula
        </Link>

        {/* Teacher */}
        {t && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              Seu professor
            </p>
            <p className="font-bold text-content-light dark:text-content-dark">{t.name}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
              Nível {u.cefr_level}
            </p>
          </div>
        )}

        {/* Recent sessions */}
        {(recentSessions ?? []).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
              Aulas recentes
            </h2>
            <div className="flex flex-col gap-2">
              {(recentSessions ?? []).map((s: { id: string; started_at: string; duration_seconds: number | null; teacher: Array<{ name: string }> | null }) => (
                <SessionCard
                  key={s.id}
                  id={s.id}
                  started_at={s.started_at}
                  duration_seconds={s.duration_seconds}
                  teacher_name={s.teacher?.[0]?.name ?? 'Professor'}
                />
              ))}
            </div>
          </section>
        )}

        {/* Error log */}
        {(errors ?? []).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
              Erros frequentes
            </h2>
            <div className="flex flex-col gap-2">
              {(errors ?? []).map((e: { id: string; error_type: string; error_text: string; correct_form: string; seen_count: number }) => (
                <ErrorCard
                  key={e.id}
                  errorText={e.error_text}
                  correctForm={e.correct_form}
                  errorType={e.error_type as ErrorType}
                  seenCount={e.seen_count}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
