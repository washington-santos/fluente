import OpenAI from 'openai'

export async function synthesizeTts(text: string, voice: string, speed = 1.0): Promise<{ dataUrl: string; buffer: Buffer }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'mp3',
    speed,
  })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))
  return { dataUrl: `data:audio/mp3;base64,${buffer.toString('base64')}`, buffer }
}

export async function synthesizeTtsWithRetry(
  text: string,
  voice: string,
  maxAttempts = 3,
): Promise<{ dataUrl: string; buffer: Buffer }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await synthesizeTts(text, voice)
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150))
      }
    }
  }
  throw lastError
}
