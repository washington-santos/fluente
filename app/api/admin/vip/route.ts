import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

async function verifyAdmin(): Promise<boolean> {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user && adminEmails.includes(user.email ?? '')
}

export async function GET(request: Request) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('q') ?? ''
  const q = raw.replace(/[,%()]/g, '')

  const supabase = createSupabaseAdmin()
  const base = supabase.from('vip_users').select('*').order('created_at', { ascending: false })

  const { data, error } = await (q ? base.ilike('email', `%${q}%`) : base)

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    email?: string
    plan?: string
    notes?: string
  }
  if (!body.email)
    return NextResponse.json({ error: 'email required' }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('vip_users')
    .insert({
      email: body.email.toLowerCase().trim(),
      plan: body.plan ?? 'pro',
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    const status = (error as { code?: string }).code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ data }, { status: 201 })
}
