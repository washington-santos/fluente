import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#1A3C5E',
          interactive: '#2E75B6',
          cta: '#27AE60',
          streak: '#F4A829',
        },
        surface: {
          light: '#FFFFFF',
          'light-card': '#F4F7FB',
          dark: '#0F172A',
          'dark-card': '#1E293B',
        },
        content: {
          light: '#1A1A2E',
          'light-secondary': '#6B7280',
          dark: '#F1F5F9',
          'dark-secondary': '#94A3B8',
        },
        feedback: {
          'error-light': '#FFF9C4',
          'error-dark': '#3D3500',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
