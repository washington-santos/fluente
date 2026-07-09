# Pedagogical Course Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the English Fluent AI teacher into a pedagogically structured course with 6 CEFR stages (A1→C2), 4-block session anatomy, error-context injection, level-adaptive intervention timing, vocabulary spaced repetition, and a progress memory card on the dashboard.

**Architecture:** Five sequential tasks — config expansion, conversation route overhaul, vocabulary DB + extraction, vocabulary review page, and progress memory. All tasks share the existing `conversation/route.ts` + Supabase SSR patterns. No new external services. The vocabulary table follows the same spaced repetition pattern as `errors_log`.

**Tech Stack:** Next.js 14 App Router, Supabase SSR (`createSupabaseServer`), TypeScript, Tailwind, OpenAI GPT-4o-mini, Vitest + @testing-library/react.

## Global Constraints

- All UI copy is Brazilian Portuguese; English only in AI system prompt content and AI-generated text
- No new npm packages
- `createSupabaseServer()` for all DB reads/writes in API routes; `createSupabaseAdmin()` ONLY for audio storage (unchanged)
- Tailwind tokens only: `bg-surface-light`, `bg-surface-dark`, `bg-surface-light-card`, `bg-surface-dark-card`, `text-content-light`, `text-content-light-secondary`, `text-content-dark`, `text-content-dark-secondary`, `bg-brand-cta`, `bg-brand-interactive`, `bg-brand-streak` — no raw hex colors
- RLS must be enabled on all new tables
- Test files for API routes: `// @vitest-environment node` at the very top
- Base commit: `cc38c9e`

---

## File Map

| File | Action | Task |
|------|--------|------|
| `lib/topics.ts` | Modify — add C1/C2 topics (8 each) | 1 |
| `lib/missions.ts` | Modify — add C1/C2 missions (3 each) | 1 |
| `__tests__/lib/topics.test.ts` | Modify — add C1/C2 cycling tests | 1 |
| `__tests__/lib/missions.test.ts` | Modify — add C1/C2 cycling tests | 1 |
| `app/api/conversation/route.ts` | Modify — add error context fetch, anatomy block, intervention timing, new_words extraction + upsert | 2 + 3 |
| `types/index.ts` | Modify — update `VocabularyItem` fields, add `new_words` to `ConversationResponse` | 2 + 3 |
| `supabase/migrations/20260703000001_vocab_log.sql` | Create — `vocab_log` table with RLS | 3 |
| `app/api/vocab/route.ts` | Create — GET (due cards) + PATCH (spaced rep) | 4 |
| `components/dashboard/VocabDeck.tsx` | Create — flashcard UI for vocabulary | 4 |
| `app/dashboard/vocabulario/page.tsx` | Create — vocabulary review page | 4 |
| `app/dashboard/page.tsx` | Modify — vocab link + progress memory card | 5 |
| `components/dashboard/ProgressMemoryCard.tsx` | Create — "este mês você corrigiu X erros" card | 5 |
| `__tests__/app/api/conversation.test.ts` | Modify — assert new_words in response, error context fetch mock | 3 |
| `__tests__/app/api/vocab.test.ts` | Create — GET + PATCH tests | 4 |
| `__tests__/components/dashboard/VocabDeck.test.tsx` | Create — component tests | 4 |
| `__tests__/components/dashboard/ProgressMemoryCard.test.tsx` | Create — component tests | 5 |

---

### Task 1: C1/C2 Config — Topics and Missions

**Files:**
- Modify: `lib/topics.ts`
- Modify: `lib/missions.ts`
- Modify: `__tests__/lib/topics.test.ts`
- Modify: `__tests__/lib/missions.test.ts`

**Interfaces:**
- Consumes: existing `Topic`, `Mission`, `CefrLevel` types
- Produces: `TOPICS_BY_LEVEL` and `MISSIONS_BY_LEVEL` with C1/C2 entries; `pickTopic` and `getMissionForDate` now work for all 6 levels

- [ ] **Step 1: Add C1/C2 tests first**

