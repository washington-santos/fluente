'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="p-2 rounded-xl hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors duration-200"
    >
      {theme === 'dark' ? (
        <Sun size={20} className="text-content-dark-secondary" data-testid="sun-icon" />
      ) : (
        <Moon size={20} className="text-content-light-secondary" data-testid="moon-icon" />
      )}
    </button>
  )
}
