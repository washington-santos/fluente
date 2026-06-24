import { describe, it, expect } from 'vitest'
import { scoreMcqs, combineLevels, stepToRoute } from '@/lib/onboarding'

describe('scoreMcqs', () => {
  it('returns A1 for 0 correct', () => {
    expect(scoreMcqs(['wrong', 'wrong', 'wrong', 'wrong', 'wrong'])).toBe('A1')
  })

  it('returns A1 for 1 correct', () => {
    expect(scoreMcqs(['What', 'wrong', 'wrong', 'wrong', 'wrong'])).toBe('A1')
  })

  it('returns A2 for 2 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'wrong', 'wrong', 'wrong'])).toBe('A2')
  })

  it('returns B1 for 3 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'wrong', 'wrong'])).toBe('B1')
  })

  it('returns B2 for 4 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'was completed', 'wrong'])).toBe('B2')
  })

  it('returns C1 for 5 correct', () => {
    expect(scoreMcqs(['What', 'goes', 'had already started', 'was completed', 'would have done'])).toBe('C1')
  })
})

describe('combineLevels', () => {
  it('returns same level when both agree', () => {
    expect(combineLevels('B1', 'B1')).toBe('B1')
  })

  it('averages two adjacent levels — A2 + B1 = B1', () => {
    expect(combineLevels('A2', 'B1')).toBe('B1')
  })

  it('averages two levels two apart — A1 + B1 = A2', () => {
    expect(combineLevels('A1', 'B1')).toBe('A2')
  })

  it('is symmetric', () => {
    expect(combineLevels('B2', 'C1')).toBe(combineLevels('C1', 'B2'))
  })
})

describe('stepToRoute', () => {
  it('step 0 → /cadastro/boas-vindas', () => {
    expect(stepToRoute(0)).toBe('/cadastro/boas-vindas')
  })

  it('step 1 → /cadastro/objetivo', () => {
    expect(stepToRoute(1)).toBe('/cadastro/objetivo')
  })

  it('step 2 → /cadastro/horario', () => {
    expect(stepToRoute(2)).toBe('/cadastro/horario')
  })

  it('step 3 → /cadastro/nivelamento', () => {
    expect(stepToRoute(3)).toBe('/cadastro/nivelamento')
  })

  it('step 4 → /cadastro/conversa', () => {
    expect(stepToRoute(4)).toBe('/cadastro/conversa')
  })

  it('step 5 → /cadastro/professor', () => {
    expect(stepToRoute(5)).toBe('/cadastro/professor')
  })
})
