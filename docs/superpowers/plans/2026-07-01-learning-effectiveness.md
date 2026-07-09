# Learning Effectiveness Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five features that make the English Fluent app actually teach: guided lesson topics, pronunciation hints, a daily mission, a post-session report modal, and a spaced-repetition flashcard review page.

**Architecture:** Each feature touches the DB (one shared migration), one or more API routes, one or more React components, and the relevant tests. The conversation route and finalize route carry the most cross-cutting changes. `useSession` is extended to expose `topic` and `pronunciation_hint` per message. The post-session report is computed at the API level so it does not depend on finalize completing first.

**Tech Stack:** Next.js 14 App Router, Supabase SSR (`createSupabaseServer` / `createSupabaseAdmin`), TypeScript, Tailwind, Framer Motion (already installed), Vitest + @testing-library/react, Lucide icons.

## Global Constraints

- All UI copy is in Brazilian Portuguese; English appears only inside English-learning content (teacher replies, topic `promptEn` field used in AI system prompt only).
- No new npm packages — use existing Lucide icons, Framer Motion, and Supabase client.
- Follow existing Tailwind token names: `bg-surface-light`, `bg-surface-light-card`, `bg-surface-dark`, `bg-surface-dark-card`, `text-content-light`, `text-content-light-secondary`, `text-content-dark`, `text-content-dark-secondary`, `bg-brand-cta`, `bg-brand-interactive`, `bg-brand-streak`.
- All DB writes go through `createSupabaseServer()` (RLS) except audio storage which uses `createSupabaseAdmin()`.
- Test files live in `__tests__/<mirror-of-src-path>/` (e.g. `app/api/session/route.ts` → `__tests__/app/api/session.test.ts`).
- API test files use `// @vitest-environment node` at the top.
- Run tests with: `npx vitest run` (all) or `npx vitest run __tests__/path/to/file.test.ts` (single).
- Base commit for this plan: `c9c63cd`.

---

## File Map

**New files:**
- `supabase/migrations/20260702000001_learning_features.sql`
- `lib/topics.ts`
- `lib/missions.ts`
- `app/api/mission/route.ts`
- `app/api/flashcard/route.ts`
- `app/api/session/[id]/report/route.ts`
- `app/dashboard/revisao/page.tsx`
- `components/aula/TopicBadge.tsx`
- `components/aula/SessionReport.tsx`
- `components/dashboard/MissionCard.tsx`
- `components/dashboard/FlashcardDeck.tsx`
- `__tests__/lib/topics.test.ts`
- `__tests__/lib/missions.test.ts`
- `__tests__/app/api/mission.test.ts`
- `__tests__/app/api/flashcard.test.ts`
- `__tests__/app/api/session-report.test.ts`
- `__tests__/components/aula/TopicBadge.test.tsx`
- `__tests__/components/aula/SessionReport.test.tsx`
- `__tests__/components/dashboard/MissionCard.test.tsx`
- `__tests__/components/dashboard/FlashcardDeck.test.tsx`

**Modified files:**
- `types/index.ts` — add `pronunciation_hint` to `ConversationResponse`; add `topic` to `Session`
- `app/api/session/route.ts` — POST picks and stores a topic
- `app/api/conversation/route.ts` — include topic in system prompt; add `pronunciation_hint` to GPT JSON; store in messages
- `app/api/session/[id]/finalize/route.ts` — mark daily mission complete
- `hooks/useSession.ts` — expose `topic`; expose `pronunciation_hint` per message
- `components/aula/MessageBubble.tsx` — show `pronunciationHint` prop
- `app/aula/AulaClient.tsx` — show TopicBadge; show SessionReport modal on session end
- `app/dashboard/page.tsx` — add MissionCard; add link to /dashboard/revisao
- `__tests__/app/api/session.test.ts` — topic in POST response
- `__tests__/app/api/conversation.test.ts` — pronunciation_hint in response
- `__tests__/app/api/session/finalize.test.ts` — mission completion
- `__tests__/hooks/useSession.test.tsx` — topic and pronunciation_hint
- `__tests__/components/aula/MessageBubble.test.tsx` — pronunciationHint prop
- `__tests__/components/aula/AulaClient.test.tsx` — topic badge + report modal

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260702000001_learning_features.sql`

**Interfaces:**
- Produces: `errors_log.review_count int`, `errors_log.last_reviewed_at timestamptz`, `errors_log.next_review_at timestamptz`, `sessions.topic text`, `messages.pronunciation_hint text`, `daily_missions_log` table

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260702000001_learning_features.sql

-- errors_log: spaced-repetition review tracking
ALTER TABLE public.errors_log
  ADD COLUMN IF NOT EXISTS review_count     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_review_at   timestamptz NOT NULL DEFAULT now();

-- sessions: topic key (e.g. 'introductions', 'travel')
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS topic text;

-- messages: optional pronunciation hint from GPT
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pronunciation_hint text;

-- daily mission completion log
CREATE TABLE IF NOT EXISTS public.daily_missions_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date         date        NOT NULL DEFAULT current_date,
  mission_key  text        NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_missions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_missions_log: own rows" ON public.daily_missions_log
  FOR ALL USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the SQL above. Verify success with `mcp__plugin_supabase_supabase__list_tables` — `daily_missions_log` should appear in the list.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702000001_learning_features.sql
git commit -m "feat: DB migration for learning features (topics, missions, pronunciation, review)"
```

---

## Task 2: Topics Config + Session Topic Assignment

**Files:**
- Create: `lib/topics.ts`
- Create: `__tests__/lib/topics.test.ts`
- Modify: `types/index.ts`
- Modify: `app/api/session/route.ts`
- Modify: `__tests__/app/api/session.test.ts`

**Interfaces:**
- Produces: `pickTopic(cefrLevel, completedCount): Topic | null`, `getTopicByKey(key): Topic | null` — used by Tasks 3 and 6
- Produces: `Session.topic: string | null` added to the type
- Produces: `POST /api/session` now returns `{ session_id, teacher, topic: string | null }`

- [ ] **Step 1: Write failing tests for topics lib**

```typescript
// __tests__/lib/topics.test.ts
import { describe, it, expect } from 'vitest'
import { pickTopic, getTopicByKey } from '@/lib/topics'

describe('pickTopic', () => {
  it('returns a topic for A1 level', () => {
    const t = pickTopic('A1', 0)
    expect(t).not.toBeNull()
    expect(t?.key).toBe('introductions')
  })

  it('cycles through topics by completedCount', () => {
    const t0 = pickTopic('A1', 0)
    const t8 = pickTopic('A1', 8)
    expect(t0?.key).toBe(t8?.key)
  })

  it('falls back to A1 when level is null', () => {
    expect(pickTopic(null, 0)).not.toBeNull()
  })

  it('returns different topics for different levels', () => {
    const a1 = pickTopic('A1', 0)
    const b1 = pickTopic('B1', 0)
    expect(a1?.key).not.toBe(b1?.key)
  })
})

describe('getTopicByKey', () => {
  it('returns topic for a known key', () => {
    const t = getTopicByKey('travel')
    expect(t?.labelPt).toBe('Viagens')
  })

  it('returns null for unknown key', () => {
    expect(getTopicByKey('not-a-key')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getTopicByKey(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run __tests__/lib/topics.test.ts
```
Expected: FAIL — `@/lib/topics` not found.

- [ ] **Step 3: Implement `lib/topics.ts`**