In `__tests__/lib/topics.test.ts`, append:
```typescript
it('pickTopic returns a C1 topic', () => {
  const topic = pickTopic('C1', 0)
  expect(topic?.key).toBe('job-interview')
})

it('pickTopic returns a C2 topic', () => {
  const topic = pickTopic('C2', 0)
  expect(topic?.key).toBe('native-humor')
})
```

In `__tests__/lib/missions.test.ts`, append:
```typescript
it('getMissionForDate returns a C1 mission', () => {
  const m = getMissionForDate('C1', '2026-07-01')
  expect(m.key).toBe('c1-interview')
})

it('getMissionForDate returns a C2 mission', () => {
  const m = getMissionForDate('C2', '2026-07-02')
  expect(m.key).toBe('c2-debate')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run __tests__/lib/topics.test.ts __tests__/lib/missions.test.ts
```
Expected: FAIL — "C1 topics not defined"

- [ ] **Step 3: Add C1/C2 entries to `lib/topics.ts`**

Append to the `TOPICS_BY_LEVEL` object before the closing `}`:
```typescript
  C1: [
    { key: 'job-interview',       labelPt: 'Entrevista de emprego',    promptEn: 'role-play a professional job interview for a position in your field, using structured answers and formal register' },
    { key: 'negotiation',         labelPt: 'Negociação',               promptEn: 'simulate a business negotiation: setting terms, making concessions, and reaching agreement professionally' },
    { key: 'ted-talk',            labelPt: 'Análise crítica',          promptEn: 'summarize and critically analyze the arguments from a talk, documentary, or article you have engaged with recently' },
    { key: 'abstract-concepts',   labelPt: 'Conceitos abstratos',      promptEn: 'discuss abstract concepts like justice, identity, or success with nuance, counterarguments, and concrete examples' },
    { key: 'idioms',              labelPt: 'Expressões idiomáticas',   promptEn: 'use and explain English idioms, fixed phrases, and collocations naturally in the flow of conversation' },
    { key: 'meeting-simulation',  labelPt: 'Reunião de trabalho',      promptEn: 'conduct a full work meeting simulation covering agenda, project updates, problem-solving, and action items' },
    { key: 'persuasion',          labelPt: 'Argumento persuasivo',     promptEn: 'construct and defend a persuasive argument on a controversial topic using evidence, concessions, and rhetoric' },
    { key: 'storytelling',        labelPt: 'Narrativa avançada',       promptEn: 'tell a personal story with full narrative structure: setup, tension, climax, resolution, and reflective closing' },
  ],
  C2: [
    { key: 'native-humor',         labelPt: 'Humor e ironia',           promptEn: 'discuss jokes, sarcasm, wordplay, and irony in American and British culture and why they resonate or fail across cultures' },
    { key: 'literature',           labelPt: 'Literatura em inglês',     promptEn: 'analyze a passage, theme, or character from an English-language novel, poem, or film with literary vocabulary' },
    { key: 'cultural-reference',   labelPt: 'Referências culturais',    promptEn: 'explore the pop culture references, historical allusions, and in-jokes that native speakers use without explanation' },
    { key: 'register-shift',       labelPt: 'Registro formal vs casual',promptEn: 'fluidly switch between formal prose, casual conversation, and colloquial slang within a single exchange' },
    { key: 'accents-dialects',     labelPt: 'Sotaques e dialetos',      promptEn: 'discuss regional accents, dialects, and sociolects in English and what they reveal about identity and class' },
    { key: 'philosophy',           labelPt: 'Filosofia e pensamento',   promptEn: 'engage in a Socratic dialogue on a philosophical question without simplifying — push definitions, explore contradictions' },
    { key: 'spontaneous-debate',   labelPt: 'Debate espontâneo',        promptEn: 'defend an assigned position (agree or disagree) without preparation, pivoting dynamically as arguments evolve' },
    { key: 'advanced-vocabulary',  labelPt: 'Vocabulário sofisticado',  promptEn: 'use advanced vocabulary precisely: choose the mot juste, distinguish near-synonyms, explain connotations and register' },
  ],
```

- [ ] **Step 4: Add C1/C2 entries to `lib/missions.ts`**

