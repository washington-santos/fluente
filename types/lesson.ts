export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'

export interface VocabItem {
  word: string
  translation_pt: string
  emoji: string
  pronunciation_hint: string
}

export interface IntroStep {
  id: string
  type: 'intro'
  title_pt: string
  description_pt: string
}

export interface VocabPresentStep {
  id: string
  type: 'vocab_present'
  vocab_index: number
  teacher_script: string
}

export interface VocabRepeatStep {
  id: string
  type: 'vocab_repeat'
  vocab_index: number
  instruction_pt: string
}

export interface ExerciseChoiceStep {
  id: string
  type: 'exercise_choice'
  question_pt: string
  image_emoji: string
  correct_answer: string
  choices: string[]
  explanation_pt: string
}

export interface GuidedConvoStep {
  id: string
  type: 'guided_convo'
  instruction_pt: string
  teacher_opens_with: string
  allowed_vocabulary: string[]
  min_exchanges: number
}

export interface ReviewStep {
  id: string
  type: 'review'
  instruction_pt: string
}

export interface SummaryStep {
  id: string
  type: 'summary'
}

export type LessonStep =
  | IntroStep
  | VocabPresentStep
  | VocabRepeatStep
  | ExerciseChoiceStep
  | GuidedConvoStep
  | ReviewStep
  | SummaryStep

export interface LearningObjective {
  id: string
  description_pt: string
  vocab_words: string[]
}

export interface LessonContent {
  slug: string
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  order: number
  title_en: string
  title_pt: string
  emoji: string
  estimated_minutes: number
  unlock_after: string | null
  xp_reward: number
  vocabulary: VocabItem[]
  learning_objectives: LearningObjective[]
  steps: LessonStep[]
}

export interface UserLessonProgress {
  lesson_slug: string
  status: LessonStatus
  current_step_index: number
  vocab_scores: Record<string, number>
  completed_at: string | null
  xp_earned: number
}

export interface LessonWithProgress extends LessonContent {
  progress: UserLessonProgress | null
}