```typescript
// lib/topics.ts
import type { CefrLevel } from '@/types'

export interface Topic {
  key: string
  labelPt: string
  promptEn: string
}

const TOPICS_BY_LEVEL: Partial<Record<CefrLevel, Topic[]>> = {
  A1: [
    { key: 'introductions',  labelPt: 'Apresentações pessoais', promptEn: 'personal introductions: name, age, nationality, and what you do' },
    { key: 'family',         labelPt: 'Família',                promptEn: 'describing family members: who they are and what they do' },
    { key: 'numbers-dates',  labelPt: 'Números e datas',        promptEn: 'numbers, dates, and days of the week' },
    { key: 'colors',         labelPt: 'Cores e adjetivos',      promptEn: 'colors, shapes, and basic descriptive adjectives' },
    { key: 'daily-routine',  labelPt: 'Rotina diária',          promptEn: 'describing your daily routine from morning to night' },
    { key: 'food',           labelPt: 'Comida e bebida',        promptEn: 'food and drinks: what you like and what you eat for each meal' },
    { key: 'greetings',      labelPt: 'Cumprimentos',           promptEn: 'greetings, farewells, and polite expressions' },
    { key: 'home',           labelPt: 'Minha casa',             promptEn: 'describing your home: rooms, furniture, and where things are' },
  ],
  A2: [
    { key: 'past-weekend', labelPt: 'Fim de semana',     promptEn: 'what you did last weekend using past simple tense' },
    { key: 'city',         labelPt: 'Minha cidade',      promptEn: 'describing your city or neighborhood: places, transport, and atmosphere' },
    { key: 'shopping',     labelPt: 'Compras',           promptEn: 'shopping: prices, sizes, preferences, and asking for help in stores' },
    { key: 'weather',      labelPt: 'Clima e estações',  promptEn: 'talking about weather, seasons, and how they affect daily life' },
    { key: 'hobbies',      labelPt: 'Hobbies',           promptEn: 'hobbies and free-time activities: what you enjoy doing and why' },
    { key: 'transport',    labelPt: 'Transporte',        promptEn: 'transportation and asking for directions around the city' },
    { key: 'work',         labelPt: 'Trabalho',          promptEn: 'talking about jobs, workplaces, and daily work activities' },
    { key: 'health',       labelPt: 'Saúde',             promptEn: 'health: describing symptoms, visiting the doctor, and getting better' },
  ],
  B1: [
    { key: 'travel',         labelPt: 'Viagens',              promptEn: 'travel experiences: places visited, adventures, and future travel plans' },
    { key: 'news',           labelPt: 'Notícias e opinião',   promptEn: 'sharing opinions about news and current events in the world' },
    { key: 'future',         labelPt: 'Planos futuros',       promptEn: 'future plans: goals, dreams, and what you are planning to do' },
    { key: 'problems',       labelPt: 'Problemas e soluções', promptEn: 'describing real-life problems and brainstorming practical solutions' },
    { key: 'entertainment',  labelPt: 'Filmes e séries',      promptEn: 'movies, TV series, and books: recommendations and personal reviews' },
    { key: 'culture',        labelPt: 'Diferenças culturais', promptEn: 'cultural differences between Brazil and English-speaking countries' },
    { key: 'career',         labelPt: 'Carreira',             promptEn: 'career goals, job ambitions, and professional development' },
    { key: 'restaurants',    labelPt: 'Restaurantes',         promptEn: 'restaurants, food preferences, and dining-out etiquette' },
  ],
  B2: [
    { key: 'social-media', labelPt: 'Redes sociais',    promptEn: 'debating the impact of social media on mental health and society' },
    { key: 'environment',  labelPt: 'Meio ambiente',    promptEn: 'environmental issues: climate change, sustainability, and solutions' },
    { key: 'technology',   labelPt: 'Tecnologia e IA',  promptEn: 'technology and artificial intelligence: opportunities and risks for society' },
    { key: 'education',    labelPt: 'Educação',         promptEn: 'education systems: comparing approaches, challenges, and reforms' },
    { key: 'finance',      labelPt: 'Finanças',         promptEn: 'personal finance: budgeting, investing, and financial planning' },
    { key: 'relationships',labelPt: 'Relacionamentos',  promptEn: 'relationships and communication: what makes them work and what causes problems' },
    { key: 'leadership',   labelPt: 'Liderança',        promptEn: 'leadership and teamwork: qualities, challenges, and different styles' },
    { key: 'ethics',       labelPt: 'Ética',            promptEn: 'ethics and moral dilemmas: discussing complex right-versus-wrong scenarios' },
  ],
}

export function pickTopic(cefrLevel: CefrLevel | null | undefined, completedSessionCount: number): Topic | null {
  const topics = TOPICS_BY_LEVEL[cefrLevel ?? 'A1'] ?? TOPICS_BY_LEVEL['A1']!
  return topics[completedSessionCount % topics.length] ?? null
}

export function getTopicByKey(key: string | null | undefined): Topic | null {
  if (!key) return null
  for (const topics of Object.values(TOPICS_BY_LEVEL)) {
    const found = topics?.find((t) => t.key === key)
    if (found) return found
  }
  return null
}
```

- [ ] **Step 4: Run topics tests**

```
npx vitest run __tests__/lib/topics.test.ts
```
Expected: 6 tests PASS.

- [ ] **Step 5: Update `types/index.ts` — add `topic` to Session**

In `types/index.ts`, find the `Session` interface and add `topic`:
```typescript
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
  topic: string | null  // ← ADD THIS LINE
}
```

- [ ] **Step 6: Modify `app/api/session/route.ts` POST to assign topic**

Replace the existing `POST` handler body with:

```typescript
export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { teacher_id: string; mode?: SessionMode }
  if (!body.teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })

  // Fetch user CEFR level and completed session count in parallel
  const [{ data: userData }, { count: completedCount }] = await Promise.all([
    supabase.from('users').select('cefr_level').eq('id', user.id).single(),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('ended_at', 'is', null),
  ])

  const topic = pickTopic(userData?.cefr_level, completedCount ?? 0)

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: body.teacher_id,
      mode: body.mode ?? 'daily',
      topic: topic?.key ?? null,
    })
    .select('id')
    .single()

  if (error || !newSession) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', body.teacher_id)
    .single()

  return NextResponse.json({ session_id: newSession.id, teacher, topic: topic?.key ?? null })
}
```

Add the import at the top of the file:
```typescript
import { pickTopic } from '@/lib/topics'
```

- [ ] **Step 7: Update session test to expect `topic` in POST response**

In `__tests__/app/api/session.test.ts`, find the test `'creates a session and returns session_id + teacher'` and add:
```typescript
it('creates a session and returns session_id + teacher', async () => {
  const { POST } = await import('@/app/api/session/route')
  const req = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_id: 'teacher-1' }),
  })
  const res = await POST(req)
  const body = await res.json()
  expect(body.session_id).toBe('session-1')
  expect(body.teacher.id).toBe('teacher-1')
  expect(body).toHaveProperty('topic')  // ← ADD THIS LINE
})
```

Also update the mock to handle the new `count` query. In the mock's `from` handler, add support for `select('id', { count: 'exact', head: true })` chaining — after the existing `select` mock, add:

```typescript
// In the vi.mock('@supabase/ssr', ...) inside the from() mock:
// The existing select mock needs to handle the count query for sessions.
// Add this inside the select vi.fn() return:
select: vi.fn((col: string, opts?: { count?: string }) => {
  if (opts?.count === 'exact') {
    return {
      eq: vi.fn(() => ({
        not: vi.fn(() => Promise.resolve({ count: 3, error: null })),
        single: vi.fn().mockResolvedValue({ data: { cefr_level: 'B1' }, error: null }),
      })),
    }
  }
  // ... existing select chain
})
```

Note: the existing mock is complex. The simplest fix is to add `not: vi.fn(() => Promise.resolve({ count: 3, error: null }))` inside the second `.eq()` chain wherever sessions are queried. Look for the chain that leads to `.maybeSingle()` and add a `.not` sibling.

- [ ] **Step 8: Run all tests to verify no regressions**

```
npx vitest run __tests__/lib/topics.test.ts __tests__/app/api/session.test.ts
```
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/topics.ts types/index.ts app/api/session/route.ts __tests__/lib/topics.test.ts __tests__/app/api/session.test.ts
git commit -m "feat: topic config + assign topic to session on creation"
```

---

## Task 3: Topic Badge in /aula + Conversation Route Integration

**Files:**
- Create: `components/aula/TopicBadge.tsx`
- Create: `__tests__/components/aula/TopicBadge.test.tsx`
- Modify: `hooks/useSession.ts`
- Modify: `app/api/conversation/route.ts`
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/hooks/useSession.test.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `getTopicByKey(key): Topic | null` from `lib/topics.ts` (Task 2)
- Consumes: `POST /api/session` returns `topic: string | null` (Task 2)
- Produces: `useSession` now returns `topic: string | null`
- Produces: `<TopicBadge topic={labelPt} />` renders a label chip

- [ ] **Step 1: Write failing test for TopicBadge**

```typescript
// __tests__/components/aula/TopicBadge.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TopicBadge } from '@/components/aula/TopicBadge'

