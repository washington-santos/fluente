import OpenAI from 'openai'

export async function synthesizeTts(text: string, voice: string): Promise<{ dataUrl: string; buffer: Buffer }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'mp3',
  })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))
  return { dataUrl: `data:audio/mp3;base64,${buffer.toString('base64')}`, buffer }
}
