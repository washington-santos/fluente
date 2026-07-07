import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { PlansGrid } from './PlansGrid'
import { SuccessBanner } from './SuccessBanner'
import type { DemoStatus } from '@/types'

interface Props {
  searchParams: { status?: string; demo_ended?: string }
}

export default async function PlanosPage({ searchParams }: Props) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: activeSub }] = await Promise.all([
    supabase
      .from('users')
      .select('plan_id, demo_status, demo_expires_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const currentPlanId = activeSub?.plan_id ?? userData?.plan_id ?? null
  const demoStatus = (userData?.demo_status ?? null) as DemoStatus | null
  const demoEnded = searchParams.demo_ended === '1'

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="font-bold text-content-light dark:text-content-dark">Planos</h1>
      </header>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <Suspense fallback={null}>
          <SuccessBanner />
        </Suspense>

        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-content-light dark:text-content-dark leading-tight">
            Escolha como você quer evoluir
          </h2>
          <p className="text-content-light-secondary dark:text-content-dark-secondary mt-2 text-base">
            Comece com 7 dias grátis. Cancele quando quiser.
          </p>
        </div>

        <PlansGrid
          currentPlanId={currentPlanId}
          demoStatus={demoStatus}
          hasActiveSubscription={!!activeSub}
          subscriptionEndDate={activeSub?.current_period_end ?? null}
          demoEnded={demoEnded}
        />

        <p className="text-center text-xs text-content-light-secondary dark:text-content-dark-secondary mt-10">
          Pagamento seguro via Mercado Pago · Cancele quando quiser
        </p>
      </div>
    </main>
  )
}
