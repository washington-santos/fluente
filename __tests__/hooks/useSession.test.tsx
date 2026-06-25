import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockConvResponse = {
  text: 'Hello!',
  audio_url: 'data:audio/mp3;base64,abc',
  video_url: null,
  had_correction: false,
  error_report: { error_detected: false },
}

global.fetch = vi.fn()

function mockFetchSequence(...responses: object[]) {
  let call = 0
  vi.mocked(fetch).mockImplementation(() => {
    const res = responses[call] ?? responses[responses.length - 1]
    call++
    return Promise.resolve({ ok: true, json: async () => res } as Response)
  })
}

import { useSession } from '@/hooks/useSession'

describe('useSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new session when none exists', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'new-session', teacher: { id: 't1', name: 'Mr. Jake' } }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('new-session')
  })

  it('loads an existing session with messages', async () => {
    mockFetchSequence({
      session: {
        id: 'existing-session',
        teacher: { id: 't1' },
        messages: [{ role: 'user', text: 'Hi', audio_url: null, had_correction: false }],
      },
    })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('existing-session')
    expect(result.current.messages).toHaveLength(1)
  })

  it('sendTurn appends user + assistant messages', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'sess-1', teacher: { id: 't1' } },
      mockConvResponse
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendTurn('Hello') })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[1].role).toBe('assistant')
  })
})
