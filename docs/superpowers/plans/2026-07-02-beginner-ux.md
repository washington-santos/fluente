# Beginner UX — Aula Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 UX features to the `/aula` screen that eliminate the "I don't know what to do next" feeling for A1/A2 students: suggestion chips, translation toggle, "Não entendi" button, pre-record prompt hint, always-visible text input, and a session phase indicator.

**Architecture:** GPT already returns JSON per turn; we extend it with 3 new fields (`suggested_replies`, `reply_pt`, `prompt_hint`). These flow through `ConversationResponse` → `useSession` → `AulaClient` → UI components. Two new components (`TextInput`, `PhaseIndicator`) are created; `MessageBubble` is extended with two optional features. `PanicButton` is retired in place of always-visible `TextInput`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind design tokens, OpenAI GPT-4o-mini, Vitest + @testing-library/react.

## Global Constraints

- All UI copy in Brazilian Portuguese; English only inside AI system prompt content
- No new npm packages
- Tailwind design tokens only: `bg-surface-light`, `bg-surface-dark`, `bg-surface-light-card`, `bg-surface-dark-card`, `text-content-light`, `text-content-light-secondary`, `text-content-dark`, `text-content-dark-secondary`, `bg-brand-cta`, `bg-brand-interactive`, `bg-brand-streak`
- `createSupabaseServer()` for all DB reads/writes
- Component test files need `// @vitest-environment jsdom` at line 1 (unless the file already exists without it and tests pass — check first)
- API test files need `// @vitest-environment node` at line 1

---

### Task 1: Extend GPT output with suggested_replies, reply_pt, prompt_hint

**Files:**
- Modify: `app/api/conversation/route.ts`
- Modify: `types/index.ts`
- Modify: `hooks/useSession.ts`
- Modify: `__tests__/app/api/conversation.test.ts`

**Interfaces:**
- Produces: `ConversationResponse.suggested_replies: string[] | null`, `ConversationResponse.reply_pt: string | null`, `ConversationResponse.prompt_hint: string | null`
- Produces: `SessionMessage.suggested_replies: string[] | null`, `SessionMessage.reply_pt: string | null`
- Produces: `UseSessionReturn.lastPromptHint: string | null`

- [ ] **Step 1: Update `types/index.ts` — add 3 fields to ConversationResponse**

In `types/index.ts`, find `ConversationResponse` and replace the entire interface:

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
  suggested_replies: string[] | null
  reply_pt: string | null
  prompt_hint: string | null
}
```

- [ ] **Step 2: Update `app/api/conversation/route.ts` — extend ClaudeOutput interface**

Find the `ClaudeOutput` interface and replace it:

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
  suggested_replies: string[] | null
  reply_pt: string | null
  prompt_hint: string | null
}
```

- [ ] **Step 3: Update catch block fallback in route.ts**

Find:
```typescript
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null }
```
Replace with:
```typescript
    parsed = { reply: rawText, correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null, suggested_replies: null, reply_pt: null, prompt_hint: null }
```

- [ ] **Step 4: Parse the 3 new fields in route.ts**

After the `newWordsRaw` block (around line 215), add:

```typescript
  const suggestedRepliesRaw: string[] | null = Array.isArray(parsed.suggested_replies)
    ? (parsed.suggested_replies as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, 3)
    : null

  const replyPt: string | null = (typeof parsed.reply_pt === 'string' && parsed.reply_pt.length > 0)
    ? parsed.reply_pt
    : null

  const promptHint: string | null = (typeof parsed.prompt_hint === 'string' && parsed.prompt_hint.length > 0)
    ? parsed.prompt_hint
    : null
```

- [ ] **Step 5: Update system prompt JSON template and instructions in route.ts**

Find:
```typescript
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null}
```
Replace with:
```typescript
{"reply":"<teacher spoken response>","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":null,"new_words":null,"suggested_replies":null,"reply_pt":null,"prompt_hint":null}
```

