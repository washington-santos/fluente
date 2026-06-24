'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSupabaseClient } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function CadastroPage() {
  const supabase = useMemo(() => createSupabaseClient(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [safeNext, setSafeNext] = useState('')
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('next') ?? ''
    if (raw.startsWith('/') && !raw.startsWith('//')) setSafeNext(raw)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!email.trim()) { setError('E-mail é obrigatório'); return }
    if (password.length < 8) { setError('A senha deve ter no mínimo 8 caracteres'); return }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })

      if (error) {
        const msg = error.message ?? ''
        const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
        if (code === 'user_already_exists' || msg === 'User already registered') {
          setError('Este e-mail já está cadastrado. Faça login ou recupere sua senha.')
        } else if (code === 'weak_password' || msg.toLowerCase().includes('password')) {
          setError('A senha não atende aos critérios de segurança. Tente com letras e números.')
        } else {
          setError('Não foi possível criar a conta. Tente novamente.')
        }
        return
      }

      if (!data.session) {
        setSuccessMsg('Cadastro realizado! Verifique seu e-mail para confirmar a conta.')
        return
      }

      window.location.href = safeNext || '/cadastro/boas-vindas'
    } catch (e) {
      console.error('[cadastro] signUp threw:', e instanceof Error ? e.message : String(e))
      setError('Ocorreu um erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    const dest = safeNext || '/cadastro/boas-vindas'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(dest)}`,
      },
    })
    if (error) setError('Não foi possível conectar com o Google. Tente novamente.')
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark mb-2 text-center">
            Criar conta
          </h1>
          <p className="text-center text-content-light-secondary dark:text-content-dark-secondary mb-8 text-sm">
            Comece a falar inglês hoje. Grátis.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />
            <input
              type="password"
              placeholder="Senha (mín. 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
            />

            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {successMsg && <p role="status" className="text-sm text-green-600">{successMsg}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface-light dark:bg-surface-dark text-content-light-secondary dark:text-content-dark-secondary">
                ou
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark font-medium hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
          >
            Entrar com Google
          </button>

          <p className="mt-6 text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Já tem conta?{' '}
            <Link href="/login" className="text-brand-interactive hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
