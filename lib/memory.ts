import Anthropic from '@anthropic-ai/sdk'

export interface MemoryOutput {
  summary: string
  key_topics: string[]
  personal_details: string[]
}

export async function generateSessionMemory(
  messages: Array<{ role: string; text: string }>,
  userName: string,
  cefrLevel: string,
): Promise<MemoryOutput> {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? userName : 'Teacher'}: ${m.text}`)
    .join('\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system:
      'You are an English learning session analyser. ' +
      'From the transcript, extract: a 1-2 sentence summary of what was discussed, ' +
      'key English topics practised (2-5 items), and personal details the student mentioned (0-5 items). ' +
      'Respond ONLY with valid JSON — no markdown:\n' +
      '{"summary":"...","key_topics":["..."],"personal_details":["..."]}',
    messages: [
      {
        role: 'user',
        content: `Student: ${userName} (CEFR ${cefrLevel})\n\nTranscript:\n${transcript}`,
      },
    ],
  })

  const raw = res.content[0]?.type === 'text' ? (res.content[0] as { type: 'text'; text: string }).text : ''

  try {
    const parsed = JSON.parse(raw)
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Session completed.',
      key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
      personal_details: Array.isArray(parsed.personal_details) ? parsed.personal_details : [],
    }
  } catch {
    return {
      summary: 'Session completed.',
      key_topics: [],
      personal_details: [],
    }
  }
}