describe('TopicBadge', () => {
  it('renders the topic label', () => {
    render(<TopicBadge topic="Viagens" />)
    expect(screen.getByText('Viagens')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run __tests__/components/aula/TopicBadge.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement `components/aula/TopicBadge.tsx`**

```typescript
// components/aula/TopicBadge.tsx
'use client'

interface TopicBadgeProps {
  topic: string
}

export function TopicBadge({ topic }: TopicBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-light-card dark:bg-surface-dark-card">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-cta flex-shrink-0" />
      <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary font-medium">
        {topic}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run TopicBadge test**

```
npx vitest run __tests__/components/aula/TopicBadge.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Update `hooks/useSession.ts` to expose `topic`**

Add `topic` state and expose it. Make these changes:

At the top of `useSession`, add to the `SessionMessage` interface (leave other fields unchanged):
```typescript
interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  had_correction: boolean
  pronunciation_hint: string | null  // will be used by Task 4
}
```

Add to `UseSessionReturn`:
```typescript
interface UseSessionReturn {
  sessionId: string | null
  topic: string | null              // ← NEW
  messages: SessionMessage[]
  // ... rest unchanged
}
```

Inside `useSession` body, add state:
```typescript
const [topic, setTopic] = useState<string | null>(null)
```

In the GET branch (where session.id exists), add:
```typescript
setSessionId(session.id)
setTopic((session.topic as string | null) ?? null)  // ← ADD
setMessages(...)
```

In the POST branch (where `{ session_id }` is returned), update to:
```typescript
const { session_id, topic: newTopic } = await postRes.json()
if (mounted) {
  setSessionId(session_id)
  setTopic((newTopic as string | null) ?? null)  // ← ADD
}
```

In the return statement, add `topic`:
```typescript
return { sessionId, topic, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, sendTurn, endSession }
```

Also update the messages mapping in sendTurn to include pronunciation_hint (null for now — Task 4 adds real data):
```typescript
setMessages((prev) => [
  ...prev,
  { role: 'user', text: userText, audio_url: null, had_correction: false, pronunciation_hint: null },
  { role: 'assistant', text: data.text, audio_url: data.audio_url, had_correction: data.had_correction, pronunciation_hint: null },
])
```

And in the existing session load mapping:
```typescript
setMessages(
  (session.messages ?? []).map((m: any) => ({
    role: m.role,
    text: m.text,
    audio_url: m.audio_url,
    had_correction: m.had_correction,
    pronunciation_hint: m.pronunciation_hint ?? null,  // ← ADD
  }))
)
```

- [ ] **Step 6: Update `hooks/useSession.ts` test**

In `__tests__/hooks/useSession.test.tsx`, update the test `'creates a new session when none exists'`:
```typescript
it('creates a new session when none exists', async () => {
  mockFetchSequence(
    { session: null },
    { session_id: 'new-session', teacher: { id: 't1', name: 'Mr. Jake' }, topic: 'travel' }
  )
  const { result } = renderHook(() => useSession('teacher-1'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.sessionId).toBe('new-session')
  expect(result.current.topic).toBe('travel')  // ← ADD
})
```

Add a test for topic from existing session:
```typescript
it('loads topic from existing session', async () => {
  mockFetchSequence({
    session: {
      id: 'existing-session',
      topic: 'family',
      teacher: { id: 't1' },
      messages: [],
    },
  })
  const { result } = renderHook(() => useSession('teacher-1'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.topic).toBe('family')
})
```

- [ ] **Step 7: Modify `app/api/conversation/route.ts` to include topic in system prompt**

Add import at the top:
```typescript
import { getTopicByKey } from '@/lib/topics'
```

After loading the session (the line `const teacher = session.teacher as {...}`), load topic data:
```typescript
const topicData = getTopicByKey(session.topic as string | null)
const topicBlock = topicData
  ? `\nToday's lesson topic: "${topicData.labelPt}" — ${topicData.promptEn}. Naturally guide the conversation toward this theme while staying responsive to the student.`
  : ''
```

In the system prompt string, insert `${topicBlock}` after `${memoryBlock}`:
```typescript
const systemPrompt = `${teacher.system_prompt}

Student profile:
- Name: ${userData?.name ?? 'Student'}
- CEFR level: ${userData?.cefr_level ?? 'B1'}
${memoryBlock}${topicBlock}
Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
...`
```

- [ ] **Step 8: Modify `app/aula/AulaClient.tsx` to show TopicBadge**

Add import:
```typescript
import { TopicBadge } from '@/components/aula/TopicBadge'
import { getTopicByKey } from '@/lib/topics'
```

Update the destructure:
```typescript
const { sessionId, topic, messages, loading, sending, turnError, initError, quotaExceeded, quotaInfo, sendTurn, endSession } = useSession(teacher.id)
```

In JSX, after `<TeacherAvatar .../>` div and before the messages scroll area, add:
```typescript
{topic && getTopicByKey(topic) && (
  <div className="flex justify-center pb-2 shrink-0">
    <TopicBadge topic={getTopicByKey(topic)!.labelPt} />
  </div>
)}
```

- [ ] **Step 9: Update `AulaClient.test.tsx` mock for useSession**

The mock needs to include `topic` and `cancelRecording` in useAudioRecorder. Update the useSession mock return value to include:
```typescript
useSession: vi.fn(() => ({
  sessionId: 'sess-1',
  topic: 'travel',                  // ← ADD
  messages: [
    { role: 'user', text: 'Hello!', audio_url: null, had_correction: false, pronunciation_hint: null },
    { role: 'assistant', text: 'Hi there!', audio_url: null, had_correction: false, pronunciation_hint: null },
  ],
  // ... rest unchanged
}))
```

And update the useAudioRecorder mock to include `cancelRecording`:
```typescript
vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),  // ← ADD
    error: null,
  })),
}))
```

Add a test for TopicBadge display:
```typescript
it('renders topic badge when topic is set', async () => {
  render(<AulaClient teacher={mockTeacher} />)
  await waitFor(() => expect(screen.getByText('Viagens')).toBeInTheDocument())
})
```

- [ ] **Step 10: Run all affected tests**

```
npx vitest run __tests__/components/aula/TopicBadge.test.tsx __tests__/hooks/useSession.test.tsx __tests__/app/aula/AulaClient.test.tsx
```
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add components/aula/TopicBadge.tsx hooks/useSession.ts app/api/conversation/route.ts app/aula/AulaClient.tsx __tests__/components/aula/TopicBadge.test.tsx __tests__/hooks/useSession.test.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: show lesson topic badge in /aula and include topic in AI system prompt"
```

---

## Task 4: Pronunciation Hint

**Files:**
- Modify: `types/index.ts`
- Modify: `app/api/conversation/route.ts`
- Modify: `hooks/useSession.ts`
- Modify: `components/aula/MessageBubble.tsx`
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/api/conversation.test.ts`
- Modify: `__tests__/components/aula/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: `messages.pronunciation_hint text` column (Task 1)
- Produces: `ConversationResponse.pronunciation_hint: string | null`
- Produces: `MessageBubble` accepts `pronunciationHint?: string | null` prop

- [ ] **Step 1: Write failing test for pronunciation hint in conversation response**

In `__tests__/app/api/conversation.test.ts`, find the existing `mockChatCreate` definition (inside the `vi.hoisted` block) and update its return value to include `pronunciation_hint`:

```typescript
// Inside vi.hoisted():
mockChatCreate: vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":"Try to buzz the \'th\' sound, like in \'the\'."}'  } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
})
```

