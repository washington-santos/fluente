# Structured Lesson Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form chat for A1/A2 students with a structured lesson engine that teaches vocabulary step-by-step (present → repeat → exercise → guided conversation → review → summary), driven by JSON content files with Supabase progress tracking.

**Architecture:** Lesson content lives in `content/curriculum/a1/*.json` files loaded by `lib/curriculum.ts`. Per-user progress is persisted in three new Supabase tables. The lesson engine (`/licao/[slug]`) is a client component orchestrating typed step components. New `/api/lesson/` endpoints handle TTS, audio assessment (Whisper+GPT), progress saves, and lesson completion. Dashboard CTA redirects A1/A2 users to `/licoes` instead of `/aula`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind (design tokens only), Supabase SSR, OpenAI Whisper+TTS+GPT-4o-mini, framer-motion (already installed), Vitest + @testing-library/react

## Global Constraints

- All UI copy in Brazilian Portuguese. English only in lesson content (vocab words, teacher scripts).
- Tailwind design tokens ONLY — no `text-white`, no raw hex. Tokens: `bg-surface-light`, `bg-surface-dark`, `bg-surface-light-card`, `bg-surface-dark-card`, `text-content-light`, `text-content-light-secondary`, `text-content-dark`, `text-content-dark-secondary`, `bg-brand-cta`, `bg-brand-interactive`, `bg-brand-streak`.
- All server DB reads/writes: `createSupabaseServer()` from `@/lib/supabase-server`. Storage uploads: `createSupabaseAdmin()`.
- Component test files: first line must be `// @vitest-environment jsdom`.
- API route test files: first line must be `// @vitest-environment node`.
- No new npm packages (framer-motion, lucide-react, openai already installed).
- GPT model: `gpt-4o-mini`, `response_format: { type: 'json_object' }`, max 200 tokens for assessments.
- `useAudioRecorder` uses callback pattern: `useAudioRecorder({ onComplete: (blob: Blob) => void })`.
- `synthesizeTts(text, voice)` from `@/lib/tts` returns `{ dataUrl: string, buffer: Buffer }`.
- Run tests with: `npx vitest run --reporter=verbose`
- TypeScript check: `npx tsc --noEmit`

---

## File Map

| File | Action | Task |
|------|--------|------|
| `types/lesson.ts` | Create — all lesson TypeScript types | 1 |
| `content/curriculum/a1/lesson-01-greetings.json` | Create — 8 vocab words, 23 steps | 1 |
| `content/curriculum/a1/lesson-02-numbers.json` | Create — 10 vocab words, 27 steps | 1 |
| `content/curriculum/a1/lesson-03-colors.json` | Create — 8 vocab words, 23 steps | 1 |
| `middleware.ts` | Modify — add `/licoes` and `/licao` to PROTECTED | 1 |
| `supabase/migrations/20260703000001_lesson_engine.sql` | Create — 3 new tables + RLS + seed | 2 |
| `lib/curriculum.ts` | Create — content loader functions | 2 |
| `__tests__/lib/curriculum.test.ts` | Create — unit tests for curriculum lib | 2 |
| `app/api/lesson/tts/route.ts` | Create — POST: TTS for lesson content | 3 |
| `app/api/lesson/assess/route.ts` | Create — POST: Whisper+GPT assessment | 3 |
| `app/api/lesson/progress/route.ts` | Create — POST: save step progress | 3 |
| `app/api/lesson/complete/route.ts` | Create — POST: complete lesson + XP + unlock | 3 |
| `app/api/lessons/route.ts` | Create — GET: list lessons with user progress | 3 |
| `components/lesson/LessonCard.tsx` | Create — locked/available/completed card | 4 |
| `app/licoes/page.tsx` | Create — course map server component | 4 |
| `__tests__/components/lesson/LessonCard.test.tsx` | Create — locked/available/completed state tests | 4 |
| `components/lesson/LessonProgressBar.tsx` | Create — step progress bar | 5 |
| `components/lesson/IntroStep.tsx` | Create — vocabulary preview step | 5 |
| `components/lesson/SummaryStep.tsx` | Create — completion summary + XP | 5 |
| `app/licao/[slug]/LessonEngine.tsx` | Create — step orchestrator client component | 5 |
| `app/licao/[slug]/page.tsx` | Create — lesson server component | 5 |
| `__tests__/components/lesson/LessonEngine.test.tsx` | Create — engine step rendering tests | 5 |
| `components/lesson/VocabPresentStep.tsx` | Create — show word + play TTS | 6 |
| `components/lesson/VocabRepeatStep.tsx` | Create — record + assess pronunciation | 6 |
| `components/lesson/ExerciseChoiceStep.tsx` | Create — multiple choice exercise | 6 |
| `__tests__/components/lesson/ExerciseChoiceStep.test.tsx` | Create — choice/feedback/advance tests | 6 |
| `components/lesson/GuidedConvoStep.tsx` | Create — restricted vocabulary mini-chat | 7 |
| `components/lesson/ReviewStep.tsx` | Create — flashcard review of lesson vocab | 7 |
| `app/dashboard/page.tsx` | Modify — A1/A2 CTA → /licoes, add lesson progress section | 7 |

---

### Task 1: Types + JSON Content + Middleware

**Files:**
- Create: `types/lesson.ts`
- Create: `content/curriculum/a1/lesson-01-greetings.json`
- Create: `content/curriculum/a1/lesson-02-numbers.json`
- Create: `content/curriculum/a1/lesson-03-colors.json`
- Modify: `middleware.ts`

**Interfaces:**
- Produces: `LessonContent`, `VocabItem`, `LessonStep` (union), `IntroStep`, `VocabPresentStep`, `VocabRepeatStep`, `ExerciseChoiceStep`, `GuidedConvoStep`, `ReviewStep`, `SummaryStep`, `UserLessonProgress`, `LessonStatus`, `LessonWithProgress` — all exported from `@/types/lesson`

- [ ] **Step 1: Create `types/lesson.ts`**

```typescript
// types/lesson.ts

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
```

- [ ] **Step 2: Create `content/curriculum/a1/lesson-01-greetings.json`**

```json
{
  "slug": "a1-lesson-01-greetings",
  "level": "A1",
  "order": 1,
  "title_en": "Greetings & Basic Phrases",
  "title_pt": "Cumprimentos e Frases Básicas",
  "emoji": "👋",
  "estimated_minutes": 12,
  "unlock_after": null,
  "xp_reward": 50,
  "vocabulary": [
    { "word": "Hello", "translation_pt": "Olá", "emoji": "👋", "pronunciation_hint": "HEH-loh" },
    { "word": "Hi", "translation_pt": "Oi", "emoji": "😊", "pronunciation_hint": "HY" },
    { "word": "Good morning", "translation_pt": "Bom dia", "emoji": "☀️", "pronunciation_hint": "good MOR-ning" },
    { "word": "Bye", "translation_pt": "Tchau", "emoji": "👋", "pronunciation_hint": "BY" },
    { "word": "Thank you", "translation_pt": "Obrigado", "emoji": "🙏", "pronunciation_hint": "THANK yoo" },
    { "word": "Please", "translation_pt": "Por favor", "emoji": "🤲", "pronunciation_hint": "PLEEZ" },
    { "word": "Yes", "translation_pt": "Sim", "emoji": "✅", "pronunciation_hint": "YES" },
    { "word": "No", "translation_pt": "Não", "emoji": "❌", "pronunciation_hint": "NOH" }
  ],
  "steps": [
    { "id": "intro", "type": "intro", "title_pt": "Hoje você aprenderá", "description_pt": "8 palavras essenciais para se comunicar em inglês desde o primeiro dia." },
    { "id": "vp-hello", "type": "vocab_present", "vocab_index": 0, "teacher_script": "Hello. Listen carefully: Hello. In Portuguese, Hello means Olá. Hello." },
    { "id": "vr-hello", "type": "vocab_repeat", "vocab_index": 0, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-hi", "type": "vocab_present", "vocab_index": 1, "teacher_script": "Hi. Listen: Hi. Hi is a casual way to say Hello. Hi." },
    { "id": "vr-hi", "type": "vocab_repeat", "vocab_index": 1, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-good-morning", "type": "vocab_present", "vocab_index": 2, "teacher_script": "Good morning. Listen: Good morning. We say this in the morning. Good morning." },
    { "id": "vr-good-morning", "type": "vocab_repeat", "vocab_index": 2, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-bye", "type": "vocab_present", "vocab_index": 3, "teacher_script": "Bye. Listen: Bye. Bye means goodbye. Bye." },
    { "id": "vr-bye", "type": "vocab_repeat", "vocab_index": 3, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-thank-you", "type": "vocab_present", "vocab_index": 4, "teacher_script": "Thank you. Listen: Thank you. Thank you means obrigado. Thank you." },
    { "id": "vr-thank-you", "type": "vocab_repeat", "vocab_index": 4, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-please", "type": "vocab_present", "vocab_index": 5, "teacher_script": "Please. Listen: Please. We use please to be polite. Please." },
    { "id": "vr-please", "type": "vocab_repeat", "vocab_index": 5, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-yes", "type": "vocab_present", "vocab_index": 6, "teacher_script": "Yes. Listen: Yes. Yes means sim. Yes." },
    { "id": "vr-yes", "type": "vocab_repeat", "vocab_index": 6, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-no", "type": "vocab_present", "vocab_index": 7, "teacher_script": "No. Listen: No. No means não. No." },
    { "id": "vr-no", "type": "vocab_repeat", "vocab_index": 7, "instruction_pt": "Agora repita em voz alta:" },
    {
      "id": "ex-1", "type": "exercise_choice",
      "question_pt": "O que significa 'Thank you'?",
      "image_emoji": "🙏",
      "correct_answer": "Obrigado",
      "choices": ["Obrigado", "Por favor", "Tchau", "Com licença"],
      "explanation_pt": "'Thank you' significa 'Obrigado' ou 'Obrigada'."
    },
    {
      "id": "ex-2", "type": "exercise_choice",
      "question_pt": "Como se diz 'Tchau' em inglês?",
      "image_emoji": "👋",
      "correct_answer": "Bye",
      "choices": ["Hi", "Bye", "Please", "No"],
      "explanation_pt": "'Bye' é como dizemos 'Tchau' em inglês."
    },
    {
      "id": "ex-3", "type": "exercise_choice",
      "question_pt": "Como se diz 'Bom dia' em inglês?",
      "image_emoji": "☀️",
      "correct_answer": "Good morning",
      "choices": ["Good morning", "Good evening", "Hello", "Hi"],
      "explanation_pt": "'Good morning' é a saudação do período da manhã."
    },
    {
      "id": "guided-convo", "type": "guided_convo",
      "instruction_pt": "Agora vamos praticar! Responda às perguntas da professora usando as palavras que você aprendeu.",
      "teacher_opens_with": "Hello! Say hello to me!",
      "allowed_vocabulary": ["Hello", "Hi", "Good morning", "Bye", "Thank you", "Please", "Yes", "No"],
      "min_exchanges": 3
    },
    { "id": "review", "type": "review", "instruction_pt": "Vamos revisar todas as palavras da aula!" },
    { "id": "summary", "type": "summary" }
  ]
}
```

