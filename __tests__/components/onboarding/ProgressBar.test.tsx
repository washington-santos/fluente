import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/onboarding/ProgressBar'

describe('ProgressBar', () => {
  it('renders a progressbar role', () => {
    render(<ProgressBar currentStep={2} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('sets aria-valuenow to the current step', () => {
    render(<ProgressBar currentStep={3} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('sets aria-valuemax to total steps', () => {
    render(<ProgressBar currentStep={3} totalSteps={7} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7')
  })

  it('shows step label text', () => {
    render(<ProgressBar currentStep={2} totalSteps={7} />)
    expect(screen.getByText('2 de 7')).toBeInTheDocument()
  })
})
