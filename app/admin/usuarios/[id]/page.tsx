import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  return `${Math.round(seconds / 60)} min`
}

export default async function AdminUsuarioDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseAdmin()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, plan_id, cefr_level, streak_days, created_at, last_session_at')
    .eq('id', params.id)
    .single()

  if (!user) redirect('/admin/usuarios')

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, teacher:teachers(name)')
    .eq('user_id', params.id)
    .order('started_at', { ascending: false })
    .limit(5)

  const { data: errors } = await supabase
    .from('errors_log')
    .select('error_type, error_text, correct_form, seen_count')
    .eq('user_id', params.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(5)

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70"
        >
          ← Usuários
        </Link>
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          {user.name ?? user.email}
        </h1>
      </div>

      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-2 text-sm">
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Email: </span>
          {user.email}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Plano: </span>
          {user.plan_id ?? 'free'}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Nível: </span>
          {user.cefr_level ?? '—'}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Streak: </span>
          {user.streak_days ?? 0} dias
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Cadastro: </span>
          {formatDate(user.created_at)}
        </p>
        <p>
          <span className="text-content-light-secondary dark:text-content-dark-secondary">Última aula: </span>
          {user.last_session_at ? formatDate(user.last_session_at) : '—'}
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Últimas 5 sessões
        </h2>
        <div className="flex flex-col gap-2">
          {(sessions ?? []).length === 0 && (
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              Nenhuma sessão.
            </p>
          )}
          {(sessions ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-sm"
            >
              <div>
                <p className="font-medium text-content-light dark:text-content-dark">
                  {formatDate(s.started_at)}
                </p>
                <p className="text-content-light-secondary dark:text-content-dark-secondary text-xs">
                  {(s.teacher as unknown as { name: string } | null)?.name ?? '—'} ·{' '}
                  {formatDuration(s.duration_seconds)}
                </p>
              </div>
              <Link
                href={`/admin/sessoes/${s.id}`}
                className="text-xs text-brand-cta hover:underline"
              >
                ver →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Erros frequentes
        </h2>
        <div className="flex flex-col gap-2">
          {(errors ?? []).length === 0 && (
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
              Nenhum erro registrado.
            </p>
          )}
          {(errors ?? []).map((e, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-sm"
            >
              <p className="text-content-light dark:text-content-dark">
                &ldquo;{e.error_text}&rdquo; →{' '}
                <span className="text-brand-cta">{e.correct_form}</span>
              </p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {e.error_type} · visto {e.seen_count}×
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
