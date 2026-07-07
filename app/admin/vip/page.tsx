'use client'

import { useState, useEffect, useCallback } from 'react'

interface VipUser {
  id: string
  email: string
  plan: string
  active: boolean
  notes: string | null
  created_at: string
}

export default function AdminVipPage() {
  const [users, setUsers] = useState<VipUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPlan, setNewPlan] = useState('pro')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/vip?q=${encodeURIComponent(q)}`)
    const body = await res.json() as { data: VipUser[] }
    setUsers(body.data ?? [])
    setLoading(false)
  }, [q])

  useEffect(() => { void fetchUsers() }, [fetchUsers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setAdding(true)
    setError(null)
    const res = await fetch('/api/admin/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), plan: newPlan, notes: newNotes || null }),
    })
    if (!res.ok) {
      const b = await res.json() as { error: string }
      setError(b.error ?? 'Erro ao adicionar')
    } else {
      setNewEmail('')
      setNewNotes('')
      void fetchUsers()
    }
    setAdding(false)
  }

  async function handleToggle(user: VipUser) {
    await fetch(`/api/admin/vip/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    })
    void fetchUsers()
  }

  async function handlePlanChange(user: VipUser, plan: string) {
    await fetch(`/api/admin/vip/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    void fetchUsers()
  }

  async function handleDelete(user: VipUser) {
    if (!confirm(`Remover ${user.email} dos VIPs?`)) return
    await fetch(`/api/admin/vip/${user.id}`, { method: 'DELETE' })
    void fetchUsers()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Usuários VIP
        </h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar email…"
          className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
        />
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="mb-6 p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-3">
        <p className="text-sm font-semibold text-content-light dark:text-content-dark">Adicionar VIP</p>
        <div className="flex gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="email@exemplo.com"
            required
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none focus:ring-1 focus:ring-brand-cta"
          />
          <select
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none"
          >
            <option value="pro">Pro</option>
            <option value="annual">Anual</option>
            <option value="vip">VIP</option>
          </select>
        </div>
        <input
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="px-3 py-1.5 text-sm rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark outline-none"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={adding}
          className="self-start px-4 py-2 rounded-lg bg-brand-cta text-content-dark text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {adding ? 'Adicionando…' : 'Adicionar'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Carregando…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Nenhum usuário VIP.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                u.active
                  ? 'border-brand-interactive/30 bg-surface-light-card dark:bg-surface-dark-card'
                  : 'border-surface-light-card dark:border-surface-dark-card opacity-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content-light dark:text-content-dark truncate">{u.email}</p>
                {u.notes && (
                  <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5 truncate">{u.notes}</p>
                )}
              </div>
              <select
                value={u.plan}
                onChange={(e) => void handlePlanChange(u, e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark text-content-light dark:text-content-dark"
              >
                <option value="pro">Pro</option>
                <option value="annual">Anual</option>
                <option value="vip">VIP</option>
              </select>
              <button
                onClick={() => void handleToggle(u)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                  u.active
                    ? 'bg-brand-interactive/10 text-brand-interactive hover:bg-brand-interactive/20'
                    : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary hover:bg-surface-light dark:hover:bg-surface-dark'
                }`}
              >
                {u.active ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={() => void handleDelete(u)}
                className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
