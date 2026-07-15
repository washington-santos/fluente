// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/student-context', () => ({
  getStudentContext: vi.fn().mockResolvedValue({
    userId: 'user-1', name: 'Ana', cefrLevel: 'A1', personalContext: [], goal: null,
    focusAreas: [], taughtTopicIds: [], topicsNeedingReview: [], frequentErrors: [],
    recentSessionSummary: null, biggestDifficulty: null, streakDays: 0,
  }),
}))

import { POST } from '@/app/api/lesson/generate/route'

// Chainable + thenable — matches the convention already used in
// __tests__/app/api/session-report.test.ts. Thenable so `await`ing the chain
// directly (no trailing .single()/.maybeSingle(), e.g. the user_topic_progress
// and vocab_log reads below) resolves to { data, error } instead of returning
// the mock chain object itself.
const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

const validAiContent = {
  title_pt: 'Apresentação pessoal',
  objective_pt: 'Você vai aprender a se apresentar em inglês.',
  learning_objectives: [{ id: 'obj-1', description_pt: 'Dizer seu nome', vocab_words: ['name'] }],
  grammar_point: {
    teacher_script: "Today we'll learn the verb 'to be': I am, you are, he is.",
    explanation_pt: 'Use "am/is/are" para dizer quem você é.',
    example_sentence_en: 'I am Ana.',
    example_sentence_pt: 'Eu sou a Ana.',
  },
  grammar_exercise: {
    vocab_word: 'n/a',
    question_pt: 'Como se diz "Eu sou" em inglês?',
    correct_answer: 'I am',
    choices: ['I am', 'I is', 'I are', 'I be'],
    explanation_pt: '"I am" é a forma correta.',
    fill_blank_sentence: '___ Ana.',
    fill_blank_hint_pt: 'Eu sou a Ana.',
  },
  vocabulary: [
    { word: 'name', translation_pt: 'nome', emoji: '📛', pronunciation_hint: 'neym', example_sentence_en: 'My name is Ana.', example_sentence_pt: 'Meu nome é Ana.', teacher_script: "This word is 'name'..." },
  ],
  exercises: [
    { vocab_word: 'name', question_pt: 'Como se diz "nome"?', correct_answer: 'name', choices: ['name', 'age', 'city', 'day'], explanation_pt: '"Name" é "nome".', fill_blank_sentence: 'My ___ is Ana.', fill_blank_hint_pt: 'Meu nome é Ana.' },
  ],
  guided_convo_opening: "What's your name?",
  guided_convo_opening_pt: 'Qual é o seu nome?',
  challenge_opening: 'Tell me all about yourself.',
  challenge_opening_pt: 'Me conte tudo sobre você.',
}

describe('POST /api/lesson/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no teacher assigned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ teacher_id: null, cefr_level: 'A1' })
      return makeChain(null)
    })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('builds a full step sequence and creates a mode:"lesson" session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAiContent) } }] })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-99' })

    // First 'sessions' call closes any dangling open session (update), second inserts the new one
    let sessionsCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return userChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'sessions') {
        sessionsCall++
        return sessionsCall === 1 ? dangling : insertChain
      }
      return makeChain(null)
    })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.session_id).toBe('session-99')

    const insertedRow = insertChain.insert.mock.calls[0][0]
    expect(insertedRow.mode).toBe('lesson')
    expect(insertedRow.lesson_plan_json.title_pt).toBe('Apresentação pessoal')
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string }>
    expect(steps[0].type).toBe('intro')
    expect(steps[1].type).toBe('grammar_present')
    expect(steps[2].type).toBe('exercise_choice')
    expect(steps.some(s => s.type === 'vocab_present')).toBe(true)
    // 1 grammar exercise + 1 vocab exercise (fixture has a single vocabulary item)
    expect(steps.filter(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toHaveLength(2)
    expect(steps.some(s => s.type === 'vocab_repeat')).toBe(true)
    expect(steps.filter(s => s.type === 'guided_convo')).toHaveLength(2)
    expect(steps[steps.length - 1].type).toBe('summary')
    // First lesson ever for this student (no recentSessionSummary/frequentErrors) — no warmup_review step
    expect(steps.some(s => s.type === 'warmup_review')).toBe(false)
  })

  it('falls back to a minimal deterministic lesson when the AI call throws', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockChatCreate.mockRejectedValue(new Error('network down'))

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    let sessionsCall = 0
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-fallback' })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return userChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'sessions') {
        sessionsCall++
        return sessionsCall === 1 ? dangling : insertChain
      }
      return makeChain(null)
    })

    const res = await POST()
    expect(res.status).toBe(200)
    const insertedRow = insertChain.insert.mock.calls[0][0]
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string }>
    expect(steps.length).toBeGreaterThanOrEqual(5)
    expect(steps[0].type).toBe('intro')
    expect(steps[1].type).toBe('grammar_present')
    expect(steps[steps.length - 1].type).toBe('summary')
  })
})
