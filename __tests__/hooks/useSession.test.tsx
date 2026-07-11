import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockConvResponse = {
  message_id: 'assistant-msg-1',
  text: 'Hello!',
  audio_url: null,
  audio_status: 'pending',
  video_url: null,
  video_status: 'skipped',
  had_correction: false,
  error_report: { error_detected: false },
  pronunciation_hint: "Watch your 'th' sound",
  suggested_replies: null,
  reply_pt: null,
  prompt_hint: null,
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
      { session_id: 'new-session', teacher: { id: 't1', name: 'Mr. Jake' }, topic: 'travel' }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('new-session')
    expect(result.current.topic).toBe('travel')
  })

  it('loads topic from existing session', async () => {
    mockFetchSequence({ session: { id: 'existing-session', topic: 'family', teacher: { id: 't1' }, messages: [] } })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.topic).toBe('family')
  })

  it('loads an existing session with messages, defaulting status fields', async () => {
    mockFetchSequence({
      session: {
        id: 'existing-session',
        teacher: { id: 't1' },
        messages: [{ id: 'm1', role: 'user', text: 'Hi', audio_url: null, had_correction: false }],
      },
    })
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionId).toBe('existing-session')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].audio_status).toBe('ready')
    expect(result.current.messages[0].video_status).toBe('skipped')
  })

  it('sendTurn appends user + assistant messages and resolves without waiting for audio/video', async () => {
    mockFetchSequence(
      { session: null },
      { session_id: 'sess-1', teacher: { id: 't1' } },
      mockConvResponse,
      { audio_url: 'https://cdn.example.com/audio.mp3', audio_status: 'ready' }, // fetchAudio background call
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendTurn('Hello') })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].pronunciation_hint).toBe("Watch your 'th' sound")
    expect(result.current.messages[1].audio_status).toBe('pending')

    await waitFor(() => expect(result.current.messages[1].audio_status).toBe('ready'))
    expect(result.current.messages[1].audio_url).toBe('https://cdn.example.com/audio.mp3')
  })

  it('calls finalize after endSession succeeds', async () => {
    mockFetchSequence(
      { session: { id: 's1', messages: [] } },
      { ok: true },
      { ok: true }
    )
    const { result } = renderHook(() => useSession('teacher-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.endSession() })

    expect(global.fetch).toHaveBeenCalledTimes(3)
    const calls = (global.fetch as any).mock.calls
    expect(calls[2][0]).toContain('/finalize')
    expect(calls[2][1]?.method).toBe('POST')
  })

  describe('audio fetch/retry', () => {
    it('sets audio_status to failed when the audio fetch response is not ok', async () => {
      // Explicit call-by-call queue (rather than mockFetchSequence) so ordering is unambiguous:
      // GET session -> POST session -> POST conversation -> POST audio (background, non-ok).
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session: null }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 'sess-1', teacher: { id: 't1' } }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockConvResponse } as Response)
      // Session expired mid-turn (401) with no audio_status field in the body — must not be trusted.
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) } as Response)

      const { result } = renderHook(() => useSession('teacher-1'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => { await result.current.sendTurn('Hello') })

      expect(result.current.messages[1].audio_status).toBe('pending')
      await waitFor(() => expect(result.current.messages[1].audio_status).toBe('failed'))
    })

    it('retryAudio patches the message back to pending and re-fetches audio', async () => {
      mockFetchSequence(
        { session: { id: 'sess-1', messages: [{ id: 'm2', role: 'assistant', text: 'Hi', audio_url: null, audio_status: 'failed', had_correction: false }] } },
      )
      const { result } = renderHook(() => useSession('teacher-1'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.messages[0].audio_status).toBe('failed')

      vi.mocked(fetch).mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: async () => ({ audio_url: 'https://cdn.example.com/retry.mp3', audio_status: 'ready' }) } as Response)
      )

      await act(async () => { result.current.retryAudio('m2') })

      const retryCall = (global.fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/conversation/audio')
      expect(retryCall).toBeTruthy()
      expect(JSON.parse(retryCall[1].body)).toEqual({ message_id: 'm2' })

      await waitFor(() => expect(result.current.messages[0].audio_status).toBe('ready'))
      expect(result.current.messages[0].audio_url).toBe('https://cdn.example.com/retry.mp3')
    })
  })

  describe('quota detection', () => {
    it('sets quotaExceeded=true and stores quotaInfo when conversation returns 429', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session: { id: 'sess-1', messages: [] } }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false, status: 429,
        json: async () => ({ error: 'quota_exceeded', minutesUsed: 10.5, minutesLimit: 10 }),
      } as unknown as Response)

      const { result } = renderHook(() => useSession('teacher-1'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => { await result.current.sendTurn('Hello') })

      expect(result.current.quotaExceeded).toBe(true)
      expect(result.current.quotaInfo).toEqual({ minutesUsed: 10.5, minutesLimit: 10 })
      expect(result.current.turnError).toBeNull()
    })

    it('does not set quotaExceeded for non-429 errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ session: { id: 'sess-2', messages: [] } }) } as Response)
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'internal' }) } as unknown as Response)

      const { result } = renderHook(() => useSession('teacher-2'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => { await result.current.sendTurn('Hello') })

      expect(result.current.quotaExceeded).toBe(false)
      expect(result.current.quotaInfo).toBeNull()
      expect(result.current.turnError).toBe('Erro ao enviar. Tente novamente.')
    })
  })
})
