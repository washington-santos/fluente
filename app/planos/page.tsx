import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

const PLANS = [
  {
    key: 'free',
    name: 'Grátis',
    price: 'R$ 0',
    period: 'para sempre',
    minutes: '10 min por mês',
    features: [
      '10 minutos de conversação por mês',
      'Correção de erros em tempo real',
      '1 professor disponível',
      'Histórico de aulas',
    ],
    cta: 'Plano atual',
    highlight: false,
    payable: false,
  },
  {
    key: 'basico',
    name: 'Básico',
    price: 'R$ 39,90',
    period: 'por mês',
    minutes: '120 min por mês',
    features: [
      '120 minutos de conversação por mês',
      'Correção de erros em tempo real',
      '4 professores disponíveis',
      'Histórico e replay de aulas',
      'Memória entre sessões',
    ],
    cta: 'Assinar Básico',
    highlight: false,
    payable: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 'R$ 79,90',
    period: 'por mês',
    minutes: '300 min por mês',
    features: [
      '300 minutos de conversação por mês',
      'Correção de erros em tempo real',
      '4 professores disponíveis',
      'Histórico e replay de aulas',
      'Memória entre sessões',
      'Relatório de progresso mensal',
    ],
    cta: 'Assinar Pro',
    highlight: true,
    payable: true,
  },
  {
    key: 'anual',
    name: 'Anual',
    price: 'R$ 599,90',
    period: 'por ano',
    minutes: '300 min/mês · 2 meses grátis',
    features: [
      '300 minutos de conversação por mês',
      'Correção de erros em tempo real',
      '4 professores disponíveis',
      'Histórico e replay de aulas',
      'Memória entre sessões',
      'Relatório de progresso mensal',
      'Prioridade no suporte',
    ],
    cta: 'Assinar Anual',
    highlight: false,
    payable: true,
  },
]

export default async function PlanosPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  const currentPlan = (userData?.plan as string | null) ?? 'free'

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
        <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary mb-8">
          Escolha o plano ideal para o seu ritmo de aprendizado.
        </p>

        <div className="flex flex-col gap-4">
          {PLANS.map((p) => {
            const isCurrent = currentPlan === p.key

            return (
              <div
                key={p.key}
                className={`rounded-xl p-5 flex flex-col gap-4 ${
                  p.highlight
                    ? 'bg-brand-cta ring-2 ring-brand-cta'
                    : 'bg-surface-light-card dark:bg-surface-dark-card'
                } ${isCurrent ? 'ring-2 ring-brand-interactive' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-lg ${p.highlight ? 'text-white' : 'text-content-light dark:text-content-dark'}`}>
                        {p.name}
                      </p>
                      {isCurrent && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-interactive text-white">
                          atual
                        </span>
                      )}
                      {p.highlight && !isCurrent && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                          popular
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${p.highlight ? 'text-white/80' : 'text-content-light-secondary dark:text-content-dark-secondary'}`}>
                      {p.minutes}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-xl ${p.highlight ? 'text-white' : 'text-content-light dark:text-content-dark'}`}>
                      {p.price}
                    </p>
                    <p className={`text-xs ${p.highlight ? 'text-white/80' : 'text-content-light-secondary dark:text-content-dark-secondary'}`}>
                      {p.period}
                    </p>
                  </div>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <svg
                        className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-white' : 'text-brand-cta'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className={`text-sm ${p.highlight ? 'text-white/90' : 'text-content-light-secondary dark:text-content-dark-secondary'}`}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {p.payable && !isCurrent && (
                  <button
                    disabled
                    className={`py-3 rounded-lg font-semibold text-sm transition-opacity ${
                      p.highlight
                        ? 'bg-white text-brand-cta hover:opacity-90'
                        : 'bg-brand-cta text-white hover:opacity-90'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Integração com Mercado Pago em breve"
                  >
                    {p.cta} · Em breve
                  </button>
                )}

                {isCurrent && (
                  <p className={`text-center text-xs font-semibold ${p.highlight ? 'text-white/80' : 'text-content-light-secondary dark:text-content-dark-secondary'}`}>
                    Plano ativo
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-content-light-secondary dark:text-content-dark-secondary mt-8">
          Pagamento seguro via Mercado Pago · Cancele quando quiser
        </p>
      </div>
    </main>
  )
}