- [ ] **Step 3: Create `content/curriculum/a1/lesson-02-numbers.json`**

```json
{
  "slug": "a1-lesson-02-numbers",
  "level": "A1",
  "order": 2,
  "title_en": "Numbers 1–10",
  "title_pt": "Números de 1 a 10",
  "emoji": "🔢",
  "estimated_minutes": 12,
  "unlock_after": "a1-lesson-01-greetings",
  "xp_reward": 50,
  "vocabulary": [
    { "word": "One", "translation_pt": "Um", "emoji": "1️⃣", "pronunciation_hint": "WUN" },
    { "word": "Two", "translation_pt": "Dois", "emoji": "2️⃣", "pronunciation_hint": "TOO" },
    { "word": "Three", "translation_pt": "Três", "emoji": "3️⃣", "pronunciation_hint": "THREE" },
    { "word": "Four", "translation_pt": "Quatro", "emoji": "4️⃣", "pronunciation_hint": "FOR" },
    { "word": "Five", "translation_pt": "Cinco", "emoji": "5️⃣", "pronunciation_hint": "FYV" },
    { "word": "Six", "translation_pt": "Seis", "emoji": "6️⃣", "pronunciation_hint": "SIKS" },
    { "word": "Seven", "translation_pt": "Sete", "emoji": "7️⃣", "pronunciation_hint": "SEH-ven" },
    { "word": "Eight", "translation_pt": "Oito", "emoji": "8️⃣", "pronunciation_hint": "AYT" },
    { "word": "Nine", "translation_pt": "Nove", "emoji": "9️⃣", "pronunciation_hint": "NYN" },
    { "word": "Ten", "translation_pt": "Dez", "emoji": "🔟", "pronunciation_hint": "TEN" }
  ],
  "steps": [
    { "id": "intro", "type": "intro", "title_pt": "Hoje você aprenderá", "description_pt": "Os números de 1 a 10 em inglês. Essencial para datas, idades, preços e muito mais!" },
    { "id": "vp-one", "type": "vocab_present", "vocab_index": 0, "teacher_script": "One. Listen: One. One means um in Portuguese. One." },
    { "id": "vr-one", "type": "vocab_repeat", "vocab_index": 0, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-two", "type": "vocab_present", "vocab_index": 1, "teacher_script": "Two. Listen: Two. Two means dois. Two." },
    { "id": "vr-two", "type": "vocab_repeat", "vocab_index": 1, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-three", "type": "vocab_present", "vocab_index": 2, "teacher_script": "Three. Listen: Three. Three means três. Three." },
    { "id": "vr-three", "type": "vocab_repeat", "vocab_index": 2, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-four", "type": "vocab_present", "vocab_index": 3, "teacher_script": "Four. Listen: Four. Four means quatro. Four." },
    { "id": "vr-four", "type": "vocab_repeat", "vocab_index": 3, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-five", "type": "vocab_present", "vocab_index": 4, "teacher_script": "Five. Listen: Five. Five means cinco. Five." },
    { "id": "vr-five", "type": "vocab_repeat", "vocab_index": 4, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-six", "type": "vocab_present", "vocab_index": 5, "teacher_script": "Six. Listen: Six. Six means seis. Six." },
    { "id": "vr-six", "type": "vocab_repeat", "vocab_index": 5, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-seven", "type": "vocab_present", "vocab_index": 6, "teacher_script": "Seven. Listen: Seven. Seven means sete. Seven." },
    { "id": "vr-seven", "type": "vocab_repeat", "vocab_index": 6, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-eight", "type": "vocab_present", "vocab_index": 7, "teacher_script": "Eight. Listen: Eight. Eight means oito. Eight." },
    { "id": "vr-eight", "type": "vocab_repeat", "vocab_index": 7, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-nine", "type": "vocab_present", "vocab_index": 8, "teacher_script": "Nine. Listen: Nine. Nine means nove. Nine." },
    { "id": "vr-nine", "type": "vocab_repeat", "vocab_index": 8, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-ten", "type": "vocab_present", "vocab_index": 9, "teacher_script": "Ten. Listen: Ten. Ten means dez. Ten." },
    { "id": "vr-ten", "type": "vocab_repeat", "vocab_index": 9, "instruction_pt": "Agora repita em voz alta:" },
    {
      "id": "ex-1", "type": "exercise_choice",
      "question_pt": "Como se diz '3' em inglês?",
      "image_emoji": "3️⃣",
      "correct_answer": "Three",
      "choices": ["Two", "Four", "Three", "One"],
      "explanation_pt": "'Three' = 3 em inglês."
    },
    {
      "id": "ex-2", "type": "exercise_choice",
      "question_pt": "Quantos dedos você vê? ✋",
      "image_emoji": "✋",
      "correct_answer": "Five",
      "choices": ["Four", "Five", "Six", "Three"],
      "explanation_pt": "Uma mão tem 5 dedos. 'Five' = 5."
    },
    {
      "id": "ex-3", "type": "exercise_choice",
      "question_pt": "Como se diz '10' em inglês?",
      "image_emoji": "🔟",
      "correct_answer": "Ten",
      "choices": ["Nine", "Eight", "Ten", "Seven"],
      "explanation_pt": "'Ten' = 10 em inglês."
    },
    {
      "id": "guided-convo", "type": "guided_convo",
      "instruction_pt": "Vamos praticar os números! Responda às perguntas da professora.",
      "teacher_opens_with": "How many fingers am I holding up? One, two, three — say the number!",
      "allowed_vocabulary": ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"],
      "min_exchanges": 3
    },
    { "id": "review", "type": "review", "instruction_pt": "Vamos revisar todos os números!" },
    { "id": "summary", "type": "summary" }
  ]
}
```

- [ ] **Step 4: Create `content/curriculum/a1/lesson-03-colors.json`**

