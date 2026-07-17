import { MessageCircle, Flame, BookOpen, Trophy, ArrowUpCircle, Mic, Sparkles, CheckCircle2, Award, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  MessageCircle,
  Flame,
  BookOpen,
  Trophy,
  ArrowUpCircle,
  Mic,
  Sparkles,
  CheckCircle2,
}

interface BadgeIconProps {
  icon: string
  size?: number
  className?: string
}

export function BadgeIcon({ icon, size = 20, className }: BadgeIconProps) {
  const Icon = ICONS[icon] ?? Award
  return <Icon size={size} className={className} />
}
