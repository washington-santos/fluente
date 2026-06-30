import { createSupabaseAdmin } from '@/lib/supabase-admin'

const USD_TO_BRL = 5.5

interface UsageRow {
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}

interface CostBreakdown {
  whisper: number
  claude: number
  tts: number
  did: number
  total: number
}

function calcCost(row: UsageRow): CostBreakdown {
  const whisper = (row.whisper_minutes ?? 0) * 0.006 * USD_TO_BRL
  const claude = ((row.claude_tokens ?? 0) / 1_000_000) * 3 * USD_TO_BRL
  const tts = ((row.tts_chars ?? 0) / 1_000_000) * 15 * USD_TO_BRL
  const did = (row.did_credits ?? 0) * 0.1 * USD_TO_BRL
  return { whisper, claude, tts, did, total: whisper + claude + tts + did }
}

export default async function AdminCustosPage() {
  const supabase = createSupabaseAdmin()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: rows } = await supabase
    .from('usage_log')
    .select('date, whisper_minutes, tts_chars, claude_tokens, did_credits')
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: false })

  // Aggregate by date (multiple users may have rows for the same date)
  const byDate = new Map<string, UsageRow>()
  for (const row of rows ?? []) {
    const existing = byDate.get(row.date) ?? {
      whisper_minutes: 0,
      tts_chars: 0,
      claude_tokens: 0,
      did_credits: 0,
    }
    byDate.set(row.date, {
      whisper_minutes: existing.whisper_minutes + (row.whisper_minutes ?? 0),
      tts_chars: existing.tts_chars + (row.tts_chars ?? 0),
      claude_tokens: existing.claude_tokens + (row.claude_tokens ?? 0),
      did_credits: existing.did_credits + (row.did_credits ?? 0),
    })
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  )

  const totals = sorted.reduce(
    (acc, [, r]) => {
      const c = calcCost(r)
      return {
        total: acc.total + c.total,
      }
    },
    { total: 0 },
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-content-light dark:text-content-dark mb-6">
        Custos de AI — últimos 30 dias
      </h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-surface-light-card dark:border-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary">
              <th className="pb-2 pr-4 font-medium">Data</th>
              <th className="pb-2 pr-4 font-medium">Whisper (min)</th>
              <th className="pb-2 pr-4 font-medium">TTS (chars)</th>
              <th className="pb-2 pr-4 font-medium">Claude (tokens)</th>
              <th className="pb-2 pr-4 font-medium">D-ID (créditos)</th>
              <th className="pb-2 font-medium">Custo (R$)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([date, row]) => {
              const cost = calcCost(row)
              return (
                <tr
                  key={date}
                  className="border-b border-surface-light-card dark:border-surface-dark-card"
                >
                  <td className="py-2 pr-4 text-content-light dark:text-content-dark">
                    {date}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.whisper_minutes.toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.tts_chars.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.claude_tokens.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-4 text-content-light-secondary dark:text-content-dark-secondary">
                    {row.did_credits}
                  </td>
                  <td className="py-2 font-semibold text-content-light dark:text-content-dark">
                    R$ {cost.total.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-light-card dark:border-surface-dark-card font-bold">
              <td className="pt-2 pr-4 text-content-light dark:text-content-dark" colSpan={5}>
                Total
              </td>
              <td className="pt-2 text-content-light dark:text-content-dark">
                R$ {totals.total.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
        {sorted.length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary py-8 text-sm">
            Nenhum dado de uso ainda.
          </p>
        )}
      </div>
    </div>
  )
}