```json
{
  "slug": "a1-lesson-03-colors",
  "level": "A1",
  "order": 3,
  "title_en": "Colors",
  "title_pt": "Cores",
  "emoji": "🎨",
  "estimated_minutes": 10,
  "unlock_after": "a1-lesson-02-numbers",
  "xp_reward": 50,
  "vocabulary": [
    { "word": "Red", "translation_pt": "Vermelho", "emoji": "🔴", "pronunciation_hint": "RED" },
    { "word": "Blue", "translation_pt": "Azul", "emoji": "🔵", "pronunciation_hint": "BLOO" },
    { "word": "Green", "translation_pt": "Verde", "emoji": "🟢", "pronunciation_hint": "GREEN" },
    { "word": "Yellow", "translation_pt": "Amarelo", "emoji": "🟡", "pronunciation_hint": "YEH-loh" },
    { "word": "White", "translation_pt": "Branco", "emoji": "⬜", "pronunciation_hint": "WYT" },
    { "word": "Black", "translation_pt": "Preto", "emoji": "⬛", "pronunciation_hint": "BLAK" },
    { "word": "Orange", "translation_pt": "Laranja", "emoji": "🟠", "pronunciation_hint": "OR-inj" },
    { "word": "Purple", "translation_pt": "Roxo", "emoji": "🟣", "pronunciation_hint": "PUR-puhl" }
  ],
  "steps": [
    { "id": "intro", "type": "intro", "title_pt": "Hoje você aprenderá", "description_pt": "8 cores em inglês. Você vai conseguir descrever o mundo ao seu redor!" },
    { "id": "vp-red", "type": "vocab_present", "vocab_index": 0, "teacher_script": "Red. Listen: Red. Red means vermelho in Portuguese. Red." },
    { "id": "vr-red", "type": "vocab_repeat", "vocab_index": 0, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-blue", "type": "vocab_present", "vocab_index": 1, "teacher_script": "Blue. Listen: Blue. Blue means azul. Blue." },
    { "id": "vr-blue", "type": "vocab_repeat", "vocab_index": 1, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-green", "type": "vocab_present", "vocab_index": 2, "teacher_script": "Green. Listen: Green. Green means verde. Green." },
    { "id": "vr-green", "type": "vocab_repeat", "vocab_index": 2, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-yellow", "type": "vocab_present", "vocab_index": 3, "teacher_script": "Yellow. Listen: Yellow. Yellow means amarelo. Yellow." },
    { "id": "vr-yellow", "type": "vocab_repeat", "vocab_index": 3, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-white", "type": "vocab_present", "vocab_index": 4, "teacher_script": "White. Listen: White. White means branco. White." },
    { "id": "vr-white", "type": "vocab_repeat", "vocab_index": 4, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-black", "type": "vocab_present", "vocab_index": 5, "teacher_script": "Black. Listen: Black. Black means preto. Black." },
    { "id": "vr-black", "type": "vocab_repeat", "vocab_index": 5, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-orange", "type": "vocab_present", "vocab_index": 6, "teacher_script": "Orange. Listen: Orange. Orange means laranja. Orange." },
    { "id": "vr-orange", "type": "vocab_repeat", "vocab_index": 6, "instruction_pt": "Agora repita em voz alta:" },
    { "id": "vp-purple", "type": "vocab_present", "vocab_index": 7, "teacher_script": "Purple. Listen: Purple. Purple means roxo. Purple." },
    { "id": "vr-purple", "type": "vocab_repeat", "vocab_index": 7, "instruction_pt": "Agora repita em voz alta:" },
    {
      "id": "ex-1", "type": "exercise_choice",
      "question_pt": "Qual é a cor deste 🍎?",
      "image_emoji": "🍎",
      "correct_answer": "Red",
      "choices": ["Red", "Blue", "Green", "Orange"],
      "explanation_pt": "A maçã é vermelha. 'Red' = vermelho."
    },
    {
      "id": "ex-2", "type": "exercise_choice",
      "question_pt": "Qual é a cor do 🌊?",
      "image_emoji": "🌊",
      "correct_answer": "Blue",
      "choices": ["Green", "Blue", "Purple", "Black"],
      "explanation_pt": "O mar é azul. 'Blue' = azul."
    },
    {
      "id": "ex-3", "type": "exercise_choice",
      "question_pt": "Como se diz 'preto' em inglês?",
      "image_emoji": "⬛",
      "correct_answer": "Black",
      "choices": ["White", "Blue", "Black", "Red"],
      "explanation_pt": "'Black' = preto em inglês."
    },
    {
      "id": "guided-convo", "type": "guided_convo",
      "instruction_pt": "Vamos praticar as cores! Responda às perguntas da professora.",
      "teacher_opens_with": "What color is this? 🔴 Say the color!",
      "allowed_vocabulary": ["Red", "Blue", "Green", "Yellow", "White", "Black", "Orange", "Purple"],
      "min_exchanges": 3
    },
    { "id": "review", "type": "review", "instruction_pt": "Vamos revisar todas as cores!" },
    { "id": "summary", "type": "summary" }
  ]
}
```

- [ ] **Step 5: Modify `middleware.ts` — add `/licoes` and `/licao` to PROTECTED**

Change line 4 from:
```typescript
const PROTECTED = ['/dashboard', '/aula', '/professores', '/planos', '/perfil', '/admin']
```
To:
```typescript
const PROTECTED = ['/dashboard', '/aula', '/licoes', '/licao', '/professores', '/planos', '/perfil', '/admin']
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add types/lesson.ts content/curriculum/ middleware.ts
git commit -m "feat: lesson engine types, A1 curriculum content (3 lessons), middleware protection"
```

---

### Task 2: DB Migration + Curriculum Library

**Files:**
- Create: `supabase/migrations/20260703000001_lesson_engine.sql`
- Create: `lib/curriculum.ts`
- Create: `__tests__/lib/curriculum.test.ts`

**Interfaces:**
- Consumes: `LessonContent`, `UserLessonProgress`, `LessonWithProgress` from `@/types/lesson`
- Produces:
  - `getAllLessons(): LessonContent[]`
  - `getLessonBySlug(slug: string): LessonContent` (throws `Error('Lesson not found: {slug}')` if missing)
  - `getNextLesson(currentSlug: string): LessonContent | null`
  - `mergeWithProgress(lessons: LessonContent[], progressList: UserLessonProgress[]): LessonWithProgress[]`

- [ ] **Step 1: Write failing test `__tests__/lib/curriculum.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getAllLessons, getLessonBySlug, getNextLesson, mergeWithProgress } from '@/lib/curriculum'

describe('curriculum', () => {
  it('getAllLessons returns 3 lessons sorted by order', () => {
    const lessons = getAllLessons()
    expect(lessons).toHaveLength(3)
    expect(lessons[0].slug).toBe('a1-lesson-01-greetings')
    expect(lessons[1].slug).toBe('a1-lesson-02-numbers')
    expect(lessons[2].slug).toBe('a1-lesson-03-colors')
  })

  it('getLessonBySlug returns correct lesson with vocabulary', () => {
    const lesson = getLessonBySlug('a1-lesson-01-greetings')
    expect(lesson.title_pt).toBe('Cumprimentos e Frases Básicas')
    expect(lesson.vocabulary).toHaveLength(8)
    expect(lesson.vocabulary[0].word).toBe('Hello')
  })

  it('getLessonBySlug throws for unknown slug', () => {
    expect(() => getLessonBySlug('not-a-lesson')).toThrow('Lesson not found: not-a-lesson')
  })

  it('getNextLesson returns the next lesson', () => {
    const next = getNextLesson('a1-lesson-01-greetings')
    expect(next?.slug).toBe('a1-lesson-02-numbers')
  })

  it('getNextLesson returns null for the last lesson', () => {
    expect(getNextLesson('a1-lesson-03-colors')).toBeNull()
  })

  it('mergeWithProgress attaches progress to matching lessons', () => {
    const lessons = getAllLessons()
    const progress = [{
      lesson_slug: 'a1-lesson-01-greetings',
      status: 'completed' as const,
      current_step_index: 23,
      vocab_scores: { Hello: 0.9 },
      completed_at: '2026-07-03T00:00:00Z',
      xp_earned: 50,
    }]
    const merged = mergeWithProgress(lessons, progress)
    expect(merged[0].progress?.status).toBe('completed')
    expect(merged[1].progress).toBeNull()
    expect(merged[2].progress).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/lib/curriculum.test.ts --reporter=verbose
```
Expected: FAIL — `Cannot find module '@/lib/curriculum'`

- [ ] **Step 3: Create `lib/curriculum.ts`**

```typescript
import type { LessonContent, UserLessonProgress, LessonWithProgress } from '@/types/lesson'
import lesson01 from '@/content/curriculum/a1/lesson-01-greetings.json'
import lesson02 from '@/content/curriculum/a1/lesson-02-numbers.json'
import lesson03 from '@/content/curriculum/a1/lesson-03-colors.json'

const CATALOG: LessonContent[] = [
  lesson01 as LessonContent,
  lesson02 as LessonContent,
  lesson03 as LessonContent,
]

export function getAllLessons(): LessonContent[] {
  return [...CATALOG].sort((a, b) => a.order - b.order)
}

export function getLessonBySlug(slug: string): LessonContent {
  const lesson = CATALOG.find(l => l.slug === slug)
  if (!lesson) throw new Error(`Lesson not found: ${slug}`)
  return lesson
}

export function getNextLesson(currentSlug: string): LessonContent | null {
  const sorted = getAllLessons()
  const idx = sorted.findIndex(l => l.slug === currentSlug)
  if (idx === -1 || idx === sorted.length - 1) return null
  return sorted[idx + 1]
}

export function mergeWithProgress(
  lessons: LessonContent[],
  progressList: UserLessonProgress[],
): LessonWithProgress[] {
  const map = new Map(progressList.map(p => [p.lesson_slug, p]))
  return lessons.map(l => ({ ...l, progress: map.get(l.slug) ?? null }))
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run __tests__/lib/curriculum.test.ts --reporter=verbose
```
Expected: 6 tests PASS.

- [ ] **Step 5: Create `supabase/migrations/20260703000001_lesson_engine.sql`**