Append to `MISSIONS_BY_LEVEL`:
```typescript
  C1: [
    { key: 'c1-interview', titlePt: 'Entrevista simulada',    descriptionPt: 'Conduza uma simulação de entrevista de emprego em inglês com naturalidade e linguagem formal.', minUserTurns: 8 },
    { key: 'c1-meeting',   titlePt: 'Reunião de trabalho',    descriptionPt: 'Conduza uma reunião simulada com agenda, atualizações e encerramento com ação definida.', minUserTurns: 8 },
    { key: 'c1-persuade',  titlePt: 'Argumento persuasivo',   descriptionPt: 'Defenda uma posição sobre um tema polêmico com argumentos estruturados e exemplos concretos.', minUserTurns: 7 },
  ],
  C2: [
    { key: 'c2-story',   titlePt: 'Narrativa nativa',    descriptionPt: 'Conte uma história com estrutura narrativa completa usando expressões idiomáticas naturalmente.', minUserTurns: 8 },
    { key: 'c2-debate',  titlePt: 'Debate de alto nível', descriptionPt: 'Debata um tema filosófico ou cultural com profundidade e nuance por pelo menos 10 falas.', minUserTurns: 10 },
    { key: 'c2-register',titlePt: 'Mudança de registro',  descriptionPt: 'Demonstre fluência em pelo menos 3 registros diferentes (formal, casual, humor) numa única conversa.', minUserTurns: 8 },
  ],
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run __tests__/lib/topics.test.ts __tests__/lib/missions.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: TypeScript check**

```
npx tsc --noEmit
```
Expected: clean

- [ ] **Step 7: Commit**

```
git add lib/topics.ts lib/missions.ts __tests__/lib/topics.test.ts __tests__/lib/missions.test.ts
git commit -m "feat: add C1/C2 topics (8 each) and missions (3 each) to course config"
```

---

### Task 2: Session Anatomy — System Prompt Overhaul

**Files:**
- Modify: `app/api/conversation/route.ts`
- Modify: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- Consumes: `supabase.from('errors_log')` for top recurring error
- Produces: enriched system prompt with 4-block anatomy, error context, and level-adaptive intervention timing

- [ ] **Step 1: Write failing tests**

In `__tests__/app/api/conversation.test.ts`, find the existing Supabase mock setup. The mock currently handles multiple `.from()` calls. Add a branch for `errors_log` that returns a recurring error.

Read the file first to find the exact mock structure, then add after the existing mock chains:

In the mock's `.from()` handler, add a case for `'errors_log'` (alongside `'sessions'`, `'messages'`, etc.):
```typescript
if (table === 'errors_log') {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { error_text: 'I goed to school', correct_form: 'I went to school', error_type: 'verb_tense' },
      error: null,
    }),
  }
}
```

Add a new test:
```typescript
it('system prompt includes error context when a recurring error exists', async () => {
  // The mock above returns a recurring error. We just verify the response still succeeds
  // (the prompt content is internal — we verify via the response shape).
  const formData = new FormData()
  formData.append('session_id', 'session-1')
  formData.append('panic_text', 'Hello teacher')
  const req = new Request('http://localhost/api/conversation', { method: 'POST', body: formData })
  const res = await POST(req)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toHaveProperty('text')
  expect(body).toHaveProperty('pronunciation_hint')
})
```

Run: `npx vitest run __tests__/app/api/conversation.test.ts`
Expected: new test PASS (it doesn't test prompt content directly), existing tests still PASS

- [ ] **Step 2: Add error context fetch to `app/api/conversation/route.ts`**

After the line that loads `sessionMemory` (around line 101), add:
```typescript
  // Load top recurring error for error-review block
  const { data: topError } = await supabase
    .from('errors_log')
    .select('error_text, correct_form, error_type')
    .eq('user_id', user.id)
    .is('resolved_at', null)
    .order('seen_count', { ascending: false })
    .limit(1)
    .maybeSingle()
