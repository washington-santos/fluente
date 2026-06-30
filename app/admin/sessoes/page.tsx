import { createSupabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'

const PAGE_SIZE = 50

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

export default async function AdminSessoesPage({
  searchParams,
}: {
  searchParams: { page?: string; from?: string; to?: string }
}) {
  const supabase = createSupabaseAdmin()
  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10))
  const from = searchParams.from ?? ''
  const to = searchParams.to ?? ''

  let query = supabase
    .from('sessions')
    .select(
      'id, started_at, duration_seconds, mode, user:users(name, email), teacher:teachers(name)',
      { count: 'exact' },
    )
    .order('started_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (from) query = query.gte('started_at', from)
  if (to) query = query.lte('started_at', `${to}T23:59:59`)

  const { data: sessions, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const pageUrl = (p: number) =>
    `?page=${p}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Sessões
        </h1>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="px-2 py-1 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
          />
          <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            até
          </span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="px-2 py-1 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
          />
          <button
            type="submit"
            className="px-3 py-1 text-sm rounded-lg bg-brand-cta text-white hover:opacity-90 transition-opacity"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Usuário</th>
              <th className="pb-2 pr-4 font-medium">Professor</th>
              <th className="pb-2 pr-4 font-medium">Modo</th>
              <th className="pb-2 pr-4 font-medium">Duração</th>
              <th className="pb-2 pr-4 font-medium">Data</th>
              <th className="pb-2 font-medium">Replay</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => (
              <tr
                key={s.id}
                className="border-b border-surface-light-card dark:border-surface-dark-card hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
              >
                <td className="py-2 pr-4">
                  {(s.user as unknown as { name: string | null; email: string } | null)?.name ??
                    (s.user as unknown as { name: string | null; email: string } | null)?.email ??
                    '—'}
                </td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {(s.teacher as unknown as { name: string } | null)?.name ?? '—'}
                </td>
                <td className="py-2 pr-4">{s.mode}</td>
                <td className="py-2 pr-4">{formatDuration(s.duration_seconds)}</td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {formatDate(s.started_at)}
                </td>
                <td className="py-2">
                  <Link
                    href={`/admin/sessoes/${s.id}`}
                    className="text-brand-cta hover:underline text-xs"
                  >
                    ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(sessions ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhuma sessão encontrada.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          {page > 0 && (
            <Link
              href={pageUrl(page - 1)}
              className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70"
            >
              ← Anterior
            </Link>
          )}
          <span className="text-content-light-secondary dark:text-content-dark-secondary">
            Página {page + 1} de {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link
              href={pageUrl(page + 1)}
              className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70"
            >
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
