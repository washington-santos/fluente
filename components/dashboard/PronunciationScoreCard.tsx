import { Mic, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  currentScore: number
  trend: 'up' | 'down' | 'flat' | null
}

const TREND_CONFIG = {
  up: { Icon: TrendingUp, color: 'text-green-500' },
  down: { Icon: TrendingDown, color: 'text-red-400' },
  flat: { Icon: Minus, color: 'text-content-light-secondary dark:text-content-dark-secondary' },
} as const

export function PronunciationScoreCard({ currentScore, trend }: Props) {
  const trendInfo = trend ? TREND_CONFIG[trend] : null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex items-center gap-3">
      <Mic size={20} className="text-amber-500 shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Pronúncia
        </p>
        <div className="flex items-center gap-1.5">
          <p className="text-2xl font-bold text-content-light dark:text-content-dark">{currentScore}%</p>
          {trendInfo && (
            <trendInfo.Icon size={16} className={trendInfo.color} data-testid={`trend-${trend}`} />
          )}
        </div>
      </div>
    </div>
  )
}
