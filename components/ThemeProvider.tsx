'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

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
  // Tracks whether the first effect run has passed; on first run the inline script
  // in layout.tsx already applied the correct class, so we skip to avoid a flash.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (!initialTheme) {
      const saved = localStorage.getItem('ef_theme') as Theme | null
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    }
  }, [initialTheme])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('ef_theme', theme)
  }, [theme])

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
