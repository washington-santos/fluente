const DID_API = 'https://api.d-id.com'

export const DID_VOICE_IDS: Record<string, string> = {
  'mrs-carol': 'en-US-JennyNeural',
  'mr-jake': 'en-US-GuyNeural',
  'dr-reynolds': 'en-GB-RyanNeural',
  sofia: 'en-US-SaraNeural',
}

export interface DidTalkResult {
  status: 'done' | 'pending' | 'error'
  resultUrl: string | null
}

function authHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

export async function createDidTalk(
  text: string,
  didVoiceId: string,
  sourceUrl: string,
): Promise<string | null> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return null

  try {
    const createRes = await fetch(`${DID_API}/talks`, {
      method: 'POST',
      headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: sourceUrl,
        script: { type: 'text', input: text, provider: { type: 'microsoft', voice_id: didVoiceId } },
      }),
    })
    if (!createRes.ok) return null

    const body = (await createRes.json()) as { id?: string }
    return body.id ?? null
  } catch {
    return null
  }
}

export async function pollDidTalk(talkId: string): Promise<DidTalkResult> {
  const apiKey = process.env.DID_API_KEY
  if (!apiKey) return { status: 'error', resultUrl: null }

  try {
    const pollRes = await fetch(`${DID_API}/talks/${talkId}`, {
      headers: { Authorization: authHeader(apiKey) },
    })
    if (!pollRes.ok) return { status: 'error', resultUrl: null }

    const talk = (await pollRes.json()) as { status: string; result_url?: string }
    if (talk.status === 'done' && talk.result_url) return { status: 'done', resultUrl: talk.result_url }
    if (talk.status === 'error') return { status: 'error', resultUrl: null }
    return { status: 'pending', resultUrl: null }
  } catch {
    return { status: 'error', resultUrl: null }
  }
}