Then find:
```typescript
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.`
```
Replace with:
```typescript
For new_words: pick 1-3 vocabulary words or phrases from THIS exchange that are above A2 level and worth memorizing. For each provide a definition in English under 10 words. If no noteworthy vocabulary appeared, set new_words to null.
For suggested_replies: provide 2-3 very short English phrases (under 8 words each) the student could realistically say next, appropriate for ${cefrLevel} level. If no student response is needed, set to null.
For reply_pt: always provide a Brazilian Portuguese translation of your "reply" field.
For prompt_hint: if the student might not know how to start responding, provide a short tip in Portuguese starting with "Tente dizer:" (e.g., "Tente dizer: My name is ___"). Set to null if the expected response is obvious.`
```

- [ ] **Step 6: Add 3 new fields to the response object in route.ts**

Find `const response: ConversationResponse = {` and add the 3 fields before the closing `}`:

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
    suggested_replies: suggestedRepliesRaw,
    reply_pt: replyPt,
    prompt_hint: promptHint,
  }
```

- [ ] **Step 7: Update `hooks/useSession.ts` — extend SessionMessage + add lastPromptHint**

Find the `SessionMessage` interface and replace:

```typescript
interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  had_correction: boolean
  pronunciation_hint: string | null
  suggested_replies: string[] | null
  reply_pt: string | null
}
```

Find the `UseSessionReturn` interface and add `lastPromptHint: string | null` after `quotaInfo`:

```typescript
interface UseSessionReturn {
  sessionId: string | null
  topic: string | null
  messages: SessionMessage[]
  loading: boolean
  sending: boolean
  initError: string | null
  turnError: string | null
  quotaExceeded: boolean
  quotaInfo: { minutesUsed: number; minutesLimit: number } | null
  lastPromptHint: string | null
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}
```

Add state after `quotaInfo` state:
```typescript
  const [lastPromptHint, setLastPromptHint] = useState<string | null>(null)
```

At the start of the `sendTurn` try body, after `setSending(true)`, add:
```typescript
    setLastPromptHint(null)
```

After `setMessages((prev) => [...])` in sendTurn, add:
```typescript
      setLastPromptHint(data.prompt_hint ?? null)
```

Update the setMessages call to include the new fields:
```typescript
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: userText, audio_url: null, had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { role: 'assistant', text: data.text, audio_url: data.audio_url, had_correction: data.had_correction, pronunciation_hint: data.pronunciation_hint ?? null, suggested_replies: data.suggested_replies ?? null, reply_pt: data.reply_pt ?? null },
      ])
```

Add `lastPromptHint` to the return statement:
```typescript
  return { sessionId, topic, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, lastPromptHint, sendTurn, endSession }
```

- [ ] **Step 8: Update the conversation test mock to include new fields**

In `__tests__/app/api/conversation.test.ts`, find `mockChatCreate` and update the JSON string inside `content`:

```typescript
const { mockChatCreate, mockMessagesInsert } = vi.hoisted(() => ({
  mockChatCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":"Try to buzz the \'th\' sound, like in \'the\'.","new_words":[{"word":"negotiate","definition":"to discuss terms to reach agreement"}],"suggested_replies":["I\'m doing well, thanks!","I\'m fine."],"reply_pt":"Olá Ana!","prompt_hint":"Tente dizer: I\'m doing well."}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }),
  mockMessagesInsert: vi.fn().mockResolvedValue({ error: null }),
}))
```

Then in the first test (`returns text, audio_url, and had_correction=false on clean turn`), after the existing assertions, add:

```typescript
    expect(body).toHaveProperty('suggested_replies')
    expect(body).toHaveProperty('reply_pt')
    expect(body).toHaveProperty('prompt_hint')
    expect(Array.isArray(body.suggested_replies) || body.suggested_replies === null).toBe(true)
    expect(typeof body.reply_pt === 'string' || body.reply_pt === null).toBe(true)
