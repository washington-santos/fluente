'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'dark')

  useEffect(() => {
    if (!initialTheme) {
      const saved = localStorage.getItem('ef_theme') as Theme | null
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    }
  }, [initialTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    if (!initialTheme) localStorage.setItem('ef_theme', theme)
  }, [theme, initialTheme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
