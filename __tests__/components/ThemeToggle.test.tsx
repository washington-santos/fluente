import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('renders a button with aria-label "Toggle theme"', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('shows moon icon in light mode', () => {
    render(<ThemeProvider initialTheme="light"><ThemeToggle /></ThemeProvider>)
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument()
  })

  it('shows sun icon in dark mode', () => {
    render(<ThemeProvider initialTheme="dark"><ThemeToggle /></ThemeProvider>)
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument()
  })
})
