interface StageTimer {
  mark(stage: string): void
  finish(extra?: Record<string, unknown>): number
}

export function createStageTimer(label: string): StageTimer {
  const start = Date.now()
  const stages: Record<string, number> = {}
  let last = start

  return {
    mark(stage: string) {
      const now = Date.now()
      stages[stage] = now - last
      last = now
    },
    finish(extra?: Record<string, unknown>) {
      const total = Date.now() - start
      console.log(JSON.stringify({ event: 'timing', label, total_ms: total, stages_ms: stages, ...extra }))
      return total
    },
  }
}
