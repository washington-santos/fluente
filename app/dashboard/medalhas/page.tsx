import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BadgeIcon } from '@/components/dashboard/BadgeIcon'
import { BADGE_DEFINITIONS, type BadgeKey } from '@/lib/badges'

const CATEGORY_LABELS_PT: Record<'constancia' | 'dominio', string> = {
  constancia: 'Constância',
  dominio: 'Domínio',
}

export default async function MedalhasPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('user_badges')
    .select('badge_key, earned_at')
    .eq('user_id', user.id)

  const earnedMap = new Map(
    ((rows ?? []) as Array<{ badge_key: BadgeKey; earned_at: string }>).map(r => [r.badge_key, r.earned_at]),
  )

  const categories: Array<'constancia' | 'dominio'> = ['constancia', 'dominio']

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full gap-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Suas medalhas</h1>

        {categories.map(category => (
          <div key={category} className="flex flex-col gap-2">
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              {CATEGORY_LABELS_PT[category]}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {BADGE_DEFINITIONS.filter(b => b.category === category).map(badge => {
                const earnedAt = earnedMap.get(badge.key)
                const earned = Boolean(earnedAt)
                return (
                  <div
                    key={badge.key}
                    className={`flex flex-col items-center gap-1 p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center ${
                      earned ? '' : 'opacity-40 grayscale'
                    }`}
                  >
                    <BadgeIcon icon={badge.icon} size={28} className="text-brand-cta" />
                    <p className="text-xs font-semibold text-content-light dark:text-content-dark">{badge.title_pt}</p>
                    <p className="text-[10px] text-content-light-secondary dark:text-content-dark-secondary">
                      {earned
                        ? new Date(earnedAt as string).toLocaleDateString('pt-BR')
                        : badge.description_pt}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
