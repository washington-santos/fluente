import type { CefrLevel } from '@/types'

export interface TeacherConfig {
  slug: string
  name: string
  levels: CefrLevel[]
  tts_voice: string
  onboarding_prompt: string
}

export const TEACHERS: Record<string, TeacherConfig> = {
  'mrs-carol': {
    slug: 'mrs-carol',
    name: 'Mrs. Carol',
    levels: ['A1', 'A2'],
    tts_voice: 'alloy',
    onboarding_prompt:
      "Hi! I'm Mrs. Carol, your English teacher. Tell me a little about yourself in English — your job, your hobbies, or anything you'd like to share. Take about 45 seconds. Don't worry about mistakes — just speak naturally!",
  },
  'mr-jake': {
    slug: 'mr-jake',
    name: 'Mr. Jake',
    levels: ['B1', 'B2'],
    tts_voice: 'echo',
    onboarding_prompt:
      "Hey! I'm Mr. Jake. Tell me about yourself — where you're from, what you do, what you're into. Just talk naturally for about 45 seconds. I'm here to listen!",
  },
  'dr-reynolds': {
    slug: 'dr-reynolds',
    name: 'Dr. Reynolds',
    levels: ['B2', 'C1'],
    tts_voice: 'onyx',
    onboarding_prompt:
      "Good day. I'm Dr. Reynolds. Please tell me about yourself — your professional background, your interests, and your reasons for learning English. Take approximately 45 seconds.",
  },
  sofia: {
    slug: 'sofia',
    name: 'Sofia',
    levels: ['B1', 'C1'],
    tts_voice: 'nova',
    onboarding_prompt:
      "Hey there! I'm Sofia! Tell me all about yourself — what you love doing, where you work, your passions. Just go for it, about 45 seconds!",
  },
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function getTeacherForLevel(level: CefrLevel): string {
  const idx = LEVEL_ORDER.indexOf(level)
  if (idx <= 1) return 'mrs-carol'
  if (idx <= 3) return 'mr-jake'
  return 'dr-reynolds'
}
