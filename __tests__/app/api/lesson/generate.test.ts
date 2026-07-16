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
  listening_passage: {
    teacher_script: 'Ana is from Brazil. She lives in São Paulo with her family. Every morning she says hello to her neighbors.',
  },
  listening_questions: [
    {
      vocab_word: 'n/a',
      question_pt: 'De onde a Ana é?',
      correct_answer: 'Brazil',
      choices: ['Brazil', 'Portugal', 'Spain', 'Mexico'],
      explanation_pt: 'Ana is from Brazil — "Ana é do Brasil".',
      fill_blank_sentence: 'Ana is from ___.',
      fill_blank_hint_pt: 'Ana é do Brasil.',
    },
    {
      vocab_word: 'n/a',
      question_pt: 'O que a Ana faz toda manhã?',
      correct_answer: 'She says hello to her neighbors',
      choices: ['She says hello to her neighbors', 'She goes to work', 'She calls her mother', 'She reads the news'],
      explanation_pt: 'Every morning she says hello to her neighbors — "toda manhã ela cumprimenta os vizinhos".',
      fill_blank_sentence: 'Every morning she ___ to her neighbors.',
      fill_blank_hint_pt: 'Toda manhã ela cumprimenta os vizinhos.',
    },
  ],
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
    // 1 grammar exercise + 1 vocab exercise + 2 listening questions (fixture has a single vocabulary item)
    expect(steps.filter(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toHaveLength(4)
    expect(steps.some(s => s.type === 'vocab_repeat')).toBe(true)
    expect(steps.filter(s => s.type === 'guided_convo')).toHaveLength(2)
    expect(steps[steps.length - 1].type).toBe('summary')
    // First lesson ever for this student (no recentSessionSummary/frequentErrors) — no warmup_review step
    expect(steps.some(s => s.type === 'warmup_review')).toBe(false)

    // listening_present + its 2 comprehension questions sit right after vocab_repeat, before the first guided_convo
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    const firstGuidedConvoIndex = steps.findIndex(s => s.type === 'guided_convo')
    expect(steps[vocabRepeatIndex + 1].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 2].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('guided_convo')
    expect(firstGuidedConvoIndex).toBe(vocabRepeatIndex + 4)
  })

  it('truncates listening_questions to exactly 2 when AI returns 3+', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    // Create a fixture with 3 listening questions
    const contentWith3Questions = {
      ...validAiContent,
      listening_questions: [
        validAiContent.listening_questions[0],
        validAiContent.listening_questions[1],
        {
          vocab_word: 'n/a',
          question_pt: 'Terceira pergunta?',
          correct_answer: 'Answer',
          choices: ['Answer', 'Other 1', 'Other 2', 'Other 3'],
          explanation_pt: 'Explicação da terceira pergunta.',
          fill_blank_sentence: 'Test ___.',
          fill_blank_hint_pt: 'Teste.',
        },
      ],
    }

    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(contentWith3Questions) } }] })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'A1' })
    const progressChain = makeChain([])
    const dangling = makeChain(null)
    const insertChain = makeChain({ id: 'session-truncate' })

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
    expect(body.session_id).toBe('session-truncate')

    const insertedRow = insertChain.insert.mock.calls[0][0]
    const steps = insertedRow.lesson_plan_json.steps as Array<{ type: string }>

    // Should still have exactly 4 exercises: 1 grammar + 1 vocab + 2 listening (truncated, not 3)
    expect(steps.filter(s => s.type === 'exercise_choice' || s.type === 'exercise_fill_blank')).toHaveLength(4)

    // Verify exactly 2 listening questions appear in steps
    const vocabRepeatIndex = steps.findIndex(s => s.type === 'vocab_repeat')
    expect(steps[vocabRepeatIndex + 1].type).toBe('listening_present')
    expect(steps[vocabRepeatIndex + 2].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 3].type).toBe('exercise_choice')
    expect(steps[vocabRepeatIndex + 4].type).toBe('guided_convo')
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
    expect(steps.some(s => s.type === 'listening_present')).toBe(true)
  })
})
