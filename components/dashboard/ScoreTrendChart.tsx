interface ScoreTrendChartProps {
  scores: number[]
}

export function ScoreTrendChart({ scores }: ScoreTrendChartProps) {
  if (scores.length < 2) return null

  const width = 300
  const height = 100
  const padding = 10
  const max = 100

  const points = scores.map((s, i) => {
    const x = padding + (i / (scores.length - 1)) * (width - padding * 2)
    const clamped = Math.max(0, Math.min(100, s))
    const y = height - padding - (clamped / max) * (height - padding * 2)
    return { x, y }
  })

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto text-brand-interactive"
      role="img"
      aria-label="Gráfico de evolução do score geral"
    >
      <polyline points={polylinePoints} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-brand-interactive" />
      ))}
    </svg>
  )
}
