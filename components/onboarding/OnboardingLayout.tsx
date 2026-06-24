import { ThemeToggle } from '@/components/ThemeToggle'
import { ProgressBar } from '@/components/onboarding/ProgressBar'

interface OnboardingLayoutProps {
  currentStep: number
  totalSteps?: number
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function OnboardingLayout({
  currentStep,
  totalSteps = 7,
  title,
  subtitle,
  children,
}: OnboardingLayoutProps) {
  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4">
        <div className="flex-1">
          <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        </div>
        <div className="ml-4">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark mb-2 text-center">
            {title}
          </h1>
          {subtitle && (
            <p className="text-center text-content-light-secondary dark:text-content-dark-secondary text-sm mb-8">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </main>
  )
}
