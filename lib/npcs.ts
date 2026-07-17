export interface Npc {
  key: string
  name: string
  emoji: string
  topicKey: string
  personalityPromptEn: string
}

export const NPCS: Npc[] = [
  { key: 'tom', name: 'Tom', emoji: '🧑‍🍳', topicKey: 'restaurants', personalityPromptEn: 'a friendly, chatty waiter at a busy restaurant, quick with recommendations' },
  { key: 'sarah', name: 'Sarah', emoji: '✈️', topicKey: 'travel', personalityPromptEn: 'a brisk but polite immigration officer at an airport, asks direct questions' },
  { key: 'mike', name: 'Mike', emoji: '💼', topicKey: 'job-interview', personalityPromptEn: 'a professional, encouraging recruiter conducting a job interview' },
  { key: 'anna', name: 'Anna', emoji: '🛍️', topicKey: 'shopping', personalityPromptEn: 'an upbeat, helpful shop assistant in a clothing store' },
  { key: 'dr-lima', name: 'Dr. Lima', emoji: '🩺', topicKey: 'health', personalityPromptEn: 'a warm, reassuring doctor at a routine checkup' },
]

export function getNpcForTopic(topicKey: string): Npc | null {
  return NPCS.find(n => n.topicKey === topicKey) ?? null
}

export function getNpcByKey(npcKey: string): Npc | null {
  return NPCS.find(n => n.key === npcKey) ?? null
}