```

- [ ] **Step 3: Build the new prompt blocks and replace the systemPrompt string**

Replace the existing `memoryBlock`, `topicBlock`, and `systemPrompt` construction with:

```typescript
  const memoryBlock = sessionMemory
    ? `\nPrevious session context:\n${sessionMemory.summary}\nTopics covered: ${(sessionMemory.key_topics ?? []).join(', ')}\nAbout the student: ${(sessionMemory.personal_details ?? []).join('; ')}`
    : ''

  const topicData = getTopicByKey(session.topic as string | null)
  const topicBlock = topicData
    ? `\nToday's lesson topic: "${topicData.labelPt}" — ${topicData.promptEn}. Naturally guide the conversation toward this theme while staying responsive to the student.`
    : ''

  const errorContextBlock = topError
    ? `\nRecurring error to revisit: The student frequently makes this mistake — "${topError.error_text}" (correct: "${topError.correct_form}"). Early in the session, naturally reference this and give a brief practice moment.`
    : ''

  const cefrLevel = userData?.cefr_level ?? 'B1'
  const interventionBlock = (cefrLevel === 'A1' || cefrLevel === 'A2')
    ? `\nIntervention timing: Help quickly — if the student hesitates more than a moment, gently supply the missing word or rephrase your question to keep confidence high.`
    : (cefrLevel === 'B1' || cefrLevel === 'B2')
    ? `\nIntervention timing: Let the student work through difficulties before helping. Pause and allow them to self-correct. Only step in if they seem genuinely stuck.`
    : `\nIntervention timing: Only intervene when explicitly asked. Push the student to self-correct and rephrase. Expect near-native fluency and challenge them accordingly.`

  const studentName = userData?.name ?? 'the student'
  const anatomyBlock = `\nSession anatomy — follow this structure:
1. WARM-UP (your first message): Greet ${studentName} by name. Ask one casual question about their day or week.
2. ERROR REVIEW (next 1-2 exchanges): If a recurring error is listed above, naturally revisit it with a short practice moment.
3. NEW CONTENT + PRACTICE (main body): Introduce or reinforce a grammar structure or vocabulary area appropriate for ${cefrLevel} level through natural questions — not explicit drills.
4. FREE CONVERSATION (closing): Converse freely on today's topic. Correct errors naturally within the flow without interrupting the conversation.`

  const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${studentName}
- CEFR level: ${cefrLevel}
${memoryBlock}${topicBlock}${errorContextBlock}${anatomyBlock}${interventionBlock}
Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
When the student's transcript reveals a common Brazilian pronunciation pattern issue (e.g. "th" pronounced as "d" or "t", dropping final "s", wrong word stress, "ed" pronounced as a full syllable), set pronunciation_hint to a single clear tip under 20 words. Otherwise set pronunciation_hint to null.
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.`
```

Note: the `new_words` field is added to the JSON template here but is parsed and stored in Task 3. For now the field simply passes through and is ignored.

- [ ] **Step 4: Run all conversation tests**

```
npx vitest run __tests__/app/api/conversation.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: TypeScript check**

```
npx tsc --noEmit
```
Expected: clean

- [ ] **Step 6: Commit**

```
git add app/api/conversation/route.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: 4-block session anatomy, error-context injection, and level-adaptive intervention timing"
```

---

### Task 3: Vocabulary DB Migration + GPT Extraction

**Files:**
- Create: `supabase/migrations/20260703000001_vocab_log.sql`
- Modify: `app/api/conversation/route.ts` (parse + upsert new_words)
- Modify: `types/index.ts` (update `VocabularyItem`, add `new_words` to `ConversationResponse`)
- Modify: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- Consumes: `parsed.new_words` from GPT JSON (already in template from Task 2)
- Produces: `vocab_log` table rows; `ConversationResponse.new_words: string[] | null` (just the words, not definitions)

- [ ] **Step 1: Create and apply the migration**

Create `supabase/migrations/20260703000001_vocab_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.vocab_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  word          text        NOT NULL,
  definition    text        NOT NULL,
  review_count  integer     NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  next_review_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

ALTER TABLE public.vocab_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vocab_log: own rows" ON public.vocab_log
  FOR ALL USING (auth.uid() = user_id);
