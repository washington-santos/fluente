import { createSupabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const supabase = createSupabaseAdmin()
  const q = searchParams.q ?? ''

  // Strip characters that would corrupt the PostgREST filter string
  const safeQ = q.replace(/[,%()]/g, '')

  let query = supabase
    .from('users')
    .select('id, name, email, plan_id, cefr_level, streak_days, created_at, subscriptions(status)')
    .order('created_at', { ascending: false })

  if (safeQ) {
    query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
  }

  const { data: users } = await query

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
                <td className="py-2 pr-4">{u.plan_id ?? 'free'}</td>
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
    </div>
  )
}
