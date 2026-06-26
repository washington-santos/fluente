import Link from 'next/link'

interface Props {
  id: string
  started_at: string
  duration_seconds: number | null
  teacher_name: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function SessionCard({ id, started_at, duration_seconds, teacher_name }: Props) {
  return (
    <Link
      href={`/dashboard/sessao/${id}`}
      className="flex items-center justify-between p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
    >
      <div>
        <p className="text-sm font-medium text-content-light dark:text-content-dark">{teacher_name}</p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          {formatDate(started_at)}
        </p>
      </div>
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
        {formatDuration(duration_seconds)}
      </p>
    </Link>
  )
}
