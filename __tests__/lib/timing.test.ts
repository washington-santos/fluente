import { describe, it, expect, vi } from 'vitest'
import { createStageTimer } from '@/lib/timing'

describe('createStageTimer', () => {
  it('logs total and per-stage durations as structured JSON', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const timer = createStageTimer('test-op')
    timer.mark('stage_a')
    timer.mark('stage_b')
    const total = timer.finish({ extra_field: 'value' })

    expect(typeof total).toBe('number')
    expect(logSpy).toHaveBeenCalledTimes(1)

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.event).toBe('timing')
    expect(logged.label).toBe('test-op')
    expect(logged.stages_ms).toHaveProperty('stage_a')
    expect(logged.stages_ms).toHaveProperty('stage_b')
    expect(logged.extra_field).toBe('value')

    logSpy.mockRestore()
  })

  it('finish works with no marks and no extra', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const timer = createStageTimer('empty-op')
    const total = timer.finish()
    expect(total).toBeGreaterThanOrEqual(0)
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.stages_ms).toEqual({})
    logSpy.mockRestore()
  })
})
