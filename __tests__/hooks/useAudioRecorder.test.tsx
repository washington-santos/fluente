import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockOnComplete = vi.fn()

const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as ((e: any) => void) | null,
  onstop: null as (() => void) | null,
  mimeType: 'audio/webm',
  state: 'inactive',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => mockMediaRecorder))
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  })
})

import { useAudioRecorder } from '@/hooks/useAudioRecorder'

describe('useAudioRecorder', () => {
  it('starts recording when startRecording is called', async () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    expect(result.current.isRecording).toBe(true)
    expect(mockMediaRecorder.start).toHaveBeenCalled()
  })

  it('is not recording initially', () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    expect(result.current.isRecording).toBe(false)
  })

  it('sets error when getUserMedia fails', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
    })
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    expect(result.current.error).toBeTruthy()
    expect(result.current.isRecording).toBe(false)
  })

  it('calls onComplete when stopRecording is invoked', async () => {
    const { result } = renderHook(() => useAudioRecorder({ onComplete: mockOnComplete }))
    await act(async () => { await result.current.startRecording() })
    act(() => {
      mockMediaRecorder.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) })
    })
    act(() => {
      result.current.stopRecording()
      mockMediaRecorder.onstop?.()
    })
    expect(mockOnComplete).toHaveBeenCalledWith(expect.any(Blob))
  })
})
