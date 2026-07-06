// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                cefr_level: 'A2',
                speaking_pct: 55,
                listening_pct: 60,
                grammar_pct: 45,
                vocabulary_pct: 65,
                pronunciation_pct: 40,
                confidence_pct: 50,
                biggest_difficulty: 'Pronúncia do TH',
                biggest_strength: 'Vocabulário básico',
                next_objective: 'Melhorar fluência ao falar',
                focus_areas: ['pronunciation', 'speaking'],
                plan_summary_pt: 'Em 30 dias, focamos em pronúncia e conversação.',
              }),
            },
          }],
        }),
      },
    }
  },
}))

import { POST } from '@/app/api/placement/complete/route'

describe('POST /api/placement/complete', () => {
  it('returns result and plan on success', async () => {
    const body = {
      answers: [
        { question_id: 'l1', phase: 'listening', transcript: 'My name is João', score: 0.8 },
        { question_id: 'p1', phase: 'pronunciation', transcript: 'think three through', score: 0.5 },
      ],
      goal: 'viagem',
    }
    const req = new Request('http://localhost/api/placement/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.result.cefr_level).toBe('A2')
    expect(json.result.speaking_pct).toBe(55)
    expect(json.plan.goal).toBe('viagem')
    expect(json.plan.focus_areas).toContain('pronunciation')
  })
})
