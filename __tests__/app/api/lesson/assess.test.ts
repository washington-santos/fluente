// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockChatCreate = vi.hoisted(() => vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}' } }],
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

vi.mock('ffmpeg-static', () => ({ default: '/fake/path/to/ffmpeg' }))

const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockReadFile = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from('FAKE_WAV_BYTES')))
const mockUnlink = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  unlink: mockUnlink,
}))

const mockSpawn = vi.hoisted(() => vi.fn().mockImplementation(() => {
  const proc = new EventEmitter()
  queueMicrotask(() => proc.emit('close', 0))
  return proc
}))
vi.mock('node:child_process', () => ({ spawn: mockSpawn }))

import { POST } from '@/app/api/lesson/assess/route'

function makeRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/assess', { method: 'POST', body: form })
}

describe('POST /api/lesson/assess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!","phoneme_note_pt":null}' } }],
    })
    mockSpawn.mockImplementation(() => {
      const proc = new EventEmitter()
      queueMicrotask(() => proc.emit('close', 0))
      return proc
    })
  })

  it('scores a pronunciation attempt by sending the transcoded audio directly to the audio model, not Whisper', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.assessment).toBe('correct')
    expect(body.score).toBe(0.9)
    expect(body.phoneme_note_pt).toBe(null)

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const callArgs = mockChatCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4o-mini-audio-preview')
    const content = callArgs.messages[0].content
    const audioPart = content.find((c: { type: string }) => c.type === 'input_audio')
    expect(audioPart.input_audio.format).toBe('wav')
    expect(typeof audioPart.input_audio.data).toBe('string')
  })

  it('returns a phoneme_note_pt when the pronunciation is close', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"close","score":0.55,"feedback_pt":"Quase lá!","phoneme_note_pt":"Você disse thing como \\"ting\\" — o som TH precisa da língua entre os dentes."}' } }],
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'thing', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    const body = await res.json()
    expect(body.assessment).toBe('close')
    expect(body.phoneme_note_pt).toContain('TH')
  })

  it('falls back to a text-only gpt-4o-mini call when no audio is provided (panic text)', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"assessment":"correct","score":0.8,"feedback_pt":"Boa!","phoneme_note_pt":null}' } }],
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', text: 'red' }))
    expect(res.status).toBe(200)
    expect(mockSpawn).not.toHaveBeenCalled()
    const callArgs = mockChatCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4o-mini')
  })

  it('returns 500 when ffmpeg transcoding fails', async () => {
    mockSpawn.mockImplementation(() => {
      const proc = new EventEmitter()
      queueMicrotask(() => proc.emit('close', 1))
      return proc
    })
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(500)
  })

  it('rejects type=conversation — that path moved to /api/conversation', async () => {
    const res = await POST(makeRequest({ type: 'conversation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects an unrecognized type', async () => {
    const res = await POST(makeRequest({ type: 'nonsense', target: 'red' }))
    expect(res.status).toBe(400)
  })

  it('rejects pronunciation requests with neither audio nor text', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red' }))
    expect(res.status).toBe(400)
  })
})