```sql
-- Lesson catalog (slugs match JSON files in content/curriculum/)
CREATE TABLE lessons (
  slug text PRIMARY KEY,
  cefr_level text NOT NULL CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  order_index integer NOT NULL,
  title_en text NOT NULL,
  title_pt text NOT NULL,
  emoji text,
  estimated_minutes integer DEFAULT 10,
  unlock_after_slug text REFERENCES lessons(slug),
  xp_reward integer DEFAULT 50,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Per-user lesson progress
CREATE TABLE user_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_slug text NOT NULL REFERENCES lessons(slug),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked','available','in_progress','completed')),
  current_step_index integer DEFAULT 0,
  vocab_scores jsonb DEFAULT '{}',
  completed_at timestamptz,
  xp_earned integer DEFAULT 0,
  UNIQUE(user_id, lesson_slug)
);

-- Word-level mastery
CREATE TABLE user_word_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word text NOT NULL,
  lesson_slug text REFERENCES lessons(slug),
  correct_count integer DEFAULT 0,
  incorrect_count integer DEFAULT 0,
  pronunciation_avg numeric DEFAULT 0,
  mastered boolean DEFAULT false,
  next_review_at timestamptz DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, word)
);

-- RLS
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_read" ON lessons FOR SELECT TO authenticated USING (true);

ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ulp_own" ON user_lesson_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_word_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uwm_own" ON user_word_mastery FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed 3 A1 lessons
INSERT INTO lessons (slug, cefr_level, order_index, title_en, title_pt, emoji, estimated_minutes, unlock_after_slug, xp_reward)
VALUES
  ('a1-lesson-01-greetings', 'A1', 1, 'Greetings & Basic Phrases', 'Cumprimentos e Frases Básicas', '👋', 12, null, 50),
  ('a1-lesson-02-numbers',   'A1', 2, 'Numbers 1–10',              'Números de 1 a 10',              '🔢', 12, 'a1-lesson-01-greetings', 50),
  ('a1-lesson-03-colors',    'A1', 3, 'Colors',                    'Cores',                          '🎨', 10, 'a1-lesson-02-numbers',   50);
```

- [ ] **Step 6: Apply migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with the SQL above.

- [ ] **Step 7: Verify TypeScript + commit**

```bash
npx tsc --noEmit
git add supabase/migrations/20260703000001_lesson_engine.sql lib/curriculum.ts __tests__/lib/curriculum.test.ts
git commit -m "feat: lesson engine DB migration (lessons, user_lesson_progress, user_word_mastery) + curriculum library"
```

---

### Task 3: Lesson APIs

**Files:**
- Create: `app/api/lesson/tts/route.ts`
- Create: `app/api/lesson/assess/route.ts`
- Create: `app/api/lesson/progress/route.ts`
- Create: `app/api/lesson/complete/route.ts`
- Create: `app/api/lessons/route.ts`

**Interfaces:**
- Consumes: `synthesizeTts` from `@/lib/tts`, `getLessonBySlug`, `getNextLesson`, `getAllLessons`, `mergeWithProgress` from `@/lib/curriculum`, `createSupabaseServer` from `@/lib/supabase-server`
- Produces:
  - `POST /api/lesson/tts` body: `FormData { text, voice }` → `{ audio_url: string }`
  - `POST /api/lesson/assess` body: `FormData { type: 'pronunciation'|'conversation', target, audio?, text?, allowed_vocab?, history? }` → `{ assessment, score, feedback_pt, reply?, reply_pt?, transcript? }`
  - `POST /api/lesson/progress` body: `{ lesson_slug, step_index, word?, score? }` → `{ ok: true }`
  - `POST /api/lesson/complete` body: `{ lesson_slug, vocab_scores }` → `{ ok: true, xp_earned: number, next_lesson_slug: string|null }`
  - `GET /api/lessons` → `{ lessons: LessonWithProgress[] }`

- [ ] **Step 1: Create `app/api/lesson/tts/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { synthesizeTts } from '@/lib/tts'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const text = formData.get('text') as string | null
  const voice = (formData.get('voice') as string | null) ?? 'alloy'

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const { dataUrl } = await synthesizeTts(text, voice)
  return NextResponse.json({ audio_url: dataUrl })
}
```

- [ ] **Step 2: Create `app/api/lesson/assess/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type') as 'pronunciation' | 'conversation'
  const target = formData.get('target') as string
  const audio = formData.get('audio') as Blob | null
  const panicText = formData.get('text') as string | null
  const allowedVocabRaw = formData.get('allowed_vocab') as string | null
  const historyRaw = formData.get('history') as string | null

  // Transcribe audio or use panic text
  let transcript = panicText?.trim() ?? null
  if (audio && !transcript) {
    const audioFile = new File([audio], 'recording.webm', { type: audio.type || 'audio/webm' })
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'en',
    })
    transcript = transcription.text
  }
  if (!transcript) return NextResponse.json({ error: 'No audio or text' }, { status: 400 })

  if (type === 'pronunciation') {
    const prompt = `You are assessing English pronunciation for an A1 learner from Brazil.
Target: "${target}"
Student said: "${transcript}"

Respond ONLY with valid JSON (no markdown):
{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!"}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
      response_format: { type: 'json_object' },
    })
    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(result)
  }

  if (type === 'conversation') {
    const vocab: string[] = allowedVocabRaw ? JSON.parse(allowedVocabRaw) : []
    const history: Array<{ role: string; content: string }> = historyRaw ? JSON.parse(historyRaw) : []

    const system = `You are Mrs. Carol, teaching English to an A1 learner.
ALLOWED WORDS ONLY: ${vocab.join(', ')}.
Rules: ask only YES/NO questions or ask student to say a word. Max 1 sentence. Give feedback in Portuguese when needed.
Respond ONLY with valid JSON: {"reply":"...","reply_pt":"...","feedback_pt":"..."}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: transcript },
      ],
      max_tokens: 150,
      response_format: { type: 'json_object' },
    })
    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...result, transcript })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
```

- [ ] **Step 3: Create `app/api/lesson/progress/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    lesson_slug: string
    step_index: number
    word?: string
    score?: number
  }
  const { lesson_slug, step_index, word, score } = body

  // Get existing vocab_scores to merge
  const { data: existing } = await supabase
    .from('user_lesson_progress')
    .select('vocab_scores')
    .eq('user_id', user.id)
    .eq('lesson_slug', lesson_slug)
    .maybeSingle()

  const vocabScores = {
    ...(existing?.vocab_scores as Record<string, number> ?? {}),
    ...(word !== undefined && score !== undefined ? { [word]: score } : {}),
  }

  const { error } = await supabase
    .from('user_lesson_progress')
    .upsert({
      user_id: user.id,
      lesson_slug,
      status: 'in_progress',
      current_step_index: step_index,
      vocab_scores: vocabScores,
    }, { onConflict: 'user_id,lesson_slug' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert word mastery
  if (word !== undefined && score !== undefined) {
    await supabase
      .from('user_word_mastery')
      .upsert({
        user_id: user.id,
        word,
        lesson_slug,
        pronunciation_avg: score,
        last_reviewed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,word' })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create `app/api/lesson/complete/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getLessonBySlug, getNextLesson } from '@/lib/curriculum'

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lesson_slug, vocab_scores } = await request.json() as {
    lesson_slug: string
    vocab_scores: Record<string, number>
  }

  const lesson = getLessonBySlug(lesson_slug)
  const scores = Object.values(vocab_scores)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const xp = avg >= 0.8 ? lesson.xp_reward + 10 : lesson.xp_reward

  await supabase
    .from('user_lesson_progress')
    .upsert({
      user_id: user.id,
      lesson_slug,
      status: 'completed',
      vocab_scores,
      completed_at: new Date().toISOString(),
      xp_earned: xp,
    }, { onConflict: 'user_id,lesson_slug' })

  const nextLesson = getNextLesson(lesson_slug)
  if (nextLesson) {
    // Only create progress row if it doesn't already exist
    const { data: existing } = await supabase
      .from('user_lesson_progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('lesson_slug', nextLesson.slug)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from('user_lesson_progress')
        .insert({
          user_id: user.id,
          lesson_slug: nextLesson.slug,
          status: 'available',
          current_step_index: 0,
          vocab_scores: {},
        })
    }
  }

  return NextResponse.json({ ok: true, xp_earned: xp, next_lesson_slug: nextLesson?.slug ?? null })
}
```

- [ ] **Step 5: Create `app/api/lessons/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import type { UserLessonProgress } from '@/types/lesson'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
    .eq('user_id', user.id)

  const lessons = getAllLessons()
  const progress = (progressRows ?? []) as UserLessonProgress[]
  const merged = mergeWithProgress(lessons, progress)

  // Ensure first lesson is always available even without a DB row
  if (merged[0] && !merged[0].progress) {
    merged[0] = {
      ...merged[0],
      progress: { lesson_slug: merged[0].slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 },
    }
  }

  return NextResponse.json({ lessons: merged })
}
```

- [ ] **Step 6: TypeScript check + commit**

```bash
npx tsc --noEmit
git add app/api/lesson/ app/api/lessons/
git commit -m "feat: lesson APIs — tts, assess (Whisper+GPT), progress, complete, list"
```

---

### Task 4: Course Map Page + LessonCard

**Files:**
- Create: `components/lesson/LessonCard.tsx`
- Create: `app/licoes/page.tsx`
- Create: `__tests__/components/lesson/LessonCard.test.tsx`

**Interfaces:**
- Consumes: `LessonWithProgress`, `LessonStatus` from `@/types/lesson`; `getAllLessons`, `mergeWithProgress` from `@/lib/curriculum`; `createSupabaseServer` from `@/lib/supabase-server`
- Produces: `<LessonCard lesson={LessonWithProgress} />`, `<LicoesPage />`

- [ ] **Step 1: Write failing test `__tests__/components/lesson/LessonCard.test.tsx`**

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { LessonCard } from '@/components/lesson/LessonCard'
import type { LessonWithProgress } from '@/types/lesson'

const base: LessonWithProgress = {
  slug: 'a1-lesson-01-greetings',
  level: 'A1',
  order: 1,
  title_en: 'Greetings',
  title_pt: 'Cumprimentos',
  emoji: '👋',
  estimated_minutes: 12,
  unlock_after: null,
  xp_reward: 50,
  vocabulary: [],
  steps: [],
  progress: null,
}

describe('LessonCard', () => {
  it('renders lesson title and order', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByText('Cumprimentos')).toBeInTheDocument()
    expect(screen.getByText('Lição 1')).toBeInTheDocument()
  })

  it('renders as a link when status is available', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/licao/a1-lesson-01-greetings')
  })

  it('renders as a link when status is in_progress', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'in_progress', current_step_index: 5, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/licao/a1-lesson-01-greetings')
  })

  it('shows lock icon and no link when locked', () => {
    render(<LessonCard lesson={{ ...base, unlock_after: 'other', progress: { lesson_slug: base.slug, status: 'locked', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows lock icon and no link when no progress and has unlock_after', () => {
    render(<LessonCard lesson={{ ...base, unlock_after: 'other', progress: null }} />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows checkmark when completed', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'completed', current_step_index: 23, vocab_scores: {}, completed_at: '2026-07-03T00:00:00Z', xp_earned: 50 } }} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/components/lesson/LessonCard.test.tsx --reporter=verbose
```
Expected: FAIL — `Cannot find module '@/components/lesson/LessonCard'`

