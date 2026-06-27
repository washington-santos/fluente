import crypto from 'crypto'

const MP_API = 'https://api.mercadopago.com'

export type PaidPlan = 'basic' | 'pro' | 'annual'

const PLAN_CONFIG: Record<PaidPlan, { amount: number; frequency: number; reason: string }> = {
  basic:  { amount: 39.90,  frequency: 1,  reason: 'English Fluent – Plano Básico' },
  pro:    { amount: 79.90,  frequency: 1,  reason: 'English Fluent – Plano Pro' },
  annual: { amount: 599.90, frequency: 12, reason: 'English Fluent – Plano Anual' },
}

export interface MpPreapproval {
  id: string
  status: string
  init_point: string
  external_reference: string
  payer_email?: string
}

export async function createSubscription(params: {
  planKey: PaidPlan
  userEmail: string
  userId: string
  backUrl: string
}): Promise<MpPreapproval> {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured')

  const config = PLAN_CONFIG[params.planKey]

  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: config.reason,
      external_reference: params.userId,
      payer_email: params.userEmail,
      auto_recurring: {
        frequency: config.frequency,
        frequency_type: 'months',
        transaction_amount: config.amount,
        currency_id: 'BRL',
      },
      back_url: params.backUrl,
      status: 'pending',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Mercado Pago preapproval failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<MpPreapproval>
}

export async function getSubscription(subscriptionId: string): Promise<MpPreapproval> {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured')

  const res = await fetch(`${MP_API}/preapproval/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Mercado Pago getSubscription failed (${res.status})`)
  return res.json() as Promise<MpPreapproval>
}

// Signature: "ts=...,v1=..." from x-signature header
export function verifyWebhookSignature(params: {
  requestId: string
  dataId: string
  ts: string
  v1: string
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return false

  const template = `id:${params.dataId};request-id:${params.requestId};ts:${params.ts};`
  const expected = crypto.createHmac('sha256', secret).update(template).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(params.v1, 'hex'))
  } catch {
    return false
  }
}