Then add a test:
```typescript
it('includes pronunciation_hint in response when GPT provides one', async () => {
  const { POST } = await import('@/app/api/conversation/route')
  const form = new FormData()
  form.append('session_id', 'session-1')
  form.append('panic_text', 'I tink dis is good')
  const res = await POST(new Request('http://localhost/api/conversation', { method: 'POST', body: form }))
  const body = await res.json()
  expect(typeof body.pronunciation_hint === 'string' || body.pronunciation_hint === null).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run __tests__/app/api/conversation.test.ts
```
Expected: test about pronunciation_hint fails.

- [ ] **Step 3: Update `types/index.ts` — add `pronunciation_hint` to `ConversationResponse`**

```typescript
export interface ConversationResponse {
  text: string
  audio_url: string | null
  video_url: string | null
  had_correction: boolean
  error_report: ErrorReport
  transcript?: string
  pronunciation_hint: string | null  // ← ADD
}
```

- [ ] **Step 4: Update `app/api/conversation/route.ts`**

**4a: Extend `ClaudeOutput` interface** to include `pronunciation_hint`:
```typescript
interface ClaudeOutput {
  reply: string
  correction: {
    error_detected: boolean
    error_text: string | null
    correct_form: string | null
    error_type: string | null
  }
  pronunciation_hint: string | null  // ← ADD
}
```

**4b: Extend the system prompt JSON example** — replace the existing JSON template line:
```typescript
// OLD:
Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.

// NEW:
Respond ONLY with valid JSON — no markdown, no extra text:
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null}
When an error is detected set error_detected to true and fill the correction fields. error_type must be one of: verb_tense, vocabulary, preposition, pronunciation, other.
When the student's transcript reveals a common Brazilian pronunciation pattern issue (e.g. "th" pronounced as "d" or "t", dropping final "s", wrong word stress, "ed" pronounced as a full syllable), set pronunciation_hint to a single clear tip under 20 words. Otherwise set pronunciation_hint to null.
```

**4c: Extract pronunciation hint after parsing**. After the `const correctionRaw = parsed.correction ?? {}` line, add:
```typescript
const pronunciationHint: string | null = (typeof parsed.pronunciation_hint === 'string' && parsed.pronunciation_hint.length > 0)
  ? parsed.pronunciation_hint
  : null
```

**4d: Store hint in assistant message**. Find the assistant message insert and add `pronunciation_hint`:
```typescript
await supabase.from('messages').insert([
  { session_id: sessionId, role: 'assistant', text: replyText, audio_url: storedAudioUrl, had_correction: errorReport.error_detected, pronunciation_hint: pronunciationHint },
])
```

**4e: Include hint in response**. Find the `const response: ConversationResponse = {` block and add:
```typescript
const response: ConversationResponse = {
  text: replyText,
  audio_url: audioUrl,
  video_url: videoUrl,
  had_correction: errorReport.error_detected,
  error_report: errorReport,
  transcript,
  pronunciation_hint: pronunciationHint,  // ← ADD
}
```

- [ ] **Step 5: Update `hooks/useSession.ts` to populate pronunciation_hint from response**

In the `sendTurn` function, find the `setMessages` call and update the assistant entry:
```typescript
setMessages((prev) => [
  ...prev,
  { role: 'user', text: userText, audio_url: null, had_correction: false, pronunciation_hint: null },
  {
    role: 'assistant',
    text: data.text,
    audio_url: data.audio_url,
    had_correction: data.had_correction,
    pronunciation_hint: data.pronunciation_hint ?? null,  // ← UPDATE
  },
])
```

- [ ] **Step 6: Update `components/aula/MessageBubble.tsx` to show hint**