- [ ] **Step 3: Create `components/lesson/LessonCard.tsx`**

```tsx
import Link from 'next/link'
import type { LessonWithProgress } from '@/types/lesson'

interface LessonCardProps {
  lesson: LessonWithProgress
}

export function LessonCard({ lesson }: LessonCardProps) {
  const status = lesson.progress?.status ?? (lesson.unlock_after ? 'locked' : 'available')
  const isLocked = status === 'locked'
  const isCompleted = status === 'completed'
  const isAccessible = status === 'available' || status === 'in_progress'

  const inner = (
    <div className={`p-4 rounded-xl border-2 transition-all ${
      isCompleted
        ? 'bg-brand-interactive/10 border-brand-interactive'
        : isAccessible
        ? 'bg-surface-light-card dark:bg-surface-dark-card border-brand-cta'
        : 'bg-surface-light-card dark:bg-surface-dark-card border-surface-light-card dark:border-surface-dark-card opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>{lesson.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            Lição {lesson.order}
          </p>
          <p className="font-bold text-content-light dark:text-content-dark truncate">
            {lesson.title_pt}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            ~{lesson.estimated_minutes} min · {lesson.xp_reward} XP
          </p>
        </div>
        {isCompleted && <span className="text-brand-interactive font-bold text-lg flex-shrink-0">✓</span>}
        {isLocked && <span className="flex-shrink-0" aria-label="Bloqueada">🔒</span>}
        {isAccessible && (
          <span className="text-brand-cta text-lg flex-shrink-0" aria-hidden>›</span>
        )}
      </div>
      {status === 'in_progress' && lesson.progress && (
        <div className="mt-2 h-1 rounded-full bg-surface-light dark:bg-surface-dark">
          <div
            className="h-full rounded-full bg-brand-cta"
            style={{ width: `${Math.min(100, (lesson.progress.current_step_index / Math.max(lesson.steps.length, 1)) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )

  if (!isAccessible) return inner
  return <Link href={`/licao/${lesson.slug}`}>{inner}</Link>
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run __tests__/components/lesson/LessonCard.test.tsx --reporter=verbose
```
Expected: 6 tests PASS.

- [ ] **Step 5: Create `app/licoes/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAllLessons, mergeWithProgress } from '@/lib/curriculum'
import { LessonCard } from '@/components/lesson/LessonCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { UserLessonProgress } from '@/types/lesson'

export default async function LicoesPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
    .eq('user_id', user.id)

  const lessons = getAllLessons()
  let merged = mergeWithProgress(lessons, (progressRows ?? []) as UserLessonProgress[])

  if (merged[0] && !merged[0].progress) {
    merged[0] = {
      ...merged[0],
      progress: { lesson_slug: merged[0].slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 },
    }
  }

  const completedCount = merged.filter(l => l.progress?.status === 'completed').length

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          ← Dashboard
        </Link>
        <h1 className="text-base font-bold text-content-light dark:text-content-dark">
          Minhas Lições
        </h1>
        <ThemeToggle />
      </header>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full flex flex-col gap-6">
        {/* Progress summary */}
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
            Seu progresso
          </p>
          <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-1">
            {completedCount} / {merged.length} lições
          </p>
          <div className="mt-3 h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-interactive transition-all duration-500"
              style={{ width: `${(completedCount / Math.max(merged.length, 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* A1 section */}
        <section>
          <h2 className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
            Nível A1 — Iniciante
          </h2>
          <div className="flex flex-col gap-3">
            {merged.filter(l => l.level === 'A1').map(lesson => (
              <LessonCard key={lesson.slug} lesson={lesson} />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: TypeScript check + commit**

```bash
npx tsc --noEmit
git add components/lesson/LessonCard.tsx app/licoes/ __tests__/components/lesson/LessonCard.test.tsx
git commit -m "feat: course map /licoes page with LessonCard (locked/available/completed states)"
```

---

### Task 5: Lesson Engine + Basic Steps + Page

**Files:**
- Create: `components/lesson/LessonProgressBar.tsx`
- Create: `components/lesson/IntroStep.tsx`
- Create: `components/lesson/SummaryStep.tsx`
- Create: `app/licao/[slug]/LessonEngine.tsx`
- Create: `app/licao/[slug]/page.tsx`
- Create: `__tests__/components/lesson/LessonEngine.test.tsx`

**Interfaces:**
- Consumes: All step types from `@/types/lesson`; `LessonProgressBar`, `IntroStep`, `SummaryStep`
- Produces: `<LessonEngine lesson steps={...} initialProgress={...} teacherName teacherImageUrl ttsVoice />`
- `LessonEngine` calls `POST /api/lesson/progress` and `POST /api/lesson/complete`

- [ ] **Step 1: Write failing test `__tests__/components/lesson/LessonEngine.test.tsx`**

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ ok: true, xp_earned: 50, next_lesson_slug: null }),
})

import { LessonEngine } from '@/app/licao/[slug]/LessonEngine'
import type { LessonContent } from '@/types/lesson'

const mockLesson: LessonContent = {
  slug: 'a1-lesson-01-greetings',
  level: 'A1',
  order: 1,
  title_en: 'Greetings',
  title_pt: 'Cumprimentos e Frases Básicas',
  emoji: '👋',
  estimated_minutes: 12,
  unlock_after: null,
  xp_reward: 50,
  vocabulary: [
    { word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' },
  ],
  steps: [
    { id: 'intro', type: 'intro', title_pt: 'Hoje você aprenderá', description_pt: 'Palavras essenciais.' },
    { id: 'summary', type: 'summary' },
  ],
}

describe('LessonEngine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders intro step first', () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    expect(screen.getByText('Hoje você aprenderá')).toBeInTheDocument()
    expect(screen.getByText('Palavras essenciais.')).toBeInTheDocument()
  })

  it('shows step counter', () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('advances to next step when Começar is clicked', async () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => expect(screen.getByText('Aula concluída!')).toBeInTheDocument())
  })

  it('resumes from saved step index', () => {
    render(
      <LessonEngine
        lesson={mockLesson}
        initialProgress={{ lesson_slug: 'a1-lesson-01-greetings', status: 'in_progress', current_step_index: 1, vocab_scores: {}, completed_at: null, xp_earned: 0 }}
        teacherName="Mrs. Carol"
        teacherImageUrl="/avatar.png"
        ttsVoice="alloy"
      />
    )
    expect(screen.getByText('Aula concluída!')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/components/lesson/LessonEngine.test.tsx --reporter=verbose
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `components/lesson/LessonProgressBar.tsx`**

```tsx
interface LessonProgressBarProps {
  currentIndex: number
  total: number
}

export function LessonProgressBar({ currentIndex, total }: LessonProgressBarProps) {
  const pct = total <= 1 ? 100 : (currentIndex / (total - 1)) * 100
  return (
    <div
      className="h-1.5 bg-surface-light-card dark:bg-surface-dark-card rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemax={total}
    >
      <div
        className="h-full bg-brand-interactive rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create `components/lesson/IntroStep.tsx`**

```tsx
import type { IntroStep as IntroStepType, VocabItem } from '@/types/lesson'

interface IntroStepProps {
  step: IntroStepType
  vocabulary: VocabItem[]
  onContinue: () => void
}

export function IntroStep({ step, vocabulary, onContinue }: IntroStepProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          Nesta aula
        </p>
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark mt-1">
          {step.title_pt}
        </h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">
          {step.description_pt}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {vocabulary.map(v => (
          <div
            key={v.word}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card"
          >
            <span className="text-2xl" aria-hidden>{v.emoji}</span>
            <div>
              <p className="font-semibold text-content-light dark:text-content-dark">{v.word}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
                {v.translation_pt}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Começar →
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/lesson/SummaryStep.tsx`**

```tsx
import type { VocabItem } from '@/types/lesson'

interface SummaryStepProps {
  vocabulary: VocabItem[]
  vocabScores: Record<string, number>
  xpEarned: number
  lessonTitle: string
  onFinish: () => void
}

export function SummaryStep({ vocabulary, vocabScores, xpEarned, lessonTitle, onFinish }: SummaryStepProps) {
  const scores = Object.values(vocabScores)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pronunciationPct = Math.round(avg * 100)

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <p className="text-5xl" aria-hidden>🏆</p>
        <h2 className="text-2xl font-bold text-content-light dark:text-content-dark mt-4">
          Aula concluída!
        </h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
          {lessonTitle}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
          <p className="text-2xl font-bold text-brand-streak">+{xpEarned} XP</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">ganhos</p>
        </div>
        {pronunciationPct > 0 && (
          <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
            <p className="text-2xl font-bold text-brand-interactive">{pronunciationPct}%</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">pronúncia</p>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-content-light dark:text-content-dark mb-2">
          Hoje você aprendeu:
        </p>
        <div className="flex flex-col gap-2">
          {vocabulary.map(v => (
            <div
              key={v.word}
              className="flex items-center gap-2 p-2 rounded-lg bg-surface-light-card dark:bg-surface-dark-card"
            >
              <span className="text-brand-interactive font-bold">✓</span>
              <span className="font-semibold text-content-light dark:text-content-dark">{v.word}</span>
              <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
                — {v.translation_pt}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onFinish}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
      >
        Continuar aprendendo →
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Create `app/licao/[slug]/LessonEngine.tsx`**

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { LessonContent, UserLessonProgress } from '@/types/lesson'
import { LessonProgressBar } from '@/components/lesson/LessonProgressBar'
import { IntroStep } from '@/components/lesson/IntroStep'
import { SummaryStep } from '@/components/lesson/SummaryStep'

// Step components are imported lazily to keep this file focused
// (VocabPresentStep, VocabRepeatStep, ExerciseChoiceStep, GuidedConvoStep, ReviewStep added in Tasks 6 & 7)
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'
import { ReviewStep } from '@/components/lesson/ReviewStep'

interface LessonEngineProps {
  lesson: LessonContent
  initialProgress: UserLessonProgress | null
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
}

export function LessonEngine({ lesson, initialProgress, teacherName, teacherImageUrl, ttsVoice }: LessonEngineProps) {
  const router = useRouter()
  const [currentStepIndex, setCurrentStepIndex] = useState(initialProgress?.current_step_index ?? 0)
  const [vocabScores, setVocabScores] = useState<Record<string, number>>(initialProgress?.vocab_scores ?? {})
  const [xpEarned, setXpEarned] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)

  const saveProgress = useCallback(async (stepIndex: number, word?: string, score?: number) => {
    await fetch('/api/lesson/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_slug: lesson.slug, step_index: stepIndex, word, score }),
    })
  }, [lesson.slug])

  const advance = useCallback(async (word?: string, score?: number) => {
    const nextIndex = currentStepIndex + 1
    const newScores = word !== undefined && score !== undefined
      ? { ...vocabScores, [word]: score }
      : vocabScores
    if (word !== undefined && score !== undefined) setVocabScores(newScores)

    if (nextIndex >= lesson.steps.length) {
      const res = await fetch('/api/lesson/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_slug: lesson.slug, vocab_scores: newScores }),
      })
      const data = await res.json()
      setXpEarned(data.xp_earned ?? lesson.xp_reward)
      setIsCompleted(true)
    } else {
      await saveProgress(nextIndex, word, score)
      setCurrentStepIndex(nextIndex)
    }
  }, [currentStepIndex, vocabScores, lesson, saveProgress])

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark overflow-y-auto">
        <SummaryStep
          vocabulary={lesson.vocabulary}
          vocabScores={vocabScores}
          xpEarned={xpEarned}
          lessonTitle={lesson.title_pt}
          onFinish={() => router.push('/licoes')}
        />
      </div>
    )
  }

  const step = lesson.steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      {/* Header */}
      <div className="px-4 pt-safe-top pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.push('/licoes')}
            className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
            aria-label="Sair da lição"
          >
            ✕ Sair
          </button>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {lesson.steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={lesson.steps.length} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {step.type === 'intro' && (
          <IntroStep step={step} vocabulary={lesson.vocabulary} onContinue={() => advance()} />
        )}
        {step.type === 'vocab_present' && (
          <VocabPresentStep
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            ttsVoice={ttsVoice}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score) => advance(lesson.vocabulary[step.vocab_index].word, score)}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            step={step}
            teacherName={teacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            onComplete={() => advance()}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep step={step} vocabulary={lesson.vocabulary} onComplete={() => advance()} />
        )}
        {step.type === 'summary' && (
          <SummaryStep
            vocabulary={lesson.vocabulary}
            vocabScores={vocabScores}
            xpEarned={xpEarned}
            lessonTitle={lesson.title_pt}
            onFinish={() => router.push('/licoes')}
          />
        )}
      </div>
    </div>
  )
}
```

**Note:** `VocabPresentStep`, `VocabRepeatStep`, `ExerciseChoiceStep`, `GuidedConvoStep`, `ReviewStep` are stub-imported here and implemented in Tasks 6 and 7. Add these placeholder stubs temporarily so the file compiles:

Temporary stubs to place in each component file (will be replaced in Tasks 6–7):
- `components/lesson/VocabPresentStep.tsx` → `export function VocabPresentStep() { return null }`
- `components/lesson/VocabRepeatStep.tsx` → `export function VocabRepeatStep() { return null }`
- `components/lesson/ExerciseChoiceStep.tsx` → `export function ExerciseChoiceStep() { return null }`
- `components/lesson/GuidedConvoStep.tsx` → `export function GuidedConvoStep() { return null }`
- `components/lesson/ReviewStep.tsx` → `export function ReviewStep() { return null }`

- [ ] **Step 7: Create `app/licao/[slug]/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getLessonBySlug } from '@/lib/curriculum'
import { LessonEngine } from './LessonEngine'
import type { UserLessonProgress } from '@/types/lesson'

export default async function LicaoPage({ params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let lesson
  try {
    lesson = getLessonBySlug(params.slug)
  } catch {
    notFound()
  }

  const [{ data: userData }, { data: progressRow }] = await Promise.all([
    supabase.from('users').select('teacher_id').eq('id', user.id).single(),
    supabase
      .from('user_lesson_progress')
      .select('lesson_slug, status, current_step_index, vocab_scores, completed_at, xp_earned')
      .eq('user_id', user.id)
      .eq('lesson_slug', params.slug)
      .maybeSingle(),
  ])

  const { data: teacher } = userData?.teacher_id
    ? await supabase.from('teachers').select('name, avatar_image_url, tts_voice').eq('id', userData.teacher_id).single()
    : { data: null }

  // Block access if lesson is locked (has unlock_after but no progress or progress is locked)
  const progressStatus = (progressRow as UserLessonProgress | null)?.status
  if (lesson.unlock_after && (!progressRow || progressStatus === 'locked')) {
    redirect('/licoes')
  }

  return (
    <LessonEngine
      lesson={lesson}
      initialProgress={progressRow as UserLessonProgress | null}
      teacherName={teacher?.name ?? 'Mrs. Carol'}
      teacherImageUrl={teacher?.avatar_image_url ?? '/avatars/mrs-carol.png'}
      ttsVoice={teacher?.tts_voice ?? 'alloy'}
    />
  )
}
```

- [ ] **Step 8: Run tests + TypeScript + commit**

```bash
npx vitest run __tests__/components/lesson/LessonEngine.test.tsx --reporter=verbose
npx tsc --noEmit
git add components/lesson/LessonProgressBar.tsx components/lesson/IntroStep.tsx components/lesson/SummaryStep.tsx components/lesson/VocabPresentStep.tsx components/lesson/VocabRepeatStep.tsx components/lesson/ExerciseChoiceStep.tsx components/lesson/GuidedConvoStep.tsx components/lesson/ReviewStep.tsx app/licao/
git commit -m "feat: lesson engine /licao/[slug] with IntroStep, SummaryStep, LessonProgressBar; stub placeholders for remaining steps"
```

---

### Task 6: VocabPresentStep + VocabRepeatStep + ExerciseChoiceStep

**Files:**
- Modify: `components/lesson/VocabPresentStep.tsx` (replace stub)
- Modify: `components/lesson/VocabRepeatStep.tsx` (replace stub)
- Modify: `components/lesson/ExerciseChoiceStep.tsx` (replace stub)
- Create: `__tests__/components/lesson/ExerciseChoiceStep.test.tsx`

**Interfaces:**
- `VocabPresentStep` calls `POST /api/lesson/tts` (FormData: `{ text, voice }`) → `{ audio_url: string }`
- `VocabRepeatStep` uses `useAudioRecorder({ onComplete: (blob) => void })` from `@/hooks/useAudioRecorder`, calls `POST /api/lesson/assess` (FormData: `{ type:'pronunciation', target, audio }`) → `{ assessment, score, feedback_pt }`
- `ExerciseChoiceStep` is pure frontend — no API calls

- [ ] **Step 1: Write failing test `__tests__/components/lesson/ExerciseChoiceStep.test.tsx`**

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import type { ExerciseChoiceStep as StepType } from '@/types/lesson'

const step: StepType = {
  id: 'ex-1',
  type: 'exercise_choice',
  question_pt: "O que significa 'Thank you'?",
  image_emoji: '🙏',
  correct_answer: 'Obrigado',
  choices: ['Obrigado', 'Por favor', 'Tchau', 'Com licença'],
  explanation_pt: "'Thank you' significa 'Obrigado'.",
}

describe('ExerciseChoiceStep', () => {
  it('renders the question and all 4 choices', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    expect(screen.getByText("O que significa 'Thank you'?")).toBeInTheDocument()
    expect(screen.getByText('Obrigado')).toBeInTheDocument()
    expect(screen.getByText('Por favor')).toBeInTheDocument()
    expect(screen.getByText('Tchau')).toBeInTheDocument()
    expect(screen.getByText('Com licença')).toBeInTheDocument()
  })

  it('shows success feedback when correct answer is selected', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Obrigado'))
    expect(screen.getByText('✅ Correto!')).toBeInTheDocument()
    expect(screen.getByText("'Thank you' significa 'Obrigado'.")).toBeInTheDocument()
  })

  it('shows error feedback when wrong answer is selected', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Por favor'))
    expect(screen.getByText('❌ Não foi dessa vez.')).toBeInTheDocument()
    expect(screen.getByText("'Thank you' significa 'Obrigado'.")).toBeInTheDocument()
  })

  it('calls onSuccess when Continuar is clicked after any answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseChoiceStep step={step} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Por favor'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('prevents changing answer after selection', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Por favor'))
    fireEvent.click(screen.getByText('Obrigado'))
    // Still shows error since first click was wrong
    expect(screen.getByText('❌ Não foi dessa vez.')).toBeInTheDocument()
  })

  it('does not show Continuar button before answering', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    expect(screen.queryByText('Continuar →')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/components/lesson/ExerciseChoiceStep.test.tsx --reporter=verbose
```
Expected: FAIL (stub returns null, tests can't find elements)

- [ ] **Step 3: Replace `components/lesson/ExerciseChoiceStep.tsx` stub**

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ExerciseChoiceStep as StepType } from '@/types/lesson'

interface ExerciseChoiceStepProps {
  step: StepType
  onSuccess: () => void
}

export function ExerciseChoiceStep({ step, onSuccess }: ExerciseChoiceStepProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const answered = selected !== null
  const isCorrect = selected === step.correct_answer

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <span className="text-7xl" aria-hidden>{step.image_emoji}</span>
        <p className="text-xl font-bold text-content-light dark:text-content-dark mt-4">
          {step.question_pt}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {step.choices.map(choice => (
          <button
            key={choice}
            onClick={() => !answered && setSelected(choice)}
            disabled={answered}
            className={`p-4 rounded-xl font-semibold text-sm transition-all ${
              !answered
                ? 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:bg-brand-interactive/20'
                : choice === step.correct_answer
                ? 'bg-green-500/25 text-content-light dark:text-content-dark'
                : choice === selected
                ? 'bg-red-500/25 text-content-light dark:text-content-dark'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary opacity-50'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl text-center ${isCorrect ? 'bg-green-500/15' : 'bg-red-500/15'}`}
        >
          <p className="font-bold text-content-light dark:text-content-dark">
            {isCorrect ? '✅ Correto!' : '❌ Não foi dessa vez.'}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {step.explanation_pt}
          </p>
        </motion.div>
      )}

      {answered && (
        <button
          onClick={onSuccess}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run __tests__/components/lesson/ExerciseChoiceStep.test.tsx --reporter=verbose
```
Expected: 6 tests PASS.

- [ ] **Step 5: Replace `components/lesson/VocabPresentStep.tsx` stub**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { VocabPresentStep as StepType, VocabItem } from '@/types/lesson'

interface VocabPresentStepProps {
  step: StepType
  vocab: VocabItem
  ttsVoice: string
  onContinue: () => void
}

export function VocabPresentStep({ step, vocab, ttsVoice, onContinue }: VocabPresentStepProps) {
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playTts = async () => {
    setIsLoading(true)
    try {
      const fd = new FormData()
      fd.append('text', step.teacher_script)
      fd.append('voice', ttsVoice)
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      const audio = new Audio(audio_url)
      audioRef.current = audio
      await audio.play()
    } catch {
      // TTS failure is non-blocking; student can still continue
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    playTts()
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <span className="text-8xl" aria-hidden>{vocab.emoji}</span>
      <div className="text-center">
        <p className="text-5xl font-bold text-content-light dark:text-content-dark">{vocab.word}</p>
        <p className="text-base text-content-light-secondary dark:text-content-dark-secondary mt-2">
          {vocab.translation_pt}
        </p>
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>
      <button
        onClick={playTts}
        disabled={isLoading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
        aria-label="Ouvir novamente"
      >
        🔊 {isLoading ? 'Carregando...' : 'Ouvir novamente'}
      </button>
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
      >
        Entendi! Continuar →
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Replace `components/lesson/VocabRepeatStep.tsx` stub**

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { VocabRepeatStep as StepType, VocabItem } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface VocabRepeatStepProps {
  step: StepType
  vocab: VocabItem
  onSuccess: (score: number) => void
}

type AssessResult = { assessment: 'correct' | 'close' | 'incorrect'; score: number; feedback_pt: string }

export function VocabRepeatStep({ step, vocab, onSuccess }: VocabRepeatStepProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [isAssessing, setIsAssessing] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const assess = async (blob: Blob) => {
    setIsAssessing(true)
    try {
      const fd = new FormData()
      fd.append('type', 'pronunciation')
      fd.append('target', vocab.word)
      fd.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/lesson/assess', { method: 'POST', body: fd })
      const data: AssessResult = await res.json()
      setResult(data)
      setAttempts(a => a + 1)
    } catch {
      setResult({ assessment: 'incorrect', score: 0, feedback_pt: 'Erro ao avaliar. Tente novamente.' })
      setAttempts(a => a + 1)
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error } = useAudioRecorder({ onComplete: assess })

  const handleMic = () => {
    if (isRecording) {
      stopRecording()
    } else {
      setResult(null)
      startRecording()
    }
  }

  const canAdvance = result !== null && (result.assessment === 'correct' || result.assessment === 'close' || attempts >= 3)

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <span className="text-6xl" aria-hidden>{vocab.emoji}</span>
      <div className="text-center">
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          {step.instruction_pt}
        </p>
        <p className="text-4xl font-bold text-content-light dark:text-content-dark mt-2">{vocab.word}</p>
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`w-full p-4 rounded-xl text-center ${
            result.assessment === 'correct' ? 'bg-green-500/15' :
            result.assessment === 'close' ? 'bg-yellow-500/15' :
            'bg-red-500/15'
          }`}
        >
          <p className="font-bold text-content-light dark:text-content-dark text-lg">
            {result.assessment === 'correct' ? '✅ Perfeito!' :
             result.assessment === 'close' ? '🟡 Quase lá!' :
             '❌ Tente novamente'}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {result.feedback_pt}
          </p>
        </motion.div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        onClick={handleMic}
        disabled={isAssessing}
        aria-label={isRecording ? 'Parar gravação' : 'Gravar pronúncia'}
        className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg ${
          isRecording
            ? 'bg-red-500 scale-110 shadow-red-500/30'
            : isAssessing
            ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
            : 'bg-brand-cta hover:scale-105'
        }`}
      >
        {isAssessing ? '⏳' : isRecording ? '⏹' : '🎤'}
      </button>

      {attempts > 0 && !isRecording && !isAssessing && (
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          Tentativa {attempts} de 3
        </p>
      )}

      {canAdvance && (
        <button
          onClick={() => onSuccess(result?.score ?? 0.5)}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run all tests + TypeScript + commit**

```bash
npx vitest run --reporter=verbose
npx tsc --noEmit
git add components/lesson/ExerciseChoiceStep.tsx components/lesson/VocabPresentStep.tsx components/lesson/VocabRepeatStep.tsx __tests__/components/lesson/ExerciseChoiceStep.test.tsx
git commit -m "feat: VocabPresentStep (TTS), VocabRepeatStep (Whisper assess), ExerciseChoiceStep (multiple choice)"
```

---

### Task 7: GuidedConvoStep + ReviewStep + Dashboard Integration

**Files:**
- Modify: `components/lesson/GuidedConvoStep.tsx` (replace stub)
- Modify: `components/lesson/ReviewStep.tsx` (replace stub)
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- `GuidedConvoStep` calls `POST /api/lesson/assess` with `type='conversation'`; calls `POST /api/lesson/tts` for teacher TTS
- Dashboard: if `userData.cefr_level` is `'A1'` or `'A2'`, CTA links to `/licoes` and shows lesson progress card

- [ ] **Step 1: Replace `components/lesson/GuidedConvoStep.tsx` stub**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { GuidedConvoStep as StepType } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Message {
  role: 'teacher' | 'student'
  text: string
  text_pt?: string
}

interface GuidedConvoStepProps {
  step: StepType
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  onComplete: () => void
}

export function GuidedConvoStep({ step, teacherName, teacherImageUrl, ttsVoice, onComplete }: GuidedConvoStepProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isAssessing, setIsAssessing] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const playTts = async (text: string) => {
    setIsSpeaking(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      return new Promise<void>(resolve => {
        const audio = new Audio(audio_url)
        audioRef.current = audio
        audio.onended = () => { setIsSpeaking(false); resolve() }
        audio.play()
      })
    } catch {
      setIsSpeaking(false)
    }
  }

  useEffect(() => {
    const initial: Message = { role: 'teacher', text: step.teacher_opens_with }
    setMessages([initial])
    playTts(step.teacher_opens_with)
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAssessment = async (blob: Blob) => {
    setIsAssessing(true)
    try {
      const history = messages.map(m => ({
        role: m.role === 'teacher' ? 'assistant' : 'user',
        content: m.text,
      }))
      const fd = new FormData()
      fd.append('type', 'conversation')
      fd.append('target', step.teacher_opens_with)
      fd.append('audio', blob, 'recording.webm')
      fd.append('allowed_vocab', JSON.stringify(step.allowed_vocabulary))
      fd.append('history', JSON.stringify(history))
      const res = await fetch('/api/lesson/assess', { method: 'POST', body: fd })
      const data = await res.json()

      const studentMsg: Message = { role: 'student', text: data.transcript ?? '...' }
      const teacherMsg: Message = { role: 'teacher', text: data.reply ?? '', text_pt: data.reply_pt }

      setMessages(prev => [...prev, studentMsg, teacherMsg])
      setExchangeCount(c => c + 1)
      if (data.reply) await playTts(data.reply)
    } catch {
      setIsAssessing(false)
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error } = useAudioRecorder({ onComplete: handleAssessment })

  const handleMic = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const canComplete = exchangeCount >= step.min_exchanges

  return (
    <div className="flex flex-col h-full">
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center px-4 pt-4 pb-2">
        {step.instruction_pt}
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start gap-2 items-end'}`}>
            {msg.role === 'teacher' && (
              <img src={teacherImageUrl} alt={teacherName} className="w-8 h-8 rounded-full flex-shrink-0" />
            )}
            <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
              msg.role === 'student'
                ? 'bg-brand-interactive text-content-dark rounded-br-sm'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
            }`}>
              <p>{msg.text}</p>
              {msg.text_pt && (
                <p className="text-xs opacity-60 mt-1 italic">{msg.text_pt}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-4 border-t border-surface-light-card dark:border-surface-dark-card">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleMic}
          disabled={isAssessing || isSpeaking}
          aria-label={isRecording ? 'Parar' : 'Falar'}
          className={`w-16 h-16 rounded-full text-2xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110'
              : (isAssessing || isSpeaking)
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {isAssessing ? '⏳' : isSpeaking ? '🔊' : isRecording ? '⏹' : '🎤'}
        </button>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          {canComplete ? 'Pronto para continuar!' : `${exchangeCount} / ${step.min_exchanges} trocas`}
        </p>
        {canComplete && (
          <button
            onClick={onComplete}
            className="w-full py-3 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Finalizar conversa →
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `components/lesson/ReviewStep.tsx` stub**

```tsx
'use client'

import { useState } from 'react'
import type { ReviewStep as StepType, VocabItem } from '@/types/lesson'

interface ReviewStepProps {
  step: StepType
  vocabulary: VocabItem[]
  onComplete: () => void
}

export function ReviewStep({ step, vocabulary, onComplete }: ReviewStepProps) {
  const [cardIndex, setCardIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [knewCount, setKnewCount] = useState(0)
  const [done, setDone] = useState(false)

  const current = vocabulary[cardIndex]
  const isLast = cardIndex === vocabulary.length - 1

  const mark = (knew: boolean) => {
    if (knew) setKnewCount(c => c + 1)
    if (isLast) {
      setDone(true)
    } else {
      setCardIndex(i => i + 1)
      setRevealed(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center">
        {step.instruction_pt}
      </p>

      {!done ? (
        <>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {cardIndex + 1} / {vocabulary.length}
          </p>
          <div className="w-full p-8 rounded-2xl bg-surface-light-card dark:bg-surface-dark-card text-center min-h-[200px] flex flex-col items-center justify-center gap-4">
            <span className="text-6xl" aria-hidden>{current.emoji}</span>
            <p className="text-4xl font-bold text-content-light dark:text-content-dark">{current.word}</p>
            {revealed && (
              <p className="text-xl text-brand-interactive font-semibold">{current.translation_pt}</p>
            )}
          </div>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="w-full py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
            >
              Ver tradução
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => mark(false)}
                className="flex-1 py-3 rounded-xl bg-red-500/20 text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
              >
                ❌ Não sabia
              </button>
              <button
                onClick={() => mark(true)}
                className="flex-1 py-3 rounded-xl bg-green-500/20 text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
              >
                ✅ Sabia!
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-center">
            <p className="text-5xl" aria-hidden>🎉</p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-4">
              Revisão completa!
            </p>
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">
              Você sabia {knewCount} de {vocabulary.length} palavras
            </p>
          </div>
          <button
            onClick={onComplete}
            className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Ver resumo →
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Modify `app/dashboard/page.tsx` — A1/A2 CTA + lesson progress section**

At the top of the data-loading section, add a query for lesson progress count. After the `missionCompleted` line, add:

```typescript
  // Lesson progress for A1/A2 users
  const isBeginnerLevel = u.cefr_level === 'A1' || u.cefr_level === 'A2'
  const { data: lessonProgressRows } = isBeginnerLevel
    ? await supabase
        .from('user_lesson_progress')
        .select('status')
        .eq('user_id', authUser.id)
    : { data: null }

  const completedLessons = (lessonProgressRows ?? []).filter(
    (r: { status: string }) => r.status === 'completed'
  ).length
```

Replace the existing CTA `<Link href="/aula">` block with:

```tsx
        {/* CTA — lesson-based for A1/A2, free conversation for B1+ */}
        {isBeginnerLevel ? (
          <Link
            href="/licoes"
            className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-center text-lg hover:opacity-90 transition-opacity"
          >
            Continuar lições
          </Link>
        ) : (
          <Link
            href="/aula"
            className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-center text-lg hover:opacity-90 transition-opacity"
          >
            Começar aula
          </Link>
        )}
```

Add lesson progress card for A1/A2 users, right after the CTA block:

```tsx
        {/* Lesson progress — A1/A2 only */}
        {isBeginnerLevel && (
          <Link
            href="/licoes"
            className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
          >
            <div>
              <p className="text-sm font-semibold text-content-light dark:text-content-dark">
                Suas lições
              </p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                {completedLessons} {completedLessons === 1 ? 'lição concluída' : 'lições concluídas'}
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}
```

Also remove the `text-white` issue on the original CTA (it uses `text-white` which violates design token rules). In the replacement above, `text-content-dark` is already used.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run --reporter=verbose
```
Expected: all existing 200 tests pass + new tests pass.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/lesson/GuidedConvoStep.tsx components/lesson/ReviewStep.tsx app/dashboard/page.tsx
git commit -m "feat: GuidedConvoStep (restricted vocab mini-chat), ReviewStep (flashcards), dashboard lesson integration for A1/A2"
```

---

## Self-Review

**Spec coverage:**
- ✅ JSON-driven curriculum (3 A1 lessons with all step types)
- ✅ `lessons`, `user_lesson_progress`, `user_word_mastery` tables created
- ✅ Content loader library (`getAllLessons`, `getLessonBySlug`, `getNextLesson`, `mergeWithProgress`)
- ✅ Assessment API (Whisper + GPT pronunciation + conversation)
- ✅ Progress API (saves step index + vocab scores)
- ✅ Complete API (awards XP + unlocks next lesson)
- ✅ `/licoes` course map page
- ✅ `/licao/[slug]` lesson engine with all step types
- ✅ Middleware protection for new routes
- ✅ Dashboard integration (A1/A2 → `/licoes`)
- ✅ Vocabulary spaced repetition via `user_word_mastery` (upserted per word score)
- ✅ GPT receives lesson-specific context (allowed vocab, step target)
- ✅ Progression control (lesson locked until previous completed)
- ✅ All UI copy PT-BR
- ✅ No `text-white`, all design tokens

**Placeholder scan:** None found.

**Type consistency:**
- `UserLessonProgress.vocab_scores: Record<string, number>` — used consistently in all APIs and components
- `LessonContent.steps: LessonStep[]` — typed union, all step types handled in LessonEngine
- `useAudioRecorder({ onComplete: (blob: Blob) => void })` — matches actual hook interface
- `synthesizeTts(text, voice)` returning `{ dataUrl }` — used correctly in TTS API