```

- [ ] **Step 9: Run tests and verify**

```
npx vitest run __tests__/app/api/conversation.test.ts
```

Expected: all tests pass (12+ tests). TypeScript: `npx tsc --noEmit` — clean.

- [ ] **Step 10: Commit**

```
git add app/api/conversation/route.ts types/index.ts hooks/useSession.ts __tests__/app/api/conversation.test.ts
git commit -m "feat: extend GPT output with suggested_replies, reply_pt, and prompt_hint"
```

---

### Task 2: MessageBubble — translation toggle and suggestion chips

**Files:**
- Modify: `components/aula/MessageBubble.tsx`
- Modify: `__tests__/components/aula/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: Task 1 types (no imports needed — props are primitives)
- Produces: `MessageBubble` accepts `replyPt?: string | null`, `suggestedReplies?: string[] | null`, `onChipClick?: (text: string) => void`

- [ ] **Step 1: Write failing tests**

Add to the end of `__tests__/components/aula/MessageBubble.test.tsx` (keep all existing tests, append these):

```typescript
import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
```

Add at the top of the file after the existing imports (if not already present) or just append the describe blocks:

```typescript
describe('MessageBubble — translation toggle', () => {
  it('shows translation button for assistant messages with replyPt', () => {
    render(<MessageBubble role="assistant" text="Hello!" hadCorrection={false} replyPt="Olá!" />)
    expect(screen.getByTestId('btn-toggle-translation')).toBeInTheDocument()
  })

  it('hides translation by default and shows it on click', () => {
    render(<MessageBubble role="assistant" text="Hello!" hadCorrection={false} replyPt="Olá!" />)
    expect(screen.queryByTestId('reply-translation')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-toggle-translation'))
    expect(screen.getByTestId('reply-translation')).toHaveTextContent('Olá!')
  })

  it('does not show translation button for user messages', () => {
    render(<MessageBubble role="user" text="Hello" hadCorrection={false} replyPt="Olá" />)
    expect(screen.queryByTestId('btn-toggle-translation')).not.toBeInTheDocument()
  })
})

describe('MessageBubble — suggestion chips', () => {
  it('renders chips for assistant messages and calls onChipClick', () => {
    const onChipClick = vi.fn()
    render(
      <MessageBubble
        role="assistant"
        text="What's your name?"
        hadCorrection={false}
        suggestedReplies={['My name is Ana.', "I'm Ana."]}
        onChipClick={onChipClick}
      />
    )
    expect(screen.getByTestId('suggestion-chips')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('chip-0'))
    expect(onChipClick).toHaveBeenCalledWith('My name is Ana.')
  })

  it('does not render chips for user messages', () => {
    render(
      <MessageBubble role="user" text="Hello" hadCorrection={false} suggestedReplies={['test']} onChipClick={vi.fn()} />
    )
    expect(screen.queryByTestId('suggestion-chips')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run __tests__/components/aula/MessageBubble.test.tsx
```

Expected: 5 new tests FAIL (existing 7 still pass).

- [ ] **Step 3: Implement the updated MessageBubble component**

Replace `components/aula/MessageBubble.tsx` entirely:

