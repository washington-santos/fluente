import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

const NAV = [
  { href: '/admin', label: 'Visão Geral' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/sessoes', label: 'Sessões' },
  { href: '/admin/custos', label: 'Custos de AI' },
  { href: '/admin/vip', label: 'VIP' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) redirect('/')

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex">
      <aside className="w-52 shrink-0 border-r border-surface-light-card dark:border-surface-dark-card flex flex-col p-4 gap-1">
        <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wider mb-3">
          Admin
        </p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 rounded-lg text-sm text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
