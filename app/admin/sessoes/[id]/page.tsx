import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  return `${Math.round(seconds / 60)} min`
}

export default async function AdminSessionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseAdmin()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, started_at, duration_seconds, user:users(name, email), teacher:teachers(name)')
    .eq('id', params.id)
    .single()

  if (!session) redirect('/admin/sessoes')

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, text, audio_url, had_correction')
    .eq('session_id', params.id)
    .order('created_at', { ascending: true })
    .limit(500)

  const u = session.user as unknown as { name: string | null; email: string } | null
  const t = session.teacher as unknown as { name: string } | null

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/sessoes"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70"
        >
          ← Sessões
        </Link>
        <div>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {formatDate(session.started_at)}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {u?.name ?? u?.email ?? '—'} · {t?.name ?? '—'} ·{' '}
            {formatDuration(session.duration_seconds)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {(messages ?? []).map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                m.role === 'user'
                  ? 'bg-brand-cta text-white rounded-br-sm'
                  : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
              }`}
            >
              <p>{m.text}</p>
              {m.had_correction && (
                <span className="block text-xs opacity-70 mt-1">✓ corrigido</span>
              )}
              {m.role === 'assistant' && m.audio_url && (
                <audio
                  controls
                  src={m.audio_url}
                  className="mt-2 w-full h-8"
                  aria-label="Reproduzir resposta"
                />
              )}
            </div>
          </div>
        ))}
        {(messages ?? []).length === 0 && (
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary text-sm py-8">
            Nenhuma mensagem nesta sessão.
          </p>
        )}
      </div>
    </div>
  )
}
