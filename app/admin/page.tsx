import { createSupabaseAdmin } from '@/lib/supabase-admin'

const USD_TO_BRL = 5.50

function calcAiCost(row: {
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}): number {
  return (
    (row.whisper_minutes ?? 0) * 0.006 * USD_TO_BRL +
    ((row.claude_tokens ?? 0) / 1_000_000) * 3 * USD_TO_BRL +
    ((row.tts_chars ?? 0) / 1_000_000) * 15 * USD_TO_BRL +
    (row.did_credits ?? 0) * 0.1 * USD_TO_BRL
  )
}

export default async function AdminOverviewPage() {
  const supabase = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: sessionsToday },
    { count: totalSessions },
    { data: activeSubs },
    { data: todayUsage },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', today),
    supabase.from('sessions').select('id', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('plan_id, plans(price_brl)')
      .eq('status', 'active'),
    supabase
      .from('usage_log')
      .select('whisper_minutes, tts_chars, claude_tokens, did_credits')
      .eq('date', today),
  ])

  const mrr = (activeSubs ?? []).reduce(
    (sum, s) => sum + ((s.plans as unknown as { price_brl: number } | null)?.price_brl ?? 0),
    0,
  )
  const aiCostToday = (todayUsage ?? []).reduce(
    (sum, row) => sum + calcAiCost(row as { whisper_minutes: number; tts_chars: number; claude_tokens: number; did_credits: number }),
    0,
  )

  const stats = [
    { label: 'Total de usuários', value: String(totalUsers ?? 0) },
    { label: 'Novos hoje', value: String(newUsersToday ?? 0) },
    { label: 'Sessões hoje', value: String(sessionsToday ?? 0) },
    { label: 'Sessões totais', value: String(totalSessions ?? 0) },
    { label: 'MRR estimado', value: `R$ ${mrr.toFixed(2)}` },
    { label: 'Custo de AI hoje', value: `R$ ${aiCostToday.toFixed(2)}` },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-content-light dark:text-content-dark mb-6">
        Visão Geral
      </h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
          >
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1">
              {s.label}
            </p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
