export interface VocabItem {
  word: string
  translation_pt: string
  emoji: string
  pronunciation_hint: string
}

export interface ExtraExample {
  example_sentence_en: string
  example_sentence_pt: string
  explanation_pt: string
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
  example_sentence_en: string
  example_sentence_pt: string
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
  teacher_opens_with_pt?: string
  allowed_vocabulary: string[]
  min_exchanges: number
  is_challenge?: boolean
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

export interface WarmupReviewStep {
  id: string
  type: 'warmup_review'
  recent_summary_pt: string | null
  frequent_errors_pt: string[]
  recent_words: string[]
}

export interface ExerciseFillBlankStep {
  id: string
  type: 'exercise_fill_blank'
  sentence_pt_hint: string
  sentence_with_blank: string
  correct_answer: string
  explanation_pt: string
}

export type LessonStep =
  | WarmupReviewStep
  | IntroStep
  | VocabPresentStep
  | VocabRepeatStep
  | ExerciseChoiceStep
  | ExerciseFillBlankStep
  | GuidedConvoStep
  | ReviewStep
  | SummaryStep

export interface LearningObjective {
  id: string
  description_pt: string
  vocab_words: string[]
}

export interface GeneratedLesson {
  title_pt: string
  objective_pt: string
  vocabulary: VocabItem[]
  learning_objectives: LearningObjective[]
  steps: LessonStep[]
}
