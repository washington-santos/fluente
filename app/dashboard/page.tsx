import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { StreakBadge } from '@/components/dashboard/StreakBadge'
import { SessionCard } from '@/components/dashboard/SessionCard'
import { ErrorCard } from '@/components/dashboard/ErrorCard'
import { MissionCard } from '@/components/dashboard/MissionCard'
import { ProgressMemoryCard } from '@/components/dashboard/ProgressMemoryCard'
import { getMissionForDate } from '@/lib/missions'
import type { Teacher, User, ErrorType } from '@/types'

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
    .from('errors_log')
    .select('id, error_type, error_text, correct_form, seen_count')
    .eq('user_id', authUser.id)
    .is('resolved_at', null)
    .lte('next_review_at', new Date().toISOString())
    .order('seen_count', { ascending: false })
    .limit(5)

  // Load due vocabulary cards count
  const { data: dueVocab } = await supabase
    .from('vocab_log')
    .select('id')
    .eq('user_id', authUser.id)
    .lte('next_review_at', new Date().toISOString())
    .limit(1)

  // Progress memory — last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ count: resolvedErrorCount }, { count: newVocabCount }] = await Promise.all([
    supabase
      .from('errors_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .not('resolved_at', 'is', null)
      .gte('resolved_at', thirtyDaysAgo),
    supabase
      .from('vocab_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .gte('created_at', thirtyDaysAgo),
  ])

  // Load today's mission status
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: missionLog } = await supabase
    .from('daily_missions_log')
    .select('completed_at')
    .eq('user_id', authUser.id)
    .eq('date', today)
    .maybeSingle()

  const u = userData as User
  const t = teacher as Teacher | null
  const mission = getMissionForDate(u.cefr_level, today)
  const missionCompleted = !!missionLog?.completed_at

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <h1 className="text-lg font-bold text-content-light dark:text-content-dark">
          English Fluent
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/perfil"
            className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
          >
            Perfil
          </Link>
          <ThemeToggle />
        </div>
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

        {/* Progress memory */}
        <ProgressMemoryCard
          resolvedErrors={resolvedErrorCount ?? 0}
          newVocab={newVocabCount ?? 0}
        />

        {/* Daily Mission */}
        <MissionCard
          titlePt={mission.titlePt}
          descriptionPt={mission.descriptionPt}
          completed={missionCompleted}
        />

        {/* CTA */}
        <Link
          href="/aula"
          className="w-full py-4 rounded-xl bg-brand-cta text-white font-bold text-center text-lg hover:opacity-90 transition-opacity"
        >
          Começar aula
        </Link>

        {/* Teacher */}
        {t && (
          <Link
            href="/professores"
            className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity flex items-center justify-between"
          >
            <div>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
                Seu professor
              </p>
              <p className="font-bold text-content-light dark:text-content-dark">{t.name}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
                Nível {u.cefr_level}
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}

        {/* Planos */}
        <Link
          href="/planos"
          className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
        >
          <div>
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">Planos e assinaturas</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
              {u.plan_id ? `Plano ${u.plan_id}` : 'Plano Grátis'}
            </p>
          </div>
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
        </Link>

        {/* Flashcard review */}
        {(errors ?? []).length > 0 && (
          <Link
            href="/dashboard/revisao"
            className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
          >
            <div>
              <p className="text-sm font-semibold text-content-light dark:text-content-dark">Revisar erros</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {(errors ?? []).length} {(errors ?? []).length === 1 ? 'erro para revisar' : 'erros para revisar'}
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}

        {/* Vocabulary review */}
        {(dueVocab ?? []).length > 0 && (
          <Link
            href="/dashboard/vocabulario"
            className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
          >
            <div>
              <p className="text-sm font-semibold text-content-light dark:text-content-dark">Revisar vocabulário</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                Palavras novas das últimas aulas
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}

        {/* Recent sessions */}
        {(recentSessions ?? []).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
              Aulas recentes
            </h2>
            <div className="flex flex-col gap-2">
              {(recentSessions ?? []).map((s) => (
                <SessionCard
                  key={s.id}
                  id={s.id}
                  started_at={s.started_at}
                  duration_seconds={s.duration_seconds}
                  teacher_name={(s.teacher as { name?: string } | null)?.name ?? 'Professor'}
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
