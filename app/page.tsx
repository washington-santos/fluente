import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

const TEACHERS = [
  {
    initials: 'MC',
    name: 'Mrs. Carol',
    level: 'A1 – A2',
    origin: 'Americana · Sotaque neutro',
    desc: 'Paciente e encorajadora. Ideal para quem está começando do zero.',
    bg: 'bg-brand-interactive',
  },
  {
    initials: 'MJ',
    name: 'Mr. Jake',
    level: 'B1 – B2',
    origin: 'Californiano · Informal',
    desc: 'Descontraído e direto. Foco em conversação do dia a dia.',
    bg: 'bg-brand-cta',
  },
  {
    initials: 'DR',
    name: 'Dr. Reynolds',
    level: 'B2 – C1',
    origin: 'Britânico · Formal',
    desc: 'Vocabulário avançado e gramática precisa. Para quem quer excelência.',
    bg: 'bg-brand-primary',
  },
  {
    initials: 'S',
    name: 'Sofia',
    level: 'B1 – C1',
    origin: 'Americana · Enérgica',
    desc: 'Motivadora e dinâmica. Ótima para ganhar confiança e fluência.',
    bg: 'bg-brand-streak',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Grave sua voz',
    desc: 'Segure o botão e fale em inglês. Não precisa ser perfeito — comece.',
  },
  {
    n: '2',
    title: 'Professor responde',
    desc: 'Seu professor de IA responde em voz real, corrige erros na hora.',
  },
  {
    n: '3',
    title: 'Você evolui',
    desc: 'Cada sessão é registrada. O professor lembra de você e adapta o ensino.',
  },
]

const PLANS = [
  {
    name: 'Demo',
    price: 'R$ 0',
    period: '',
    detail: '7 dias grátis · 30 min',
    cta: 'Começar grátis',
    highlight: false,
    badge: null,
  },
  {
    name: 'Básico',
    price: 'R$ 39,90',
    period: '/mês',
    detail: '120 min por mês',
    cta: 'Assinar Básico',
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro',
    price: 'R$ 79,90',
    period: '/mês',
    detail: '300 min por mês',
    cta: 'Assinar Pro',
    highlight: true,
    badge: 'Mais Popular',
  },
  {
    name: 'Anual',
    price: 'R$ 599,90',
    period: '/ano',
    detail: '300 min/mês · 2 meses grátis',
    cta: 'Assinar Anual',
    highlight: false,
    badge: 'Melhor Valor',
  },
]

export default async function LandingPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-10 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur border-b border-surface-light-card dark:border-surface-dark-card">
        <div className="flex items-center justify-between px-6 py-3 max-w-5xl mx-auto">
          <span className="font-bold text-lg text-brand-interactive">English Fluent</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
            >
              Entrar
            </Link>
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-lg bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="px-6 py-20 max-w-5xl mx-auto text-center">
        <p className="text-sm font-semibold text-brand-interactive uppercase tracking-wide mb-4">
          Inglês por conversação com IA
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-content-light dark:text-content-dark leading-tight">
          Fale inglês de verdade.
          <br />
          <span className="text-brand-cta">Sem vergonha. Sem julgamento.</span>
        </h1>
        <p className="mt-5 text-lg text-content-light-secondary dark:text-content-dark-secondary max-w-xl mx-auto">
          Aulas de conversação 24h por dia com professores de IA que corrigem seus erros em tempo real e lembram do seu histórico.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="px-8 py-4 rounded-xl bg-brand-cta text-white font-bold text-lg hover:opacity-90 transition-opacity"
          >
            Começar grátis agora
          </Link>
          <Link
            href="#como-funciona"
            className="px-8 py-4 rounded-xl border border-surface-light-card dark:border-surface-dark-card text-content-light dark:text-content-dark font-semibold text-lg hover:opacity-70 transition-opacity"
          >
            Como funciona
          </Link>
        </div>
        <p className="mt-4 text-xs text-content-light-secondary dark:text-content-dark-secondary">
          7 dias grátis · Sem cartão de crédito
        </p>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="como-funciona" className="px-6 py-16 bg-surface-light-card dark:bg-surface-dark-card">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-content-light dark:text-content-dark text-center mb-10">
            Como funciona
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="p-6 rounded-xl bg-surface-light dark:bg-surface-dark text-center"
              >
                <div className="w-11 h-11 rounded-full bg-brand-cta text-white font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-content-light dark:text-content-dark mb-2">
                  {s.title}
                </h3>
                <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEACHERS ── */}
      <section id="professores" className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-content-light dark:text-content-dark text-center mb-2">
          Seus professores
        </h2>
        <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary mb-10">
          Cada professor é especializado em um nível. O sistema atribui o ideal para você.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TEACHERS.map((t) => (
            <div
              key={t.name}
              className="p-5 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col items-center text-center"
            >
              <div
                className={`w-14 h-14 rounded-full ${t.bg} text-white font-bold text-xl flex items-center justify-center mb-3 shrink-0`}
              >
                {t.initials}
              </div>
              <p className="font-bold text-sm text-content-light dark:text-content-dark">
                {t.name}
              </p>
              <p className="text-xs text-brand-interactive font-medium mt-0.5">{t.level}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {t.origin}
              </p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-2 leading-snug">
                {t.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="planos" className="px-6 py-16 bg-surface-light-card dark:bg-surface-dark-card">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-content-light dark:text-content-dark text-center mb-2">
            Escolha como você quer evoluir
          </h2>
          <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary mb-10">
            Comece com 7 dias grátis. Cancele quando quiser.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`p-5 rounded-xl flex flex-col gap-4 relative ${
                  p.highlight
                    ? 'bg-brand-cta ring-2 ring-brand-cta'
                    : p.badge
                    ? 'bg-surface-light dark:bg-surface-dark border border-brand-interactive/40'
                    : 'bg-surface-light dark:bg-surface-dark'
                }`}
              >
                {p.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-0.5 rounded-full ${
                    p.highlight ? 'bg-white text-brand-cta' : 'bg-brand-interactive text-content-dark'
                  }`}>
                    {p.badge}
                  </span>
                )}
                <div>
                  <p
                    className={`font-bold text-lg ${
                      p.highlight ? 'text-white' : 'text-content-light dark:text-content-dark'
                    }`}
                  >
                    {p.name}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      p.highlight
                        ? 'text-white/80'
                        : 'text-content-light-secondary dark:text-content-dark-secondary'
                    }`}
                  >
                    {p.detail}
                  </p>
                </div>
                <div>
                  <span
                    className={`text-2xl font-bold ${
                      p.highlight ? 'text-white' : 'text-content-light dark:text-content-dark'
                    }`}
                  >
                    {p.price}
                  </span>
                  <span
                    className={`text-xs ml-1 ${
                      p.highlight
                        ? 'text-white/80'
                        : 'text-content-light-secondary dark:text-content-dark-secondary'
                    }`}
                  >
                    {p.period}
                  </span>
                </div>
                <Link
                  href="/login"
                  className={`mt-auto text-center text-sm font-semibold py-2.5 px-4 rounded-lg transition-opacity hover:opacity-90 ${
                    p.highlight
                      ? 'bg-white text-brand-cta'
                      : 'bg-brand-cta text-white'
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 py-10 text-center border-t border-surface-light-card dark:border-surface-dark-card">
        <p className="font-bold text-brand-interactive mb-2">English Fluent</p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          Feito para brasileiros aprenderem inglês de verdade · © 2026
        </p>
      </footer>

    </main>
  )
}