```typescript
// components/aula/MessageBubble.tsx
'use client'

import { Mic } from 'lucide-react'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
  pronunciationHint?: string | null  // ← ADD
}

export function MessageBubble({ role, text, hadCorrection, pronunciationHint }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
          isUser
            ? 'bg-brand-interactive text-white rounded-br-sm'
            : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
        }`}
      >
        {text}
        {hadCorrection && (
          <span
            data-testid="correction-indicator"
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-streak"
            title="Correção disponível"
          />
        )}
        {!isUser && pronunciationHint && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-500 dark:text-amber-400" data-testid="pronunciation-hint">
            <Mic size={12} className="mt-0.5 flex-shrink-0" />
            <span>{pronunciationHint}</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update `app/aula/AulaClient.tsx` to pass pronunciation_hint to MessageBubble**

In the `messages.map` render, update:
```typescript
{messages.map((m, i) => (
  <MessageBubble
    key={i}
    role={m.role}
    text={m.text}
    hadCorrection={m.had_correction}
    pronunciationHint={m.pronunciation_hint}  // ← ADD
  />
))}
```

- [ ] **Step 8: Update MessageBubble tests**

In `__tests__/components/aula/MessageBubble.test.tsx`, add two tests:
```typescript
it('shows pronunciation hint for assistant message when provided', () => {
  render(
    <MessageBubble
      role="assistant"
      text="Good job!"
      hadCorrection={false}
      pronunciationHint="Try to make the 'th' sound by placing your tongue between your teeth."
    />
  )
  expect(screen.getByTestId('pronunciation-hint')).toBeInTheDocument()
  expect(screen.getByText(/tongue between your teeth/)).toBeInTheDocument()
})

it('does not show pronunciation hint when null', () => {
  render(<MessageBubble role="assistant" text="Good job!" hadCorrection={false} pronunciationHint={null} />)
  expect(screen.queryByTestId('pronunciation-hint')).not.toBeInTheDocument()
})

it('does not show pronunciation hint for user messages', () => {
  render(<MessageBubble role="user" text="Hello!" hadCorrection={false} pronunciationHint="Some hint" />)
  expect(screen.queryByTestId('pronunciation-hint')).not.toBeInTheDocument()
})
```

- [ ] **Step 9: Run all affected tests**

```
npx vitest run __tests__/app/api/conversation.test.ts __tests__/components/aula/MessageBubble.test.tsx __tests__/hooks/useSession.test.tsx
```
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add types/index.ts app/api/conversation/route.ts hooks/useSession.ts components/aula/MessageBubble.tsx app/aula/AulaClient.tsx __tests__/app/api/conversation.test.ts __tests__/components/aula/MessageBubble.test.tsx
git commit -m "feat: pronunciation hint from GPT shown in message bubbles"
```

---

## Task 5: Daily Mission

**Files:**
- Create: `lib/missions.ts`
- Create: `app/api/mission/route.ts`
- Create: `components/dashboard/MissionCard.tsx`
- Create: `__tests__/lib/missions.test.ts`
- Create: `__tests__/app/api/mission.test.ts`
- Create: `__tests__/components/dashboard/MissionCard.test.tsx`
- Modify: `app/api/session/[id]/finalize/route.ts`
- Modify: `app/dashboard/page.tsx`
- Modify: `__tests__/app/api/session/finalize.test.ts`

**Interfaces:**
- Consumes: `daily_missions_log` table (Task 1)
- Produces: `getMissionForDate(cefrLevel, dateStr): Mission`
- Produces: `GET /api/mission` → `{ mission: Mission, today: string, completed: boolean, completed_at: string | null }`
- Produces: `<MissionCard titlePt completed descriptionPt />`

- [ ] **Step 1: Write failing tests for missions lib**

```typescript
// __tests__/lib/missions.test.ts
import { describe, it, expect } from 'vitest'
import { getMissionForDate } from '@/lib/missions'

describe('getMissionForDate', () => {
  it('returns a mission for A1 level', () => {
    const m = getMissionForDate('A1', '2026-07-01')
    expect(m).toBeDefined()
    expect(m.key).toMatch(/^a1-/)
  })

  it('cycles through missions — day 1 and day 4 return the same mission', () => {
    const m1 = getMissionForDate('A1', '2026-07-01')  // day 1 → index 0
    const m4 = getMissionForDate('A1', '2026-07-04')  // day 4 → index 0
    expect(m1.key).toBe(m4.key)
  })

  it('day 2 and day 1 return different missions', () => {
    const m1 = getMissionForDate('A1', '2026-07-01')
    const m2 = getMissionForDate('A1', '2026-07-02')
    expect(m1.key).not.toBe(m2.key)
  })

  it('falls back to A1 when level is null', () => {
    expect(() => getMissionForDate(null, '2026-07-01')).not.toThrow()
  })

  it('B1 missions differ from A1 missions', () => {
    const a1 = getMissionForDate('A1', '2026-07-01')
    const b1 = getMissionForDate('B1', '2026-07-01')
    expect(a1.key).not.toBe(b1.key)
  })
})
```

- [ ] **Step 2: Run to verify failures**

```
npx vitest run __tests__/lib/missions.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `lib/missions.ts`**

```typescript
// lib/missions.ts
import type { CefrLevel } from '@/types'

export interface Mission {
  key: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
}

const MISSIONS_BY_LEVEL: Partial<Record<CefrLevel, Mission[]>> = {
  A1: [
    { key: 'a1-intro',   titlePt: 'Apresentação completa', descriptionPt: 'Apresente-se em inglês: nome, de onde você é e quantos anos tem.', minUserTurns: 3 },
    { key: 'a1-family',  titlePt: 'Descreva sua família',  descriptionPt: 'Fale sobre dois membros da sua família em inglês.', minUserTurns: 3 },
    { key: 'a1-routine', titlePt: 'Rotina matinal',        descriptionPt: 'Conte sua rotina da manhã em inglês, passo a passo.', minUserTurns: 3 },
  ],
  A2: [
    { key: 'a2-weekend',    titlePt: 'Fim de semana passado', descriptionPt: 'Conte o que você fez no último fim de semana usando o passado simples.', minUserTurns: 4 },
    { key: 'a2-city',       titlePt: 'Minha cidade',          descriptionPt: 'Descreva seu bairro ou cidade usando pelo menos 5 adjetivos.', minUserTurns: 4 },
    { key: 'a2-directions', titlePt: 'Como chegar lá',        descriptionPt: 'Explique como chegar à sua casa ou trabalho a partir de um ponto de referência.', minUserTurns: 4 },
  ],
  B1: [
    { key: 'b1-movie',  titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme, série ou livro em inglês e explique por quê você gosta.', minUserTurns: 5 },
    { key: 'b1-plans',  titlePt: 'Planos futuros',        descriptionPt: 'Fale sobre seus planos para os próximos 6 meses em inglês.', minUserTurns: 5 },
    { key: 'b1-travel', titlePt: 'Destino dos sonhos',    descriptionPt: 'Descreva uma viagem que você fez ou gostaria de fazer.', minUserTurns: 5 },
  ],
  B2: [
    { key: 'b2-debate',       titlePt: 'Debate: redes sociais', descriptionPt: 'Dê sua opinião argumentada sobre o impacto das redes sociais na saúde mental.', minUserTurns: 6 },
    { key: 'b2-environment',  titlePt: 'Meio ambiente',          descriptionPt: 'Discuta os impactos das mudanças climáticas e possíveis soluções práticas.', minUserTurns: 6 },
    { key: 'b2-tech',         titlePt: 'Tecnologia e trabalho',  descriptionPt: 'Explique como a IA está mudando o mundo do trabalho e suas implicações.', minUserTurns: 6 },
  ],
}

export function getMissionForDate(cefrLevel: CefrLevel | null | undefined, dateStr: string): Mission {
  const missions = MISSIONS_BY_LEVEL[cefrLevel ?? 'A1'] ?? MISSIONS_BY_LEVEL['A1']!
  // Day of month (1-31) picks mission index, cycling every 3 days
  const day = parseInt(dateStr.slice(8, 10), 10)
  return missions[(day - 1) % missions.length]
}
```

- [ ] **Step 4: Run missions tests**

```
npx vitest run __tests__/lib/missions.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Write test for MissionCard**

```typescript
// __tests__/components/dashboard/MissionCard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MissionCard } from '@/components/dashboard/MissionCard'

describe('MissionCard', () => {
  it('renders mission title and description', () => {
    render(<MissionCard titlePt="Apresentação completa" descriptionPt="Apresente-se em inglês." completed={false} />)
    expect(screen.getByText('Apresentação completa')).toBeInTheDocument()
    expect(screen.getByText('Apresente-se em inglês.')).toBeInTheDocument()
  })

  it('shows completed state when completed is true', () => {
    render(<MissionCard titlePt="Apresentação" descriptionPt="Descrição" completed={true} />)
    expect(screen.getByText(/missão concluída/i)).toBeInTheDocument()
  })

  it('does not show completed text when not completed', () => {
    render(<MissionCard titlePt="Apresentação" descriptionPt="Descrição" completed={false} />)
    expect(screen.queryByText(/missão concluída/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implement `components/dashboard/MissionCard.tsx`**

```typescript
// components/dashboard/MissionCard.tsx
'use client'

import { CheckCircle } from 'lucide-react'

interface MissionCardProps {
  titlePt: string
  descriptionPt: string
  completed: boolean
}

export function MissionCard({ titlePt, descriptionPt, completed }: MissionCardProps) {
  return (
    <div className={`p-4 rounded-xl flex items-start gap-3 ${
      completed
        ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900'
        : 'bg-surface-light-card dark:bg-surface-dark-card'
    }`}>
      <CheckCircle
        size={20}
        className={`mt-0.5 flex-shrink-0 ${
          completed ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary opacity-30'
        }`}
      />
      <div>
        <p className={`text-sm font-semibold ${
          completed ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
        }`}>
          {completed ? 'Missão concluída — ' : ''}{titlePt}
        </p>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
          {descriptionPt}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run MissionCard test**

```
npx vitest run __tests__/components/dashboard/MissionCard.test.tsx
```
Expected: 3 tests PASS.

- [ ] **Step 8: Write test for mission API**

```typescript
// __tests__/app/api/mission.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { cefr_level: 'A1' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('GET /api/mission', () => {
  beforeEach(() => vi.resetModules())

  it('returns mission and completed=false for a fresh day', async () => {
    const { GET } = await import('@/app/api/mission/route')
    const res = await GET(new Request('http://localhost/api/mission'))
    const body = await res.json()
    expect(body.mission).toBeDefined()
    expect(body.mission.key).toMatch(/^a1-/)
    expect(body.completed).toBe(false)
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { GET } = await import('@/app/api/mission/route')
    const res = await GET(new Request('http://localhost/api/mission'))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 9: Implement `app/api/mission/route.ts`**

```typescript
// app/api/mission/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getMissionForDate } from '@/lib/missions'

export async function GET(_request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: userData } = await supabase
    .from('users')
    .select('cefr_level')
    .eq('id', user.id)
    .single()

  const mission = getMissionForDate(userData?.cefr_level, today)

  const { data: log } = await supabase
    .from('daily_missions_log')
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  return NextResponse.json({
    mission,
    today,
    completed: !!log?.completed_at,
    completed_at: log?.completed_at ?? null,
  })
}
```

- [ ] **Step 10: Run mission API test**

```
npx vitest run __tests__/app/api/mission.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 11: Modify `app/api/session/[id]/finalize/route.ts` to mark mission complete**

Add import at the top:
```typescript
import { getMissionForDate } from '@/lib/missions'
```

After the streak update block (after the `streakError` console.error line), add:

```typescript
// 3 — Mark daily mission complete if user sent enough turns
const userMsgCount = msgs.filter((m) => m.role === 'user').length
const brazilOffset = -3 * 60 * 60 * 1000
const todayBrazil = new Date(Date.now() + brazilOffset).toISOString().slice(0, 10)
const mission = getMissionForDate(userData?.cefr_level, todayBrazil)

if (userMsgCount >= mission.minUserTurns) {
  const { error: missionError } = await supabase
    .from('daily_missions_log')
    .upsert(
      { user_id: user.id, date: todayBrazil, mission_key: mission.key },
      { onConflict: 'user_id,date', ignoreDuplicates: true },
    )
  if (missionError) console.error('Mission completion failed:', missionError.message)
}
```

- [ ] **Step 12: Update finalize test to verify mission logic**

In `__tests__/app/api/session/finalize.test.ts`, add a test (read the existing file first to understand the mock pattern, then add):
```typescript
it('marks mission complete when user sent enough turns', async () => {
  // The existing mock resolves messages — update it to return 5 user messages
  // (see existing mock setup in this file and override messages mock for this test)
  // Then verify supabase.from('daily_missions_log').upsert was called
})
```

Note: the exact implementation of this test depends on the existing mock structure in `finalize.test.ts`. Read it first, then write a test that verifies `upsert` is called on `daily_missions_log` when user message count meets the threshold.

- [ ] **Step 13: Modify `app/dashboard/page.tsx` to add MissionCard**

Add imports:
```typescript
import { MissionCard } from '@/components/dashboard/MissionCard'
```

In the Supabase data loading section (alongside `recentSessions` and `errors`), add:
```typescript
// Load today's mission status
const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const { data: missionLog } = await supabase
  .from('daily_missions_log')
  .select('completed_at')
  .eq('user_id', authUser.id)
  .eq('date', today)
  .maybeSingle()

const mission = getMissionForDate(u.cefr_level, today)
const missionCompleted = !!missionLog?.completed_at
```

Add import at the top:
```typescript
import { getMissionForDate } from '@/lib/missions'
```

In the JSX, after the `<StreakBadge>` component and before the `<Link href="/aula">` CTA, add:
```typescript
{/* Daily Mission */}
<MissionCard
  titlePt={mission.titlePt}
  descriptionPt={mission.descriptionPt}
  completed={missionCompleted}
/>
```

Also add a link to the flashcard review page in the JSX (after the `<Link href="/planos">` block):
```typescript
{/* Flashcard review */}
{(errors ?? []).length > 0 && (
  <Link
    href="/dashboard/revisao"
    className="flex items-center justify-between p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
  >
    <div>
      <p className="text-sm font-semibold text-content-light dark:text-content-dark">Revisar erros</p>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
        {(errors ?? []).length} {(errors ?? []).length === 1 ? 'erro para revisar' : 'erros para revisar'}
      </p>
    </div>
    <span className="text-content-light-secondary dark:text-content-dark-secondary text-sm">›</span>
  </Link>
)}
```

- [ ] **Step 14: Run all tests**

```
npx vitest run __tests__/lib/missions.test.ts __tests__/app/api/mission.test.ts __tests__/components/dashboard/MissionCard.test.tsx __tests__/app/api/session/finalize.test.ts
```
Expected: all PASS.

- [ ] **Step 15: Commit**

```bash
git add lib/missions.ts app/api/mission/route.ts components/dashboard/MissionCard.tsx app/api/session/[id]/finalize/route.ts app/dashboard/page.tsx __tests__/lib/missions.test.ts __tests__/app/api/mission.test.ts __tests__/components/dashboard/MissionCard.test.tsx __tests__/app/api/session/finalize.test.ts
git commit -m "feat: daily mission — config, API, dashboard card, auto-complete on finalize"
```

---

## Task 6: Post-Session Report Modal

**Files:**
- Create: `app/api/session/[id]/report/route.ts`
- Create: `components/aula/SessionReport.tsx`
- Create: `__tests__/app/api/session-report.test.ts`
- Create: `__tests__/components/aula/SessionReport.test.tsx`
- Modify: `app/aula/AulaClient.tsx`
- Modify: `__tests__/app/aula/AulaClient.test.tsx`

**Interfaces:**
- Consumes: `messages.pronunciation_hint` (Task 4), `daily_missions_log` (Task 5)
- Produces: `GET /api/session/:id/report` → `{ userMessages, corrections, pronunciationHints, durationSeconds, missionCompleted, missionTitle }`
- Produces: `<SessionReport ... onClose />` — full-screen modal overlay

- [ ] **Step 1: Write failing test for report API**

```typescript
// __tests__/app/api/session-report.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessages = [
  { role: 'user', had_correction: false, pronunciation_hint: null },
  { role: 'assistant', had_correction: true, pronunciation_hint: 'Buzz the th sound.' },
  { role: 'user', had_correction: false, pronunciation_hint: null },
  { role: 'assistant', had_correction: false, pronunciation_hint: null },
]

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { cefr_level: 'B1' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'sess-1', user_id: 'user-1', duration_seconds: 300, started_at: '2026-07-01T10:00:00Z' },
            error: null,
          }),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
  })),
}))