```

Apply via Supabase MCP tool (`mcp__plugin_supabase_supabase__apply_migration`).

Verify with `mcp__plugin_supabase_supabase__list_tables` — `vocab_log` must appear.

- [ ] **Step 2: Update `types/index.ts`**

Replace the existing `VocabularyItem` interface:
```typescript
export interface VocabularyItem {
  id: string
  user_id: string
  word: string
  definition: string
  review_count: number
  last_reviewed_at: string | null
  next_review_at: string
  created_at: string
}
```

Add `new_words: string[] | null` to `ConversationResponse`:
```typescript
export interface ConversationResponse {
  text: string
  audio_url: string | null
  video_url: string | null
  had_correction: boolean
  error_report: ErrorReport
  transcript?: string
  pronunciation_hint: string | null
  new_words: string[] | null
}
```

- [ ] **Step 3: Add new_words parsing and upsert to `app/api/conversation/route.ts`**

After the `pronunciationHint` extraction (around line 180), add:
```typescript
  // Parse new_words from GPT response
  const newWordsRaw: Array<{ word: string; definition: string }> = Array.isArray(parsed.new_words)
    ? (parsed.new_words as unknown[]).filter(
        (w): w is { word: string; definition: string } =>
          typeof (w as { word?: unknown }).word === 'string' &&
          typeof (w as { definition?: unknown }).definition === 'string'
      )
    : []
```

After the `errors_log` upsert (after the `if (errorReport.error_detected ...)` block), add:
```typescript
  // Upsert vocabulary words — ignoreDuplicates keeps existing spaced rep state
  if (newWordsRaw.length > 0) {
    const { error: vocabError } = await supabase
      .from('vocab_log')
      .upsert(
        newWordsRaw.map((w) => ({
          user_id: user.id,
          word: w.word.toLowerCase().trim(),
          definition: w.definition.trim(),
        })),
        { onConflict: 'user_id,word', ignoreDuplicates: true }
      )
    if (vocabError) console.error('Vocab log upsert failed:', vocabError.message)
  }
```

Update the `ClaudeOutput` interface at the top of the route:
```typescript
interface ClaudeOutput {
  reply: string
  correction: {
    error_detected: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }
  pronunciation_hint: string | null
  new_words: Array<{ word: string; definition: string }> | null
}
```

Update the catch-block fallback:
```typescript
  } catch {
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null }
  }
```

Update the `response` object to include `new_words`:
```typescript
  const response: ConversationResponse = {
    text: replyText,
    audio_url: audioUrl,
    video_url: videoUrl,
    had_correction: errorReport.error_detected,
    error_report: errorReport,
    transcript,
    pronunciation_hint: pronunciationHint,
    new_words: newWordsRaw.length > 0 ? newWordsRaw.map((w) => w.word) : null,
  }
```

- [ ] **Step 4: Update the conversation test mock to handle vocab_log upsert and assert new_words**

In `__tests__/app/api/conversation.test.ts`, in the Supabase mock's `.from()` handler, add a case for `'vocab_log'`:
```typescript
if (table === 'vocab_log') {
  return {
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
}
```

Update the OpenAI chat mock to return `new_words` in the JSON:
```typescript
// In the mock for openai.chat.completions.create, update the content string:
content: '{"reply":"Hello!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":[{"word":"negotiate","definition":"to discuss terms to reach agreement"}]}'
```

Add assertion to the existing success test:
```typescript
expect(body).toHaveProperty('new_words')
expect(Array.isArray(body.new_words) || body.new_words === null).toBe(true)
```

- [ ] **Step 5: Run conversation tests**

```
npx vitest run __tests__/app/api/conversation.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: TypeScript check**

```
npx tsc --noEmit
```
Expected: clean

- [ ] **Step 7: Commit**

```
git add supabase/migrations/20260703000001_vocab_log.sql app/api/conversation/route.ts types/index.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: vocab_log table and GPT vocabulary extraction per session"
```

---

### Task 4: Vocabulary Flashcard Review Page

**Files:**
- Create: `app/api/vocab/route.ts`
- Create: `components/dashboard/VocabDeck.tsx`
- Create: `app/dashboard/vocabulario/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Create: `__tests__/app/api/vocab.test.ts`
- Create: `__tests__/components/dashboard/VocabDeck.test.tsx`

**Interfaces:**
- Consumes: `vocab_log` table (Task 3)
- Produces: `/dashboard/vocabulario` page accessible from dashboard

- [ ] **Step 1: Write failing API tests**

Create `__tests__/app/api/vocab.test.ts`:
```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/vocab/route'

const mockUser = { id: 'user-1' }
const mockVocabCard = {
  id: 'vocab-1',
  word: 'negotiate',
  definition: 'to discuss terms to reach agreement',
  review_count: 0,
  next_review_at: new Date(Date.now() - 1000).toISOString(),
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'vocab_log') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [mockVocabCard], error: null }),
          update: vi.fn().mockReturnThis(),
          match: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    }),
  }),
}))

