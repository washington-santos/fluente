// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { POST } from '@/app/api/lesson/extra-example/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/lesson/extra-example', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  return chain
}

describe('POST /api/lesson/extra-example', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(401)
  })

  it('requires a word', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("generates an extra example using the user's CEFR level", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: 'A2' }))
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            example_sentence_en: 'Hello, how are you today?',
            example_sentence_pt: 'Olá, como você está hoje?',
            explanation_pt: '"Hello" é usado para cumprimentar alguém a qualquer hora do dia.',
          }),
        },
      }],
    })
    const res = await POST(makeRequest({ word: 'hello' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.example_sentence_en).toBe('Hello, how are you today?')
    expect(json.explanation_pt).toContain('cumprimentar')
    expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ content: expect.stringContaining('A2') })],
    }))
  })

  it('falls back to A1 when the user has no cefr_level set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: null }))
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ example_sentence_en: 'x', example_sentence_pt: 'y', explanation_pt: 'z' }) } }],
    })
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(200)
    expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ content: expect.stringContaining('A1') })],
    }))
  })

  it('returns 500 when generation fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue(makeChain({ cefr_level: 'A2' }))
    mockChatCreate.mockRejectedValue(new Error('rate limited'))
    const res = await POST(makeRequest({ word: 'hello' }))
    expect(res.status).toBe(500)
  })
})
