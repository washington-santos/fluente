export type PortugueseTier = 'full' | 'reduced' | 'minimal'

export function getPortugueseTier(cefrLevel: string): PortugueseTier {
  if (cefrLevel === 'A1' || cefrLevel === 'A2') return 'full'
  if (cefrLevel === 'B1' || cefrLevel === 'B2') return 'reduced'
  return 'minimal'
}
