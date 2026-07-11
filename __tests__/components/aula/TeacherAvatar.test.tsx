// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'

describe('TeacherAvatar', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders the static image when videoUrl is null', () => {
    render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl={null} isSpeaking={false} />)
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('renders the video element when videoUrl is provided', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/video.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
  })

  it('falls back to the static image when the video errors', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/broken.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.error(video) })
    expect(container.querySelector('video')).toBeFalsy()
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('falls back to the static image if the video never becomes playable within the timeout', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/stuck.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4100) })
    expect(container.querySelector('video')).toBeFalsy()
    expect(screen.getByAltText('Mr. Jake')).toBeInTheDocument()
  })

  it('does not fall back if the video fires canPlay before the timeout', () => {
    const { container } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/good.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.canPlay(video) })
    act(() => { vi.advanceTimersByTime(4100) })
    expect(container.querySelector('video')).toBeTruthy()
  })

  it('resets the fallback state when a new videoUrl arrives', () => {
    const { container, rerender } = render(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/broken.mp4" isSpeaking />)
    const video = container.querySelector('video')!
    act(() => { fireEvent.error(video) })
    expect(container.querySelector('video')).toBeFalsy()

    rerender(<TeacherAvatar name="Mr. Jake" imageUrl="/avatars/mr-jake.png" videoUrl="https://d-id.com/new-good.mp4" isSpeaking />)
    expect(container.querySelector('video')).toBeTruthy()
  })
})
