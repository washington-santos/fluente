import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSubscription, type PaidPlan } from '@/lib/mercadopago'

const VALID_PLANS: PaidPlan[] = ['basic', 'pro', 'annual']

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const plan = body?.plan as string | undefined
  if (!plan || !VALID_PLANS.includes(plan as PaidPlan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const sub = await createSubscription({
      planKey: plan as PaidPlan,
      userEmail: user.email!,
      userId: user.id,
      backUrl: `${appUrl}/planos?status=approved`,
    })

    // Record pending subscription — status set to 'active' by webhook after payment
    const daysToAdd = plan === 'annual' ? 365 : 30
    const periodEnd = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan_id: plan,
        status: 'pending',
        mp_subscription_id: sub.id,
        current_period_end: periodEnd,
      },
      { onConflict: 'user_id' },
    )

    if (dbError) {
      console.error('Failed to upsert subscription:', dbError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ url: sub.init_point })
  } catch (err) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
  }
}
