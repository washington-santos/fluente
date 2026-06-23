// ── Primitive unions ────────────────────────────────────────────────────
export type Theme = 'light' | 'dark'
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type SessionMode = 'guided' | 'scenario' | 'free' | 'daily'
export type MessageRole = 'user' | 'assistant'
export type ErrorType = 'verb_tense' | 'vocabulary' | 'preposition' | 'pronunciation' | 'other'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing'
export type TtsProvider = 'openai' | 'elevenlabs'

// ── Database row types (column names match Supabase schema exactly) ────
export interface User {
  id: string
  email: string
  name: string | null
  created_at: string
  plan_id: string | null
  cefr_level: CefrLevel | null
  teacher_id: string | null
  personal_context: string[] | null
  streak_days: number
  last_session_at: string | null
  preferred_session_time: string | null
  theme: Theme
}

export interface OnboardingProgress {
  id: string
  user_id: string
  current_step: number
  written_answers: string[] | null
  conversation_transcript: string | null
  completed_at: string | null
}

export interface Teacher {
  id: string
  name: string
  system_prompt: string
  tts_voice: string
  tts_provider: TtsProvider
  avatar_image_url: string
  levels: CefrLevel[]
  correction_style: string
  memory_prefix: string
}

export interface Session {
  id: string
  user_id: string
  teacher_id: string
  mode: SessionMode
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  replay_text: string | null
  main_error: string | null
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  text: string
  audio_url: string | null
  had_correction: boolean
  created_at: string
}

export interface SessionMemory {
  id: string
  user_id: string
  summary: string
  key_topics: string[]
  personal_details: string[]
  created_at: string
}

export interface ErrorLog {
  id: string
  user_id: string
  error_type: ErrorType
  error_text: string
  correct_form: string
  seen_count: number
  last_seen_at: string
  resolved_at: string | null
}

export interface VocabularyItem {
  id: string
  user_id: string
  word: string
  definition: string
  next_review_at: string
  ease_factor: number
  repetition_count: number
}

export interface Plan {
  id: string
  name: string
  price_brl: number
  minutes_per_month: number
  features: string[]
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: SubscriptionStatus
  mp_subscription_id: string | null
  current_period_end: string
}

export interface UsageLog {
  id: string
  user_id: string
  date: string
  whisper_minutes: number
  tts_chars: number
  claude_tokens: number
  did_credits: number
}

// ── API payload types ──────────────────────────────────────────────────
export interface ConversationRequest {
  audio_base64?: string
  panic_text?: string
  session_id: string
}

export interface ErrorReport {
  error_detected: boolean
  error_text?: string
  correct_form?: string
  error_type?: ErrorType
}

export interface ConversationResponse {
  text: string
  audio_url: string
  video_url: string | null
  had_correction: boolean
  error_report: ErrorReport
}