```typescript
'use client'

import { useState } from 'react'
import { Mic, Eye, EyeOff } from 'lucide-react'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
  pronunciationHint?: string | null
  replyPt?: string | null
  suggestedReplies?: string[] | null
  onChipClick?: (text: string) => void
}

export function MessageBubble({ role, text, hadCorrection, pronunciationHint, replyPt, suggestedReplies, onChipClick }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [showTranslation, setShowTranslation] = useState(false)

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
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
        {!isUser && replyPt && (
          <div className="mt-2">
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="flex items-center gap-1 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors"
              aria-label={showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
              data-testid="btn-toggle-translation"
            >
              {showTranslation ? <EyeOff size={12} /> : <Eye size={12} />}
              {showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
            </button>
            {showTranslation && (
              <p className="mt-1 text-xs text-content-light-secondary dark:text-content-dark-secondary italic" data-testid="reply-translation">
                {replyPt}
              </p>
            )}
          </div>
        )}
      </div>
      {!isUser && suggestedReplies && suggestedReplies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 max-w-[80%]" data-testid="suggestion-chips">
          {suggestedReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => onChipClick?.(reply)}
              className="px-3 py-1.5 rounded-full text-xs border border-brand-interactive text-brand-interactive hover:bg-brand-interactive hover:text-white transition-colors"
              data-testid={`chip-${i}`}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify all pass**

```
npx vitest run __tests__/components/aula/MessageBubble.test.tsx
```

Expected: 12 tests pass (7 existing + 5 new).

- [ ] **Step 5: TypeScript check**

```
npx tsc --noEmit
```

Expected: clean (no errors).

- [ ] **Step 6: Commit**

```
git add components/aula/MessageBubble.tsx __tests__/components/aula/MessageBubble.test.tsx
git commit -m "feat: MessageBubble with translation toggle and suggestion chips"
```

---

### Task 3: TextInput component (always visible) + AulaClient wiring

**Files:**
- Create: `components/aula/TextInput.tsx`
- Create: `__tests__/components/aula/TextInput.test.tsx`
- Modify: `app/aula/AulaClient.tsx`

**Interfaces:**
- Consumes: Task 1 `SessionMessage.suggested_replies`, `SessionMessage.reply_pt`
- Consumes: Task 2 `MessageBubble` props `replyPt`, `suggestedReplies`, `onChipClick`
- Produces: `TextInput` component with props `{ value, onChange, onSubmit, onNaoEntendi, disabled }`

- [ ] **Step 1: Write failing tests for TextInput**

Create `__tests__/components/aula/TextInput.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TextInput } from '@/components/aula/TextInput'

