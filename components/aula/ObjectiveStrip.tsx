interface ObjectiveStripProps {
  hint: string
}

export function ObjectiveStrip({ hint }: ObjectiveStripProps) {
  return (
    <div className="mx-4 px-3 py-2 rounded-xl bg-brand-interactive/10 flex items-start gap-2">
      <span className="text-brand-interactive shrink-0 mt-0.5" aria-hidden>📍</span>
      <p className="text-xs font-medium text-brand-interactive leading-snug">
        {hint}
      </p>
    </div>
  )
}
