// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { LevelCard } from '@/components/perfil/LevelCard'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('LevelCard', () => {
  it('shows the current level when not in reinforcement mode', () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    expect(screen.getByText(/B1 – Intermediário/)).toBeInTheDocument()
    expect(screen.queryByText(/Reforçando/i)).not.toBeInTheDocument()
  })

  it('shows the target level and reinforcement line while reinforcing', () => {
    render(<LevelCard cefrLevel="A1" reinforcementTargetLevel="A2" />)
    expect(screen.getByText(/A2 – Básico/)).toBeInTheDocument()
    expect(screen.getByText(/Reforçando conteúdos do A1/i)).toBeInTheDocument()
  })

  it('hides the downgrade option at A1 with no reinforcement in progress', () => {
    render(<LevelCard cefrLevel="A1" reinforcementTargetLevel={null} />)
    expect(screen.queryByText(/estudar um nível abaixo/i)).not.toBeInTheDocument()
  })

  it('opens a confirmation before downgrading, and calls the endpoint on confirm', async () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    fireEvent.click(screen.getByText(/estudar um nível abaixo/i))
    expect(screen.getByText(/progresso será mantido/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirmar a2/i }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/level/downgrade', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'manual_downgrade' }),
    }))
  })

  it('cancels the confirmation without calling the endpoint', () => {
    render(<LevelCard cefrLevel="B1" reinforcementTargetLevel={null} />)
    fireEvent.click(screen.getByText(/estudar um nível abaixo/i))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByText(/progresso será mantido/i)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
