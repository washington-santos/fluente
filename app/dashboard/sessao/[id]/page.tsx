import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

export default async function SessionReplayPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, started_at, duration_seconds, ended_at')
    .eq('id', params.id)
    .eq('user_id', authUser.id)
    .single()

  if (!session) redirect('/dashboard')

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, text, audio_url, had_correction')
    .eq('session_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-content-light-secondary dark:text-content-dark-secondary text-sm hover:opacity-70"
        >
          ← Dashboard
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {formatDate(session.started_at)}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {formatDuration(session.duration_seconds)}
          </p>
        </div>
      </header>

      <div className="flex-1 flex flex-col gap-3 px-4 py-6 max-w-sm mx-auto w-full">
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
                  preload="none"
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
            Nenhuma mensagem nesta aula.
          </p>
        )}
      </div>
    </main>
  )
}
