import { createSupabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'

const PAGE_SIZE = 50

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string }
}) {
  const supabase = createSupabaseAdmin()
  const q = searchParams.q ?? ''
  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10) || 0)

  // Strip characters that would corrupt the PostgREST filter string
  const safeQ = q.replace(/[,%()]/g, '')

  let query = supabase
    .from('users')
    .select('id, name, email, plan_id, cefr_level, streak_days, created_at, subscriptions(status)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (safeQ) {
    query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
  }

  const { data: users, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const emails = (users ?? []).map((u) => u.email).filter(Boolean)
  const { data: vipRows } = emails.length
    ? await supabase.from('vip_users').select('email').eq('active', true).in('email', emails)
    : { data: [] }
  const vipSet = new Set((vipRows ?? []).map((v) => v.email))

  const pageUrl = (p: number) =>
    `?page=${p}${safeQ ? `&q=${encodeURIComponent(safeQ)}` : ''}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Usuários
        </h1>
        <form>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar nome ou email…"
            className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
          />
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Nome</th>
              <th className="pb-2 pr-4 font-medium">Email</th>
              <th className="pb-2 pr-4 font-medium">Plano</th>
              <th className="pb-2 pr-4 font-medium">Nível</th>
              <th className="pb-2 pr-4 font-medium">Streak</th>
              <th className="pb-2 pr-4 font-medium">Cadastro</th>
              <th className="pb-2 font-medium">Status assinatura</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr
                key={u.id}
                className="border-b border-surface-light-card dark:border-surface-dark-card hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
              >
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/usuarios/${u.id}`}
                    className="text-brand-cta hover:underline"
                  >
                    {u.name ?? '—'}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {u.email}
                </td>
                <td className="py-2 pr-4">
                  {vipSet.has(u.email) ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-cta text-white">VIP</span>
                  ) : (u.plan_id ?? 'free')}
                </td>
                <td className="py-2 pr-4">{u.cefr_level ?? '—'}</td>
                <td className="py-2 pr-4">{u.streak_days ?? 0}</td>
                <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                  {formatDate(u.created_at)}
                </td>
                <td className="py-2">
                  {(u.subscriptions as { status: string }[] | null)?.[0]?.status ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(users ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhum usuário encontrado.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          {page > 0 && (
            <Link href={pageUrl(page - 1)} className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70">
              ← Anterior
            </Link>
          )}
          <span className="text-content-light-secondary dark:text-content-dark-secondary">
            Página {page + 1} de {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link href={pageUrl(page + 1)} className="px-3 py-1 rounded-lg bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:opacity-70">
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
