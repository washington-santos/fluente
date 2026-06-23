import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '@/components/ThemeProvider'

function TestConsumer() {
  const { theme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to dark theme', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('applies dark class to html element', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles to light and removes dark class', async () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    await act(async () => screen.getByText('toggle').click())
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists theme in localStorage under key ef_theme', async () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    await act(async () => screen.getByText('toggle').click())
    expect(localStorage.getItem('ef_theme')).toBe('light')
  })

  it('respects initialTheme prop', () => {
    render(<ThemeProvider initialTheme="light"><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })
})