describe('GET /api/vocab', () => {
  it('returns due vocab cards', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vocabCards).toHaveLength(1)
    expect(body.vocabCards[0].word).toBe('negotiate')
  })
})

describe('PATCH /api/vocab', () => {
  it('advances review count when knewIt=true', async () => {
    const req = new Request('http://localhost/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId: 'vocab-1', knewIt: true, currentReviewCount: 0 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('resets review count when knewIt=false', async () => {
    const req = new Request('http://localhost/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId: 'vocab-1', knewIt: false, currentReviewCount: 3 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

Run: `npx vitest run __tests__/app/api/vocab.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/vocab/route'"

- [ ] **Step 2: Create `app/api/vocab/route.ts`**

```typescript
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const INTERVAL_DAYS = [1, 3, 7, 14, 30]

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()
  const { data: vocabCards, error } = await supabase
    .from('vocab_log')
    .select('id, word, definition, review_count, next_review_at')
    .eq('user_id', user.id)
    .lte('next_review_at', now)
    .order('next_review_at', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ vocabCards: vocabCards ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { vocabId?: unknown; knewIt?: unknown; currentReviewCount?: unknown }
  const { vocabId, knewIt, currentReviewCount } = body
  if (typeof vocabId !== 'string' || typeof knewIt !== 'boolean' || typeof currentReviewCount !== 'number') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const newCount = knewIt ? Math.min(currentReviewCount + 1, INTERVAL_DAYS.length - 1) : 0
  const daysUntilNext = INTERVAL_DAYS[newCount]
  const nextReviewAt = new Date(Date.now() + daysUntilNext * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('vocab_log')
    .update({
      review_count: newCount,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: nextReviewAt,
    })
    .match({ id: vocabId, user_id: user.id })

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Run API tests to verify they pass**

```
npx vitest run __tests__/app/api/vocab.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 4: Write failing component tests**

Create `__tests__/components/dashboard/VocabDeck.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { VocabDeck } from '@/components/dashboard/VocabDeck'

const mockCards = [
  { id: 'v1', word: 'negotiate', definition: 'to discuss terms to reach agreement', review_count: 0, next_review_at: '' },
  { id: 'v2', word: 'ambiguous', definition: 'open to more than one interpretation', review_count: 1, next_review_at: '' },
]
const mockOnReview = vi.fn().mockResolvedValue(undefined)
const mockOnComplete = vi.fn()

describe('VocabDeck', () => {
  it('shows the first word on front', () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    expect(screen.getByTestId('vocab-front')).toHaveTextContent('negotiate')
  })

  it('reveals definition after clicking Ver definição', () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    expect(screen.getByTestId('vocab-back')).toHaveTextContent('to discuss terms to reach agreement')
  })

  it('calls onReview with knewIt=true when Sabia! is clicked', async () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    expect(mockOnReview).toHaveBeenCalledWith('v1', true, 0)
  })

  it('advances to the next card after review', async () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    await screen.findByText('ambiguous')
  })

  it('shows completion message when all cards are reviewed', async () => {
    const singleCard = [mockCards[0]]
    render(<VocabDeck cards={singleCard} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    await screen.findByTestId('review-complete')
  })
})
```

Run: `npx vitest run __tests__/components/dashboard/VocabDeck.test.tsx`
Expected: FAIL — "Cannot find module"

- [ ] **Step 5: Create `components/dashboard/VocabDeck.tsx`**

```typescript
'use client'

import { useState } from 'react'

interface VocabCard {
  id: string
  word: string
  definition: string
  review_count: number
  next_review_at: string
}

interface VocabDeckProps {
  cards: VocabCard[]
  onReview: (vocabId: string, knewIt: boolean, reviewCount: number) => Promise<void>
  onComplete: () => void
}

export function VocabDeck({ cards, onReview, onComplete }: VocabDeckProps) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)

  const card = cards[index]

  async function handleReview(knewIt: boolean) {
    await onReview(card.id, knewIt, card.review_count)
    const next = index + 1
    if (next >= cards.length) {
      setDone(true)
      onComplete()
    } else {
      setIndex(next)
      setRevealed(false)
    }
  }

  if (done) {
    return (
      <div data-testid="review-complete" className="flex flex-col items-center gap-4 py-12">
        <p className="text-lg font-semibold text-content-light dark:text-content-dark">
          Revisão concluída!
        </p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Todas as palavras foram revisadas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
        {index + 1} de {cards.length}
      </p>

      <div className="rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-6 min-h-[160px] flex flex-col items-center justify-center gap-4">
        <p data-testid="vocab-front" className="text-2xl font-bold text-content-light dark:text-content-dark text-center">
          {card.word}
        </p>

        {revealed && (
          <p data-testid="vocab-back" className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center">
            {card.definition}
          </p>
        )}
      </div>

      {!revealed ? (
        <button
          data-testid="btn-reveal"
          onClick={() => setRevealed(true)}
          className="w-full py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ver definição
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            data-testid="btn-didnt-know"
            onClick={() => handleReview(false)}
            className="flex-1 py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
          >
            Não sabia
          </button>
          <button
            data-testid="btn-knew"
            onClick={() => handleReview(true)}
            className="flex-1 py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Sabia!
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run component tests**

```
npx vitest run __tests__/components/dashboard/VocabDeck.test.tsx
```
Expected: 5 tests PASS

- [ ] **Step 7: Create `app/dashboard/vocabulario/page.tsx`**

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { VocabDeck } from '@/components/dashboard/VocabDeck'
import { ThemeToggle } from '@/components/ThemeToggle'

interface VocabCard {
  id: string
  word: string
  definition: string
  review_count: number
  next_review_at: string
}

export default function VocabularioPage() {
  const router = useRouter()
  const [cards, setCards] = useState<VocabCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vocab')
      .then((r) => r.json())
      .then((data: { vocabCards: VocabCard[] }) => {
        setCards(data.vocabCards ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleReview = useCallback(async (vocabId: string, knewIt: boolean, reviewCount: number) => {
    await fetch('/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId, knewIt, currentReviewCount: reviewCount }),
    })
  }, [])

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Vocabulário
        </h1>

        {loading ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Carregando...
          </p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Nenhuma palavra para revisar agora.
          </p>
        ) : (
          <VocabDeck
            cards={cards}
            onReview={handleReview}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Add vocabulary link to `app/dashboard/page.tsx`**

Add a parallel query for due vocab cards alongside the errors query. Find the errors query block and add after it:
```typescript
  // Load due vocabulary cards count
  const { data: dueVocab } = await supabase
    .from('vocab_log')
    .select('id')
    .eq('user_id', authUser.id)
    .lte('next_review_at', new Date().toISOString())
    .limit(1)
```

Then in the JSX, after the `{/* Flashcard review */}` block, add:
```tsx
        {/* Vocabulary review */}
        {(dueVocab ?? []).length > 0 && (
          <Link
            href="/dashboard/vocabulario"
            className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
          >
            <div>
              <p className="text-sm font-semibold text-content-light dark:text-content-dark">Revisar vocabulário</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
                Palavras novas das últimas aulas
              </p>
            </div>
            <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
          </Link>
        )}
```

- [ ] **Step 9: TypeScript check**

```
npx tsc --noEmit
```
Expected: clean

- [ ] **Step 10: Run all new tests**

```
npx vitest run __tests__/app/api/vocab.test.ts __tests__/components/dashboard/VocabDeck.test.tsx
```
Expected: 8 tests PASS

- [ ] **Step 11: Commit**

```
git add app/api/vocab/route.ts components/dashboard/VocabDeck.tsx app/dashboard/vocabulario/page.tsx app/dashboard/page.tsx __tests__/app/api/vocab.test.ts __tests__/components/dashboard/VocabDeck.test.tsx
git commit -m "feat: vocabulary spaced-repetition review page with API and VocabDeck component"
```

---

### Task 5: Progress Memory Card on Dashboard

**Files:**
- Create: `components/dashboard/ProgressMemoryCard.tsx`
- Modify: `app/dashboard/page.tsx`
- Create: `__tests__/components/dashboard/ProgressMemoryCard.test.tsx`

**Interfaces:**
- Consumes: `errors_log.resolved_at` (existing), `vocab_log.created_at` (Task 3)
- Produces: a card on the dashboard showing "Neste mês você corrigiu X erros e aprendeu Y palavras novas"

- [ ] **Step 1: Write failing component tests**

Create `__tests__/components/dashboard/ProgressMemoryCard.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressMemoryCard } from '@/components/dashboard/ProgressMemoryCard'

describe('ProgressMemoryCard', () => {
  it('shows resolved errors count', () => {
    render(<ProgressMemoryCard resolvedErrors={3} newVocab={7} />)
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/corrigiu/i)).toBeInTheDocument()
  })

  it('shows new vocab count', () => {
    render(<ProgressMemoryCard resolvedErrors={0} newVocab={12} />)
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/palavras/i)).toBeInTheDocument()
  })

  it('renders nothing when both counts are zero', () => {
    const { container } = render(<ProgressMemoryCard resolvedErrors={0} newVocab={0} />)
    expect(container.firstChild).toBeNull()
  })
})
```

Run: `npx vitest run __tests__/components/dashboard/ProgressMemoryCard.test.tsx`
Expected: FAIL — "Cannot find module"

- [ ] **Step 2: Create `components/dashboard/ProgressMemoryCard.tsx`**

```typescript
interface ProgressMemoryCardProps {
  resolvedErrors: number
  newVocab: number
}

export function ProgressMemoryCard({ resolvedErrors, newVocab }: ProgressMemoryCardProps) {
  if (resolvedErrors === 0 && newVocab === 0) return null

  const parts: string[] = []
  if (resolvedErrors > 0) {
    parts.push(`corrigiu ${resolvedErrors} ${resolvedErrors === 1 ? 'erro recorrente' : 'erros recorrentes'}`)
  }
  if (newVocab > 0) {
    parts.push(`aprendeu ${newVocab} ${newVocab === 1 ? 'palavra nova' : 'palavras novas'}`)
  }

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border-l-4 border-brand-streak">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mb-1 font-medium uppercase tracking-wide">
        Este mês
      </p>
      <p className="text-sm text-content-light dark:text-content-dark">
        Você {parts.join(' e ')}.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Run component tests**

```
npx vitest run __tests__/components/dashboard/ProgressMemoryCard.test.tsx
```
Expected: 3 tests PASS

- [ ] **Step 4: Add progress memory queries to `app/dashboard/page.tsx`**

After the `dueVocab` query from Task 4, add:
```typescript
  // Progress memory — last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ count: resolvedErrorCount }, { count: newVocabCount }] = await Promise.all([
    supabase
      .from('errors_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .not('resolved_at', 'is', null)
      .gte('resolved_at', thirtyDaysAgo),
    supabase
      .from('vocab_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .gte('created_at', thirtyDaysAgo),
  ])
```

Add the import at the top:
```typescript
import { ProgressMemoryCard } from '@/components/dashboard/ProgressMemoryCard'
```

In the JSX, add `<ProgressMemoryCard>` after the streak badge and before the mission card:
```tsx
        {/* Progress memory */}
        <ProgressMemoryCard
          resolvedErrors={resolvedErrorCount ?? 0}
          newVocab={newVocabCount ?? 0}
        />
```

- [ ] **Step 5: Run full test suite**

```
npx vitest run
```
Expected: all tests PASS (0 failures)

- [ ] **Step 6: TypeScript check**

```
npx tsc --noEmit
```
Expected: clean

- [ ] **Step 7: Commit**

```
git add components/dashboard/ProgressMemoryCard.tsx app/dashboard/page.tsx __tests__/components/dashboard/ProgressMemoryCard.test.tsx
git commit -m "feat: progress memory card showing errors corrected and vocab learned this month"
```
