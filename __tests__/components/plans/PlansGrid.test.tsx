// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

import { PlansGrid } from '@/app/planos/PlansGrid'
import type { DemoStatus } from '@/types'

const baseProps = {
  currentPlanId: null as string | null,
  demoStatus: null as DemoStatus | null,
  hasActiveSubscription: false,
  subscriptionEndDate: null as string | null,
  demoEnded: false,
}

describe('PlansGrid', () => {
  it('renders Demonstração Premium card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Demonstração Premium')).toBeInTheDocument()
  })

  it('renders Mais Popular badge on Pro card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Mais Popular')).toBeInTheDocument()
  })

  it('renders Melhor Valor badge on Annual card', () => {
    render(<PlansGrid {...baseProps} />)
    expect(screen.getByText('Melhor Valor')).toBeInTheDocument()
  })

  it('shows demo_ended alert when demoEnded prop is true', () => {
    render(<PlansGrid {...baseProps} demoEnded />)
    expect(screen.getByText(/Sua demonstração terminou/i)).toBeInTheDocument()
  })

  it('shows "Demonstração ativa" when demoStatus is active', () => {
    render(<PlansGrid {...baseProps} demoStatus="active" currentPlanId="demo" />)
    expect(screen.getByText(/Demonstração ativa/i)).toBeInTheDocument()
  })
})
