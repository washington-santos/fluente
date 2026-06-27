const DID_API = 'https://api.d-id.com'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

export const DID_VOICE_IDS: Record<string, string> = {
  'mrs-carol': 'en-US-JennyNeural',
  'mr-jake': 'en-US-GuyNeural',
  'dr-reynolds': 'en-GB-RyanNeural',
  sofia: 'en-US-SaraNeural',
}

export async function createTalk(
  text: string,
  didVoiceId: string,
  sourceUrl: string
): Promise<string | null> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return null

  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`

  try {
    const createRes = await fetch(`${DID_API}/talks`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: sourceUrl,
        script: {
          type: 'text',
          input: text,
          provider: { type: 'microsoft', voice_id: didVoiceId },
        },
      }),
    })
    if (!createRes.ok) return null

    const body = (await createRes.json()) as { id?: string }
    const id = body.id
    if (!id) return null
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const pollRes = await fetch(`${DID_API}/talks/${id}`, {
        headers: { Authorization: authHeader },
      })
      if (!pollRes.ok) return null
      const talk = (await pollRes.json()) as { status: string; result_url?: string }
      if (talk.status === 'done' && talk.result_url) return talk.result_url
      if (talk.status === 'error') return null
    }

    return null
  } catch {
    return null
  }
}
