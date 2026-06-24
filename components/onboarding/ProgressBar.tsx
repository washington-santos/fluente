'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  currentStep: number
  totalSteps: number
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const pct = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="w-full space-y-1">
      <div
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        className="h-2 w-full rounded-full bg-surface-light-card dark:bg-surface-dark-card overflow-hidden"
      >
        <motion.div
          className="h-full bg-brand-cta rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-right">
        {currentStep} de {totalSteps}
      </p>
    </div>
  )
}
