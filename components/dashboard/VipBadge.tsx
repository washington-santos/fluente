interface Props {
  plan: string
}

export function VipBadge({ plan }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-interactive/10 border border-brand-interactive/30">
      <span className="text-xs">⭐</span>
      <span className="text-xs font-semibold text-brand-interactive uppercase tracking-wide">
        VIP · {plan}
      </span>
    </div>
  )
}
