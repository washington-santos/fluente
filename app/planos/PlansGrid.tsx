'use client'

import { motion } from 'framer-motion'
import { PlanCheckoutButton } from './PlanCheckoutButton'
import { DemoStartButton } from './DemoStartButton'
import type { DemoStatus } from '@/types'

interface PlansGridProps {
  currentPlanId: string | null
  demoStatus: DemoStatus | null
  hasActiveSubscription: boolean
  subscriptionEndDate: string | null
  demoEnded: boolean
}

const DEMO_FEATURES = [
  'Todos os professores liberados',
  'Teste de nivelamento por IA',
  'Plano de estudos personalizado',
  'Memória entre sessões',
  'Replay das aulas',
  'Dashboard completo',
  'Relatórios de evolução',
  'Avaliação de pronúncia',
  'Correções em tempo real',
]

const BASIC_FEATURES = [
  'Plano de estudos personalizado',
  '4 professores especializados',
  'Correções em tempo real',
  'Histórico completo',
  'Replay das aulas',
  'Memória entre sessões',
  'Revisão inteligente',
]

const PRO_FEATURES = [
  'Tudo do Básico',
  'Relatórios completos',
  'Avaliação de pronúncia',
  'Missões diárias personalizadas',
  'Plano adaptado automaticamente pela IA',
  'Trilhas especiais',
]

const ANNUAL_FEATURES = [
  'Tudo do Pro',
  '2 meses grátis',
  'Maior economia',
  'Prioridade no suporte',
  'Acesso antecipado às novidades',
]

function CheckIcon({ highlight }: { highlight?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 mt-0.5 shrink-0 ${highlight ? 'text-white' : 'text-brand-cta'}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function FeatureList({ features, highlight }: { features: string[]; highlight?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2.5">
          <CheckIcon highlight={highlight} />
          <span
            className={`text-sm leading-snug ${
              highlight
                ? 'text-white/90'
                : 'text-content-light-secondary dark:text-content-dark-secondary'
            }`}
          >
            {f}
          </span>
        </li>
      ))}
    </ul>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08 },
  }),
}

export function PlansGrid({
  currentPlanId,
  demoStatus,
  hasActiveSubscription,
  subscriptionEndDate,
  demoEnded,
}: PlansGridProps) {
  return (
    <div className="flex flex-col gap-6">
      {demoEnded && (
        <div className="p-4 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-center">
          <p className="font-semibold text-content-light dark:text-content-dark text-sm">
            Sua demonstração terminou.
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
            Assine um plano para continuar praticando e manter seu progresso.
          </p>
        </div>
      )}

      {hasActiveSubscription && subscriptionEndDate && (
        <div className="p-3 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-sm text-content-light dark:text-content-dark text-center">
          Assinatura ativa até{' '}
          <span className="font-semibold">
            {new Date(subscriptionEndDate).toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}

      {/* ── Demo card ── */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="rounded-2xl border border-surface-light-card dark:border-surface-dark-card bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-content-light-secondary dark:text-content-dark-secondary mb-2">
            Demonstração Premium
          </p>
          <p className="text-2xl font-extrabold text-content-light dark:text-content-dark leading-tight">
            Experimente gratuitamente
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            7 dias com acesso completo à experiência Premium. Recomendamos ~20 min por dia.
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 0</span>
          <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
            / 7 dias
          </span>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={DEMO_FEATURES} />
        <DemoStartButton demoStatus={demoStatus} />
      </motion.div>

      {/* ── Basic card ── */}
      <motion.div
        custom={1}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className={`rounded-2xl border bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5 ${
          currentPlanId === 'basic'
            ? 'border-brand-interactive'
            : 'border-surface-light-card dark:border-surface-dark-card'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-content-light dark:text-content-dark">Básico</p>
            {currentPlanId === 'basic' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive text-content-dark">
                atual
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            Crie uma rotina consistente.
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            Ideal para quem deseja estudar aproximadamente 10 minutos por dia.
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 39,90</span>
          <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">/mês</span>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={BASIC_FEATURES} />
        {currentPlanId !== 'basic' ? (
          <PlanCheckoutButton plan="basic" label="Começar agora" />
        ) : (
          <p className="text-center text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary">
            Plano ativo
          </p>
        )}
      </motion.div>

      {/* ── Pro card (highlighted) ── */}
      <motion.div
        custom={2}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="relative rounded-2xl bg-brand-cta p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-white text-brand-cta text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
            Mais Popular
          </span>
        </div>
        <div className="mt-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-white">Pro</p>
            {currentPlanId === 'pro' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                atual
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white">Acelere sua fluência.</p>
          <p className="text-sm text-white/80 mt-0.5">
            Ideal para quem deseja estudar aproximadamente 20 a 30 minutos por dia e evoluir mais rapidamente.
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold text-white">R$ 79,90</span>
          <span className="text-sm text-white/80">/mês</span>
        </div>
        <div className="border-t border-white/20" />
        <FeatureList features={PRO_FEATURES} highlight />
        {currentPlanId !== 'pro' ? (
          <PlanCheckoutButton plan="pro" label="Quero evoluir mais rápido" highlight />
        ) : (
          <p className="text-center text-xs font-semibold text-white/80">Plano ativo</p>
        )}
      </motion.div>

      {/* ── Annual card ── */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className={`relative rounded-2xl border bg-surface-light-card dark:bg-surface-dark-card p-6 flex flex-col gap-5 transition-transform duration-200 hover:-translate-y-0.5 ${
          currentPlanId === 'annual' ? 'border-brand-interactive' : 'border-brand-interactive/40'
        }`}
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-interactive text-content-dark text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
            Melhor Valor
          </span>
        </div>
        <div className="mt-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xl font-extrabold text-content-light dark:text-content-dark">Anual</p>
            {currentPlanId === 'annual' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive text-content-dark">
                atual
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            Sua jornada completa rumo à fluência.
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            A melhor opção para quem deseja manter uma rotina consistente durante todo o ano com todos os recursos Premium.
          </p>
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold text-content-light dark:text-content-dark">R$ 599,90</span>
            <span className="text-sm text-content-light-secondary dark:text-content-dark-secondary">/ano</span>
          </div>
          <p className="text-xs text-brand-interactive font-semibold mt-1">
            ≈ R$ 49,99/mês · 2 meses grátis
          </p>
        </div>
        <div className="border-t border-surface-light dark:border-surface-dark" />
        <FeatureList features={ANNUAL_FEATURES} />
        {currentPlanId !== 'annual' ? (
          <PlanCheckoutButton plan="annual" label="Economizar no anual" />
        ) : (
          <p className="text-center text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary">
            Plano ativo
          </p>
        )}
      </motion.div>
    </div>
  )
}
