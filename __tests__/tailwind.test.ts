import { readFileSync } from 'fs'

describe('tailwind config', () => {
  it("uses 'class' strategy for dark mode", () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain("darkMode: 'class'")
  })

  it('defines primary brand color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#1A3C5E')
  })

  it('defines CTA color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#27AE60')
  })

  it('defines streak color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#F4A829')
  })

  it('defines dark background color', () => {
    const config = readFileSync('tailwind.config.ts', 'utf-8')
    expect(config).toContain('#0F172A')
  })
})
