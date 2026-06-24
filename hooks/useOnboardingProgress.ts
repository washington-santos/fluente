'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingProgress } from '@/types'
import { stepToRoute } from '@/lib/onboarding'

export function useOnboardingProgress(pageStep: number) {
  const router = useRouter()
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/onboarding/progress')
      .then((r) => r.json())
      .then(({ progress: p }: { progress: OnboardingProgress | null }) => {
        setProgress(p)
        if (!p) return
        if (p.completed_at) { router.push('/dashboard'); return }
        if (p.current_step >= pageStep + 1) {
          router.push(stepToRoute(p.current_step))
        }
      })
      .finally(() => setLoading(false))
  }, [pageStep, router])

  async function saveStep(
    step: number,
    extra?: { written_answers?: string[]; conversation_transcript?: string; completed?: boolean }
  ) {
    await fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...extra }),
    })
    router.push(extra?.completed ? '/dashboard' : stepToRoute(step))
  }

  return { progress, loading, saveStep }
}
