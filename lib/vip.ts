import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import type { VipUser } from '@/types'

/**
 * Returns the VipUser record if the email is in vip_users and active=true.
 * Returns null if not VIP, not active, or on DB error.
 * Uses service role — safe to call from any server-side context.
 */
export async function isUserVip(email: string): Promise<VipUser | null> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('vip_users')
    .select('*')
    .eq('email', email)
    .eq('active', true)
    .maybeSingle()

  if (error || !data || !data.active) return null
  return data as VipUser
}
