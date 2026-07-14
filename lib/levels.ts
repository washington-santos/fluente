import type { CefrLevel } from '@/types'

export const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function levelBelow(level: CefrLevel): CefrLevel | null {
  const idx = CEFR_ORDER.indexOf(level)
  return idx > 0 ? CEFR_ORDER[idx - 1] : null
}

export function isAtOrBelow(candidate: CefrLevel, ceiling: CefrLevel): boolean {
  return CEFR_ORDER.indexOf(candidate) <= CEFR_ORDER.indexOf(ceiling)
}
