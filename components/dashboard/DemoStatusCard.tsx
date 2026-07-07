import Link from 'next/link'
import type { DemoStatus } from '@/types'

export const DEMO_MINUTES_LIMIT = 30

interface Props {
  demoStatus: DemoStatus | null
  demoExpiresAt: string | null
  demoMinutesUsed: number
  demoMinutesLimit: number
}

function getDaysRemaining(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function DemoStatusCard({ demoStatus, demoExpiresAt, demoMinutesUsed, demoMinutesLimit }: Props) {
  if (!demoStatus) return null

  const minutesRemaining = Math.max(0, demoMinutesLimit - Math.round(demoMinutesUsed))
  const usagePct = Math.min(100, Math.round((demoMinutesUsed / demoMinutesLimit) * 100))

  if (demoStatus === 'expired' || demoStatus === 'exhausted') {
    const reason =
      demoStatus === 'exhausted'
        ? `${demoMinutesLimit} minutos utilizados`
        : 'Período de 7 dias encerrado'

    return (
      <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-surface-light-card dark:border-surface-dark-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            Demonstração encerrada
          </p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-content-light-secondary/20 dark:bg-content-dark-secondary/20 text-content-light-secondary dark:text-content-dark-secondary">
            Expirou
          </span>
        </div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{reason}</p>
        <Link
          href="/planos"
          className="w-full py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm text-center hover:opacity-90 transition-opacity"
        >
          Assinar agora
        </Link>
      </div>
    )
  }

  const daysRemaining = demoExpiresAt ? getDaysRemaining(demoExpiresAt) : 0

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-brand-interactive/30 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-content-light dark:text-content-dark">
          Demonstração Premium
        </p>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive/10 text-brand-interactive">
          Ativa
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xl font-extrabold text-content-light dark:text-content-dark">
            {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'} restantes
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            de 7 dias
          </p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-content-light dark:text-content-dark">
            {minutesRemaining} min restantes
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            de {demoMinutesLimit} minutos
          </p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
          <span>{Math.round(demoMinutesUsed)} min utilizados</span>
          <span>{usagePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-interactive transition-all duration-300"
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>
      <Link
        href="/planos"
        className="text-xs text-center text-brand-interactive hover:opacity-70 transition-opacity"
      >
        Ver planos →
      </Link>
    </div>
  )
}
