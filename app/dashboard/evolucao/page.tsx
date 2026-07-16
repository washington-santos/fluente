import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScoreTrendChart } from '@/components/dashboard/ScoreTrendChart'
import { getPronunciationTrend, rankCompetencies, COMPETENCY_LABELS_PT } from '@/lib/mastery'
import type { CompetencyScores } from '@/lib/mastery'

export default async function EvolucaoPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('topic_assessments')
    .select('speaking, listening, pronunciation, vocabulary, grammar, confidence, fluency, final_score, assessed_at')
    .eq('user_id', user.id)
    .order('assessed_at', { ascending: false })
    .limit(10)

  const assessments = (rows ?? []) as Array<Partial<CompetencyScores> & { final_score: number; assessed_at: string }>
  const overallTrend = getPronunciationTrend(assessments.map(a => a.final_score))
  const ranked = rankCompetencies(assessments)
  const chronologicalScores = [...assessments].reverse().map(a => a.final_score)

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
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Sua evolução</h1>

        {assessments.length === 0 ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Ainda não há avaliações suficientes. Continue praticando!
          </p>
        ) : (
          <>
            <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
                  Score geral
                </p>
                {overallTrend && (
                  <p className="text-2xl font-bold text-content-light dark:text-content-dark">
                    {overallTrend.currentScore}%
                  </p>
                )}
              </div>
              <ScoreTrendChart scores={chronologicalScores} />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
                Competências
              </p>
              {ranked.map((c, i) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
                >
                  <p className="text-sm text-content-light dark:text-content-dark">{COMPETENCY_LABELS_PT[c.key]}</p>
                  <p
                    className={`text-sm font-bold ${
                      i === 0
                        ? 'text-green-500'
                        : i === ranked.length - 1
                        ? 'text-amber-400'
                        : 'text-content-light dark:text-content-dark'
                    }`}
                  >
                    {Math.round(c.avg)}%
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