describe('TextInput', () => {
  it('renders text input and send button always visible', () => {
    render(<TextInput value="" onChange={vi.fn()} onSubmit={vi.fn()} onNaoEntendi={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('text-input')).toBeInTheDocument()
    expect(screen.getByTestId('btn-send-text')).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed text on form submit', () => {
    const onSubmit = vi.fn()
    render(<TextInput value="  hello  " onChange={vi.fn()} onSubmit={onSubmit} onNaoEntendi={vi.fn()} disabled={false} />)
    fireEvent.submit(screen.getByTestId('text-input').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('hello')
  })

  it('does not call onSubmit when value is blank', () => {
    const onSubmit = vi.fn()
    render(<TextInput value="   " onChange={vi.fn()} onSubmit={onSubmit} onNaoEntendi={vi.fn()} disabled={false} />)
    fireEvent.submit(screen.getByTestId('text-input').closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders Não entendi button and calls onNaoEntendi on click', () => {
    const onNaoEntendi = vi.fn()
    render(<TextInput value="" onChange={vi.fn()} onSubmit={vi.fn()} onNaoEntendi={onNaoEntendi} disabled={false} />)
    fireEvent.click(screen.getByTestId('btn-nao-entendi'))
    expect(onNaoEntendi).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run __tests__/components/aula/TextInput.test.tsx
```

Expected: 4 tests FAIL (module not found).

- [ ] **Step 3: Create `components/aula/TextInput.tsx`**

```typescript
'use client'

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (text: string) => void
  onNaoEntendi: () => void
  disabled: boolean
}

export function TextInput({ value, onChange, onSubmit, onNaoEntendi, disabled }: TextInputProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite sua resposta em inglês..."
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          data-testid="text-input"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2 rounded-xl bg-brand-cta text-white text-sm font-semibold disabled:opacity-50"
          data-testid="btn-send-text"
        >
          Enviar
        </button>
      </form>
      <button
        type="button"
        onClick={onNaoEntendi}
        disabled={disabled}
        className="self-start text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors disabled:opacity-40"
        data-testid="btn-nao-entendi"
      >
        🤔 Não entendi
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run __tests__/components/aula/TextInput.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Update `app/aula/AulaClient.tsx`**

Make these changes:

**a) Replace PanicButton import with TextInput:**

Remove:
```typescript
import { PanicButton } from '@/components/aula/PanicButton'
```
Add:
```typescript
import { TextInput } from '@/components/aula/TextInput'
```

**b) Add `textValue` state after `videoUrl` state:**
```typescript
  const [textValue, setTextValue] = useState('')
```

**c) Add `handleChipClick` after `handleEnd`:**
```typescript
  const handleChipClick = useCallback((text: string) => {
    setTextValue(text)
  }, [])

  function handleNaoEntendi() {
    handleTurn("Could you please say that again more simply? I didn't understand.")
  }
```

**d) Update `handleTurn` to clear textValue:**
```typescript
  const handleTurn = useCallback(async (input: File | string) => {
    setTextValue('')
    const response = await sendTurn(input)
    if (!response) return
    playAudio(response)
  }, [sendTurn])
```

**e) Update the `messages.map` block:**

Replace:
```typescript
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} hadCorrection={m.had_correction} pronunciationHint={m.pronunciation_hint} />
        ))}
```

With:
```typescript
        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !sending
          return (
            <MessageBubble
              key={i}
              role={m.role}
              text={m.text}
              hadCorrection={m.had_correction}
              pronunciationHint={m.pronunciation_hint}
              replyPt={m.role === 'assistant' ? m.reply_pt : undefined}
              suggestedReplies={isLastAssistant ? m.suggested_replies : undefined}
              onChipClick={isLastAssistant ? handleChipClick : undefined}
            />
          )
        })}
```

**f) Replace PanicButton JSX with TextInput:**

Remove:
```typescript
            {!isRecording && (
              <PanicButton onSubmit={(text) => handleTurn(text)} disabled={sending || loading} />
            )}
```

Add:
```typescript
            {!isRecording && (
              <TextInput
                value={textValue}
                onChange={setTextValue}
                onSubmit={(text) => handleTurn(text)}
                onNaoEntendi={handleNaoEntendi}
                disabled={sending || loading}
              />
            )}
```

- [ ] **Step 6: TypeScript check**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Run full test suite**

```
npx vitest run __tests__/components/aula/TextInput.test.tsx __tests__/components/aula/MessageBubble.test.tsx __tests__/app/api/conversation.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit**

```
git add components/aula/TextInput.tsx __tests__/components/aula/TextInput.test.tsx app/aula/AulaClient.tsx
git commit -m "feat: always-visible TextInput with Não entendi button, suggestion chip wiring"
```

---

### Task 4: PhaseIndicator + prompt_hint display

**Files:**
- Create: `components/aula/PhaseIndicator.tsx`
- Create: `__tests__/components/aula/PhaseIndicator.test.tsx`
- Modify: `app/aula/AulaClient.tsx`

**Interfaces:**
- Consumes: Task 1 `UseSessionReturn.lastPromptHint`
- Produces: `PhaseIndicator` component with prop `assistantMessageCount: number`

- [ ] **Step 1: Write failing tests for PhaseIndicator**

Create `__tests__/components/aula/PhaseIndicator.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PhaseIndicator } from '@/components/aula/PhaseIndicator'