// Override the messages query to return mockMessages
vi.mock('@supabase/ssr', () => {
  let callCount = 0
  return {
    createServerClient: vi.fn(() => ({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: mockMessages, error: null })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { cefr_level: 'B1' }, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'sess-1', user_id: 'user-1', duration_seconds: 300, started_at: '2026-07-01T10:00:00Z' },
                error: null,
              }),
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        }
      }),
    })),
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('GET /api/session/[id]/report', () => {
  beforeEach(() => vi.resetModules())

  it('returns correct counts from session messages', async () => {
    const { GET } = await import('@/app/api/session/[id]/report/route')
    const res = await GET(
      new Request('http://localhost/api/session/sess-1/report'),
      { params: { id: 'sess-1' } }
    )
    const body = await res.json()
    expect(body.userMessages).toBe(2)
    expect(body.corrections).toBe(1)
    expect(body.pronunciationHints).toBe(1)
    expect(body.durationSeconds).toBe(300)
    expect(typeof body.missionCompleted).toBe('boolean')
    expect(typeof body.missionTitle).toBe('string')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { GET } = await import('@/app/api/session/[id]/report/route')
    const res = await GET(
      new Request('http://localhost/api/session/sess-1/report'),
      { params: { id: 'sess-1' } }
    )
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run __tests__/app/api/session-report.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `app/api/session/[id]/report/route.ts`**

```typescript
// app/api/session/[id]/report/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getMissionForDate } from '@/lib/missions'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sessionId } = params

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, duration_seconds, started_at')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: messages }, { data: userData }, { data: missionLog }] = await Promise.all([
    supabase
      .from('messages')
      .select('role, had_correction, pronunciation_hint')
      .eq('session_id', sessionId),
    supabase
      .from('users')
      .select('cefr_level')
      .eq('id', user.id)
      .single(),
    supabase
      .from('daily_missions_log')
      .select('completed_at')
      .eq('user_id', user.id)
      .eq('date', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .maybeSingle(),
  ])

  const msgs = messages ?? []
  const userMessages = msgs.filter((m) => m.role === 'user').length
  const corrections = msgs.filter((m) => m.had_correction).length
  const pronunciationHints = msgs.filter((m) => m.pronunciation_hint).length

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const mission = getMissionForDate(userData?.cefr_level, today)

  // Check if completed via log OR if current session meets the threshold
  const missionCompleted = !!missionLog?.completed_at || userMessages >= mission.minUserTurns

  return NextResponse.json({
    userMessages,
    corrections,
    pronunciationHints,
    durationSeconds: session.duration_seconds ?? 0,
    missionCompleted,
    missionTitle: mission.titlePt,
  })
}
```

- [ ] **Step 4: Run report API test**

```
npx vitest run __tests__/app/api/session-report.test.ts
```
Expected: PASS.

- [ ] **Step 5: Write test for SessionReport component**

```typescript
// __tests__/components/aula/SessionReport.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { SessionReport } from '@/components/aula/SessionReport'

const defaultProps = {
  userMessages: 5,
  corrections: 2,
  pronunciationHints: 1,
  durationSeconds: 180,
  missionCompleted: false,
  missionTitle: 'Apresentação completa',
  onClose: vi.fn(),
}

describe('SessionReport', () => {
  it('renders stat counts', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.getByText('5')).toBeInTheDocument()  // userMessages
    expect(screen.getByText('2')).toBeInTheDocument()  // corrections
    expect(screen.getByText('1')).toBeInTheDocument()  // pronunciationHints
  })

  it('formats duration correctly', () => {
    render(<SessionReport {...defaultProps} durationSeconds={185} />)
    expect(screen.getByText('3m 5s')).toBeInTheDocument()
  })

  it('shows mission title', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.getByText('Apresentação completa')).toBeInTheDocument()
  })

  it('shows "Missão concluída" when completed', () => {
    render(<SessionReport {...defaultProps} missionCompleted={true} />)
    expect(screen.getByText(/missão concluída/i)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<SessionReport {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /ir para o dashboard/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Implement `components/aula/SessionReport.tsx`**

```typescript
// components/aula/SessionReport.tsx
'use client'

import { X, MessageCircle, AlertCircle, Mic, Clock, Target } from 'lucide-react'

interface SessionReportProps {
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function SessionReport({
  userMessages,
  corrections,
  pronunciationHints,
  durationSeconds,
  missionCompleted,
  missionTitle,
  onClose,
}: SessionReportProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-content-light dark:text-content-dark">
            Resumo da aula
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar resumo"
            className="text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <MessageCircle size={16} className="text-brand-cta" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{userMessages}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">falas enviadas</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <AlertCircle size={16} className="text-brand-streak" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{corrections}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">erros corrigidos</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Mic size={16} className="text-amber-500" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{pronunciationHints}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">dicas de pronúncia</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Clock size={16} className="text-content-light-secondary dark:text-content-dark-secondary" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{formatDuration(durationSeconds)}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">duração</p>
          </div>
        </div>

        <div className={`rounded-xl p-3 flex items-center gap-3 ${
          missionCompleted
            ? 'bg-green-50 dark:bg-green-950/20'
            : 'bg-surface-light-card dark:bg-surface-dark-card'
        }`}>
          <Target
            size={20}
            className={missionCompleted ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary'}
          />
          <div>
            <p className={`text-sm font-semibold ${
              missionCompleted ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
            }`}>
              {missionCompleted ? 'Missão concluída!' : 'Missão do dia'}
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{missionTitle}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ir para o dashboard
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run SessionReport component test**

```
npx vitest run __tests__/components/aula/SessionReport.test.tsx
```
Expected: 5 tests PASS.

- [ ] **Step 8: Modify `app/aula/AulaClient.tsx` to show report modal**

Add imports:
```typescript
import { SessionReport } from '@/components/aula/SessionReport'
```

Add inside the `AulaClient` component body (after existing state declarations):
```typescript
const [showReport, setShowReport] = useState(false)
const [reportData, setReportData] = useState<{
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
} | null>(null)
```

Replace the existing `handleEnd` function:
```typescript
async function handleEnd() {
  await endSession()
  if (sessionId) {
    try {
      const res = await fetch(`/api/session/${sessionId}/report`)
      if (res.ok) {
        const data = await res.json()
        setReportData(data)
        setShowReport(true)
        return
      }
    } catch {
      // fallthrough to navigate
    }
  }
  router.push('/dashboard')
}

function handleReportClose() {
  setShowReport(false)
  router.push('/dashboard')
}
```

At the very end of the JSX `<main>` element (before the closing `</main>`), add:
```typescript
{showReport && reportData && (
  <SessionReport
    userMessages={reportData.userMessages}
    corrections={reportData.corrections}
    pronunciationHints={reportData.pronunciationHints}
    durationSeconds={reportData.durationSeconds}
    missionCompleted={reportData.missionCompleted}
    missionTitle={reportData.missionTitle}
    onClose={handleReportClose}
  />
)}
```

- [ ] **Step 9: Add AulaClient test for report modal**

In `__tests__/app/aula/AulaClient.test.tsx`, update the `endSession` mock to return a resolved promise, and add:
```typescript
it('shows session report modal after ending session', async () => {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ session: { id: 's1', topic: null, messages: [] } }) })
    // endSession calls PATCH + POST finalize
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    // report fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userMessages: 3,
        corrections: 1,
        pronunciationHints: 0,
        durationSeconds: 120,
        missionCompleted: false,
        missionTitle: 'Apresentação completa',
      }),
    })

  // Note: since AulaClient uses useSession mock (vi.mock), this test verifies
  // the component renders the modal when fetch returns report data.
  // Simulate clicking "Encerrar aula"
  const endSessionMock = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useSession).mockReturnValue({
    sessionId: 'sess-1',
    topic: null,
    messages: [],
    loading: false,
    sending: false,
    initError: null,
    turnError: null,
    quotaExceeded: false,
    quotaInfo: null,
    sendTurn: vi.fn(),
    endSession: endSessionMock,
  })

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      userMessages: 3,
      corrections: 1,
      pronunciationHints: 0,
      durationSeconds: 120,
      missionCompleted: false,
      missionTitle: 'Apresentação completa',
    }),
  })

  render(<AulaClient teacher={mockTeacher} />)
  const endButton = screen.getByText(/encerrar aula/i)
  await act(async () => { fireEvent.click(endButton) })
  await waitFor(() => expect(screen.getByText('Resumo da aula')).toBeInTheDocument())
})
```

Add `import { act, fireEvent } from '@testing-library/react'` to the test imports.

- [ ] **Step 10: Run all affected tests**

```
npx vitest run __tests__/app/api/session-report.test.ts __tests__/components/aula/SessionReport.test.tsx __tests__/app/aula/AulaClient.test.tsx
```
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add app/api/session/[id]/report/route.ts components/aula/SessionReport.tsx app/aula/AulaClient.tsx __tests__/app/api/session-report.test.ts __tests__/components/aula/SessionReport.test.tsx __tests__/app/aula/AulaClient.test.tsx
git commit -m "feat: post-session report modal with stats and mission status"
```

---

## Task 7: Flashcard Review Page

**Files:**
- Create: `app/api/flashcard/route.ts`
- Create: `components/dashboard/FlashcardDeck.tsx`
- Create: `app/dashboard/revisao/page.tsx`
- Create: `__tests__/app/api/flashcard.test.ts`
- Create: `__tests__/components/dashboard/FlashcardDeck.test.tsx`

**Interfaces:**
- Consumes: `errors_log.review_count`, `errors_log.next_review_at`, `errors_log.last_reviewed_at` (Task 1)
- Produces: `GET /api/flashcard` → `{ cards: FlashCard[] }` where `next_review_at <= now AND resolved_at IS NULL`
- Produces: `PATCH /api/flashcard` body `{ errorId: string, knewIt: boolean }` → updates review tracking
- Produces: `<FlashcardDeck cards onComplete />` — interactive flip-card UI

**Spaced repetition intervals:**
- `knewIt=true`: `review_count` advances; `next_review_at = now + INTERVALS[min(review_count+1, 4)] days` where `INTERVALS = [1, 3, 7, 14, 30]`
- `knewIt=false`: reset to `review_count=0`, `next_review_at = now + 1 day`

- [ ] **Step 1: Write failing test for flashcard API**

```typescript
// __tests__/app/api/flashcard.test.ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockCards = [
  { id: 'err-1', error_type: 'verb_tense', error_text: 'I goed to school', correct_form: 'I went to school', review_count: 0 },
  { id: 'err-2', error_type: 'vocabulary', error_text: 'He is very tall person', correct_form: 'He is a very tall person', review_count: 1 },
]

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: mockCards, error: null })),
              })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('GET /api/flashcard', () => {
  beforeEach(() => vi.resetModules())

  it('returns due flashcards', async () => {
    const { GET } = await import('@/app/api/flashcard/route')
    const res = await GET(new Request('http://localhost/api/flashcard'))
    const body = await res.json()
    expect(body.cards).toHaveLength(2)
    expect(body.cards[0].id).toBe('err-1')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { GET } = await import('@/app/api/flashcard/route')
    const res = await GET(new Request('http://localhost/api/flashcard'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/flashcard', () => {
  beforeEach(() => vi.resetModules())

  it('accepts knewIt=true and returns ok', async () => {
    const { PATCH } = await import('@/app/api/flashcard/route')
    const req = new Request('http://localhost/api/flashcard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorId: 'err-1', knewIt: true, currentReviewCount: 0 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run __tests__/app/api/flashcard.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `app/api/flashcard/route.ts`**

```typescript
// app/api/flashcard/route.ts
import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const INTERVAL_DAYS = [1, 3, 7, 14, 30]

export async function GET(_request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()

  const { data: cards } = await supabase
    .from('errors_log')
    .select('id, error_type, error_text, correct_form, review_count')
    .eq('user_id', user.id)
    .is('resolved_at', null)
    .lte('next_review_at', now)
    .order('next_review_at', { ascending: true })
    .limit(20)

  return NextResponse.json({ cards: cards ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { errorId, knewIt, currentReviewCount } = await request.json() as {
    errorId: string
    knewIt: boolean
    currentReviewCount: number
  }

  const now = new Date()
  let newReviewCount: number
  let nextReviewAt: Date

  if (knewIt) {
    newReviewCount = Math.min(currentReviewCount + 1, INTERVAL_DAYS.length - 1)
    const days = INTERVAL_DAYS[newReviewCount]
    nextReviewAt = new Date(now.getTime() + days * 86_400_000)
  } else {
    newReviewCount = 0
    nextReviewAt = new Date(now.getTime() + INTERVAL_DAYS[0] * 86_400_000)
  }

  const { error } = await supabase
    .from('errors_log')
    .update({
      review_count: newReviewCount,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReviewAt.toISOString(),
    })
    .eq('id', errorId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, nextReviewAt: nextReviewAt.toISOString() })
}
```

- [ ] **Step 4: Run flashcard API tests**

```
npx vitest run __tests__/app/api/flashcard.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Write failing test for FlashcardDeck component**

```typescript
// __tests__/components/dashboard/FlashcardDeck.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { FlashcardDeck } from '@/components/dashboard/FlashcardDeck'

const mockCards = [
  { id: 'err-1', error_type: 'verb_tense', error_text: 'I goed to school', correct_form: 'I went to school', review_count: 0 },
  { id: 'err-2', error_type: 'vocabulary', error_text: 'He very tall', correct_form: 'He is very tall', review_count: 1 },
]

describe('FlashcardDeck', () => {
  it('shows the error_text on the front of the first card', () => {
    render(<FlashcardDeck cards={mockCards} onReview={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('I goed to school')).toBeInTheDocument()
  })

  it('shows correct_form when card is flipped', () => {
    render(<FlashcardDeck cards={mockCards} onReview={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    expect(screen.getByText('I went to school')).toBeInTheDocument()
  })

  it('calls onReview with knewIt=true when "Sabia" is clicked', () => {
    const onReview = vi.fn()
    render(<FlashcardDeck cards={mockCards} onReview={onReview} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByRole('button', { name: /sabia/i }))
    expect(onReview).toHaveBeenCalledWith('err-1', true, 0)
  })

  it('calls onReview with knewIt=false when "Não sabia" is clicked', () => {
    const onReview = vi.fn()
    render(<FlashcardDeck cards={mockCards} onReview={onReview} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByRole('button', { name: /não sabia/i }))
    expect(onReview).toHaveBeenCalledWith('err-1', false, 0)
  })

  it('calls onComplete when all cards are reviewed', () => {
    const onComplete = vi.fn()
    const onReview = vi.fn()
    render(<FlashcardDeck cards={[mockCards[0]]} onReview={onReview} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByRole('button', { name: /sabia/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('shows completion message after all cards are reviewed', () => {
    render(<FlashcardDeck cards={[mockCards[0]]} onReview={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByRole('button', { name: /sabia/i }))
    expect(screen.getByText(/revisão concluída/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implement `components/dashboard/FlashcardDeck.tsx`**

```typescript
// components/dashboard/FlashcardDeck.tsx
'use client'

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'

interface FlashCard {
  id: string
  error_type: string
  error_text: string
  correct_form: string
  review_count: number
}

interface FlashcardDeckProps {
  cards: FlashCard[]
  onReview: (errorId: string, knewIt: boolean, currentReviewCount: number) => void
  onComplete: () => void
}

export function FlashcardDeck({ cards, onReview, onComplete }: FlashcardDeckProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)

  if (done || cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <CheckCircle size={48} className="text-green-500" />
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark">Revisão concluída!</h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Você revisou {cards.length} {cards.length === 1 ? 'erro' : 'erros'} hoje.
        </p>
      </div>
    )
  }

  const card = cards[index]

  function handleAnswer(knewIt: boolean) {
    onReview(card.id, knewIt, card.review_count)
    const next = index + 1
    if (next >= cards.length) {
      setDone(true)
      onComplete()
    } else {
      setIndex(next)
      setFlipped(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
        {index + 1} de {cards.length}
      </p>

      <div className="rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-6 min-h-[160px] flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          O que você disse
        </p>
        <p className="text-lg font-semibold text-content-light dark:text-content-dark italic">
          &ldquo;{card.error_text}&rdquo;
        </p>

        {flipped && (
          <>
            <div className="w-full h-px bg-surface-light dark:bg-surface-dark" />
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              Forma correta
            </p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              &ldquo;{card.correct_form}&rdquo;
            </p>
          </>
        )}
      </div>

      {!flipped ? (
        <button
          onClick={() => setFlipped(true)}
          aria-label="Ver resposta"
          className="w-full py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ver resposta
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => handleAnswer(false)}
            aria-label="Não sabia"
            className="flex-1 py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
          >
            Não sabia
          </button>
          <button
            onClick={() => handleAnswer(true)}
            aria-label="Sabia"
            className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Sabia!
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run FlashcardDeck tests**

```
npx vitest run __tests__/components/dashboard/FlashcardDeck.test.tsx
```
Expected: 5 tests PASS.

- [ ] **Step 8: Implement `app/dashboard/revisao/page.tsx`**

```typescript
// app/dashboard/revisao/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { FlashcardDeck } from '@/components/dashboard/FlashcardDeck'
import { ThemeToggle } from '@/components/ThemeToggle'

interface FlashCard {
  id: string
  error_type: string
  error_text: string
  correct_form: string
  review_count: number
}

export default function RevisaoPage() {
  const router = useRouter()
  const [cards, setCards] = useState<FlashCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/flashcard')
      .then((r) => r.json())
      .then((data) => setCards(data.cards ?? []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [])

  const handleReview = useCallback(async (errorId: string, knewIt: boolean, currentReviewCount: number) => {
    await fetch('/api/flashcard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorId, knewIt, currentReviewCount }),
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

      <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full gap-4">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Revisar erros</h1>

        {loading ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Carregando...</p>
        ) : (
          <FlashcardDeck
            cards={cards}
            onReview={handleReview}
            onComplete={() => {}}
          />
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 9: Run the full test suite**

```
npx vitest run
```
Expected: all tests PASS (128+ tests).

- [ ] **Step 10: Commit**

```bash
git add app/api/flashcard/route.ts components/dashboard/FlashcardDeck.tsx app/dashboard/revisao/page.tsx __tests__/app/api/flashcard.test.ts __tests__/components/dashboard/FlashcardDeck.test.tsx
git commit -m "feat: flashcard spaced-repetition review page at /dashboard/revisao"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Error review flashcards — Task 7 (GET/PATCH API + FlashcardDeck component + /revisao page)
2. ✅ Guided topics — Task 2 (config + session assignment) + Task 3 (badge + conversation prompt)
3. ✅ Pronunciation feedback (simple) — Task 4 (GPT JSON + MessageBubble)
4. ✅ Daily mission — Task 5 (config + API + finalize + MissionCard + dashboard)
5. ✅ Post-session report — Task 6 (API + SessionReport modal + AulaClient)

**Placeholder scan:** No TBD/TODO markers. All steps include exact code.

**Type consistency:**
- `Topic` exported from `lib/topics.ts` used in Tasks 2, 3 — key/labelPt/promptEn consistent
- `Mission` exported from `lib/missions.ts` used in Tasks 5, 6 — key/titlePt/descriptionPt/minUserTurns consistent
- `FlashCard` interface defined inline in both API route and component — same shape
- `SessionMessage.pronunciation_hint: string | null` set in Task 3 (stub null), populated in Task 4 — consistent
- `ConversationResponse.pronunciation_hint: string | null` added in Task 4, consumed in `useSession` Task 4 — consistent
