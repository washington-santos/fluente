// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { DemoStatusCard } from '@/components/dashboard/DemoStatusCard'

const EXPIRES_IN_4_DAYS = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()

describe('DemoStatusCard', () => {
  it('renders nothing when demo_status is null', () => {
    const { container } = render(
      <DemoStatusCard demoStatus={null} demoExpiresAt={null} demoMinutesUsed={0} demoMinutesLimit={30} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows days remaining and minutes remaining when active', () => {
    render(
      <DemoStatusCard
        demoStatus="active"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={12}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/4 dias restantes/i)).toBeInTheDocument()
    expect(screen.getByText(/18 min restantes/i)).toBeInTheDocument()
  })

  it('shows correct usage percentage', () => {
    render(
      <DemoStatusCard
        demoStatus="active"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={15}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/50%/)).toBeInTheDocument()
  })

  it('shows encerrada state with link when expired', () => {
    render(
      <DemoStatusCard
        demoStatus="expired"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={5}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/Demonstração encerrada/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Assinar agora/i })).toBeInTheDocument()
  })

  it('shows exhausted state with minutes count', () => {
    render(
      <DemoStatusCard
        demoStatus="exhausted"
        demoExpiresAt={EXPIRES_IN_4_DAYS}
        demoMinutesUsed={30}
        demoMinutesLimit={30}
      />
    )
    expect(screen.getByText(/Demonstração encerrada/i)).toBeInTheDocument()
    expect(screen.getByText(/30 minutos utilizados/i)).toBeInTheDocument()
  })
})