describe('PhaseIndicator', () => {
  it('shows Aquecimento active at 0 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={0} />)
    expect(screen.getByTestId('phase-0')).toHaveClass('bg-brand-interactive')
    expect(screen.getByTestId('phase-1')).not.toHaveClass('bg-brand-interactive')
  })

  it('shows Revisão de erros active at 2 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={2} />)
    expect(screen.getByTestId('phase-1')).toHaveClass('bg-brand-interactive')
    expect(screen.getByTestId('phase-0')).not.toHaveClass('bg-brand-interactive')
  })

  it('shows Prática active at 4 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={4} />)
    expect(screen.getByTestId('phase-2')).toHaveClass('bg-brand-interactive')
  })

  it('shows Conversa livre active at 10 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={10} />)
    expect(screen.getByTestId('phase-3')).toHaveClass('bg-brand-interactive')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run __tests__/components/aula/PhaseIndicator.test.tsx
```

Expected: 4 tests FAIL (module not found).

- [ ] **Step 3: Create `components/aula/PhaseIndicator.tsx`**

```typescript
interface PhaseIndicatorProps {
  assistantMessageCount: number
}

const PHASES = [
  { label: 'Aquecimento', minCount: 0 },
  { label: 'Revisão de erros', minCount: 2 },
  { label: 'Prática', minCount: 4 },
  { label: 'Conversa livre', minCount: 10 },
] as const

export function PhaseIndicator({ assistantMessageCount }: PhaseIndicatorProps) {
  const currentIndex = PHASES.reduce((acc, phase, i) => {
    return assistantMessageCount >= phase.minCount ? i : acc
  }, 0)

  return (
    <div className="flex items-center justify-center gap-1 px-4 flex-wrap" data-testid="phase-indicator">
      {PHASES.map((phase, i) => (
        <div key={phase.label} className="flex items-center gap-1">
          {i > 0 && <div className="w-3 h-px bg-gray-200 dark:bg-slate-700" />}
          <span
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              i === currentIndex
                ? 'bg-brand-interactive text-white'
                : i < currentIndex
                ? 'text-brand-interactive'
                : 'text-content-light-secondary dark:text-content-dark-secondary'
            }`}
            data-testid={`phase-${i}`}
          >
            {phase.label}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run __tests__/components/aula/PhaseIndicator.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Update `app/aula/AulaClient.tsx` — add PhaseIndicator and prompt_hint**

**a) Add import:**
```typescript
import { PhaseIndicator } from '@/components/aula/PhaseIndicator'
```

**b) Destructure `lastPromptHint` from useSession:**

Find:
```typescript
  const { sessionId, topic, messages, loading, sending, turnError, initError, quotaExceeded, quotaInfo, sendTurn, endSession } = useSession(teacher.id)
```
Replace with:
```typescript
  const { sessionId, topic, messages, loading, sending, turnError, initError, quotaExceeded, quotaInfo, lastPromptHint, sendTurn, endSession } = useSession(teacher.id)
```

**c) Compute assistantMessageCount** (add after the state declarations):
```typescript
  const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length
```

**d) Add PhaseIndicator below TopicBadge section:**

Find:
```typescript
      {topic && getTopicByKey(topic) && (
        <div className="flex justify-center pb-2 shrink-0">
          <TopicBadge topic={getTopicByKey(topic)!.labelPt} />
        </div>
      )}
```
Replace with:
```typescript
      {topic && getTopicByKey(topic) && (
        <div className="flex justify-center pb-2 shrink-0">
          <TopicBadge topic={getTopicByKey(topic)!.labelPt} />
        </div>
      )}

      <div className="pb-1 shrink-0">
        <PhaseIndicator assistantMessageCount={assistantMessageCount} />
      </div>
```

**e) Add prompt_hint display above RecordButton:**

Find:
```typescript
            <RecordButton
```
Add immediately before it:
```typescript
            {lastPromptHint && !isRecording && !sending && (
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center px-4" data-testid="prompt-hint">
                💡 {lastPromptHint}
              </p>
            )}
```

- [ ] **Step 6: TypeScript check**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Run full test suite**

```
npx vitest run
```

Expected: all tests pass (191+ tests across 46+ files).

- [ ] **Step 8: Commit**

```
git add components/aula/PhaseIndicator.tsx __tests__/components/aula/PhaseIndicator.test.tsx app/aula/AulaClient.tsx
git commit -m "feat: session phase indicator and pre-record prompt hint for beginners"
```
