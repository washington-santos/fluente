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

  it('manages dark class on html element after first toggle', async () => {
    // The inline script in layout.tsx owns the initial class; ThemeProvider skips
    // the first DOM sync to avoid overriding it. After the first toggle the effect
    // takes over and correctly reflects the new theme.
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    await act(async () => screen.getByText('toggle').click()) // dark → light
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    await act(async () => screen.getByText('toggle').click()) // light → dark
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
