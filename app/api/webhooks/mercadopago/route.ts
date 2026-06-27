import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSubscription, verifyWebhookSignature } from '@/lib/mercadopago'

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function parseSignature(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(',').map((part) => {
      const idx = part.indexOf('=')
      return [part.slice(0, idx).trim(), part.slice(idx + 1)]
    }),
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const type = body?.type as string | undefined
  const dataId = body?.data?.id as string | undefined
  if (!dataId) return NextResponse.json({ ok: true })

  // Verify MP webhook signature
  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''
  if (xSignature) {
    const { ts, v1 } = parseSignature(xSignature)
    if (ts && v1) {
      const valid = verifyWebhookSignature({ requestId: xRequestId, dataId, ts, v1 })
      if (!valid) {
        console.warn('MP webhook: invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }
  }

  if (type !== 'subscription_preapproval') return NextResponse.json({ ok: true })

  try {
    const mpSub = await getSubscription(dataId)
    const userId = mpSub.external_reference
    if (!userId) return NextResponse.json({ ok: true })

    const supabase = createAdmin()

    if (mpSub.status === 'authorized') {
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('mp_subscription_id', dataId)
        .single()

      const planId = subRow?.plan_id ?? 'free'
      const daysToAdd = planId === 'annual' ? 365 : 30
      const periodEnd = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString()

      await Promise.all([
        supabase
          .from('subscriptions')
          .update({ status: 'active', current_period_end: periodEnd })
          .eq('mp_subscription_id', dataId),
        supabase.from('users').update({ plan_id: planId }).eq('id', userId),
      ])
    } else if (mpSub.status === 'cancelled') {
      await Promise.all([
        supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('mp_subscription_id', dataId),
        supabase.from('users').update({ plan_id: 'free' }).eq('id', userId),
      ])
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('MP webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
