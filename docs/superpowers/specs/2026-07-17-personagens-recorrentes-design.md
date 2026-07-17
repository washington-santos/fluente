# Personagens Recorrentes (NPCs) — Design Spec

**Source:** item #9 of the 12 high-impact improvements tracked in `[[project_roadmap_vision]]` memory — "Personagens recorrentes." Builds on the same "AI that tracks your journey" theme as `[[project_supabase_migration_drift]]`-adjacent features already shipped this cycle (progress evolution page, medalhas inteligentes).

## Problem

Every conversation today happens with a single fixed voice: the student's assigned teacher (Mrs. Carol, Mr. Jake, etc.), speaking as herself even during roleplay scenarios (`lib/mastery.ts`'s `roleplay` methodology instructs the teacher to narrate a scenario, but she never actually becomes a distinct character). There is no sense of a recurring cast the student builds familiarity with over time — every "waiter," "recruiter," or "immigration officer" the student practices with is anonymous and forgotten between sessions. This under-serves the product's core promise of an AI that "accompanies your journey."

## Goal

A small, fixed cast of recurring NPCs (non-player characters) tied to specific roleplay-eligible topics. When a roleplay session lands on one of these topics, the teacher "hands off" the voice to that NPC for the scenario. The NPC remembers the student across sessions — a one-line summary of the last encounter, reused from data already generated elsewhere in the pipeline — and this continuity is surfaced to the student both before the session (an intro note) and during it (a badge showing who they're talking to).

## Non-goals

- **No separate TTS voice or avatar per NPC.** NPCs use the assigned teacher's existing voice and avatar — this is a narrative/text layer on top of the existing conversation engine, not a new audio/video pipeline.
- **No NPC gallery page.** Unlike medalhas (`/dashboard/medalhas`) or evolução (`/dashboard/evolucao`), there is no dedicated browsing page for v1 — NPCs are discovered organically through roleplay sessions.
- **No admin UI for managing the NPC catalog.** `lib/npcs.ts` is a static array in code, matching the existing `lib/topics.ts` pattern.
- **No structured fact memory (à la `personal_details`).** An NPC's memory of the student is a single reused summary string, not a growing list of extracted facts — deliberately leaner than `session_memory`'s shape.
- **No NPCs outside the `roleplay` methodology.** They do not appear in `conversation`/`story`/`challenge`/`game` methodology sessions, nor in `free`-mode practice — scoped strictly to the existing roleplay rotation in `selectNextTopic()`.
- **No AI-generated/ad-hoc NPCs.** The cast is fixed and pre-written for quality and consistency, the same trade-off already made for the 4 teacher personas.

## The NPC catalog (v1, 5 characters)

`lib/npcs.ts` (new), a static array matching the existing `lib/topics.ts` pattern:

```typescript
export interface Npc {
  key: string
  name: string
  emoji: string
  topicKey: string          // the one lib/topics.ts topic this NPC is tied to
  personalityPromptEn: string // short character/role description, injected into the system prompt
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
```

Each NPC maps to exactly one `lib/topics.ts` topic key. Topics without a matching NPC (the large majority) continue to use generic roleplay exactly as today — nothing changes for them.

## Data model

### `sessions.npc_key` (new nullable column)

Mirrors the existing `lesson_topic_id` column's role: identifies which NPC (if any) is voiced in that session. `NULL` for the vast majority of sessions. Set once, at session-creation time in `app/api/lesson/generate/route.ts`, never updated afterward.

### `npc_encounters` (new table)

```sql
CREATE TABLE npc_encounters (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  npc_key               text NOT NULL,
  encounter_count       integer NOT NULL DEFAULT 0,
  first_encountered_at  timestamptz,
  last_encountered_at   timestamptz,
  last_summary_pt       text,
  UNIQUE (user_id, npc_key)
);

ALTER TABLE npc_encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_encounters_self" ON npc_encounters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

One row per (student, NPC) pair, upserted — never one row per encounter. `encounter_count` and the two timestamps grow monotonically; `last_summary_pt` is overwritten each time, holding only the most recent encounter's summary (not a history).

## Data flow

### 1. Selection — `app/api/lesson/generate/route.ts` (modified)

`selectNextTopic()` already returns a `methodology` that can be `'roleplay'` via the existing methodology rotation (`nextMethodology()` in `lib/mastery.ts`). After topic+methodology selection, if `methodology === 'roleplay'`, call `getNpcForTopic(topic.key)`. If it returns an NPC:
- Query `npc_encounters` for `(user.id, npc.key)` to check for a prior encounter.
- Store `npc_key: npc.key` on the `sessions` insert.
- Compute an intro note — first encounter: `"Hoje você vai conhecer ${npc.name}! ${npc.emoji}"`; returning: `"Você vai reencontrar ${npc.name}! Da última vez: ${encounter.last_summary_pt}"` — and attach it to the `intro` lesson step as a new field, `npc_intro_pt`, alongside the existing `choice_explanation_pt` field that step already carries (same mechanism, same step, no new step type).

If `getNpcForTopic` returns `null` (most topics), behavior is unchanged from today — `npc_key` stays `null`, no intro note.

This query is wrapped in the same resilience posture as the rest of this route: if it fails, `npc_key` is simply left unset and the session proceeds as ordinary generic roleplay (never blocks lesson generation).

### 2. Voicing — `app/api/conversation/route.ts` (modified)

Where the route already loads session/teacher/context in its parallel-reads block, add one more conditional read: if `session.npc_key` is set, fetch the matching `npc_encounters` row (for `encounter_count`/`last_summary_pt`) and resolve the NPC's static definition from `lib/npcs.ts`.

Insert a new `npcBlock` into `systemPrompt`'s construction, positioned right after `teacher.system_prompt` (before the existing `topicBlock`/`errorContextBlock`/etc.):

```
ROLEPLAY CHARACTER — CRITICAL: For this session, you are NOT ${teacher.name} the teacher. You are voicing ${npc.name}, ${npc.personalityPromptEn}. Stay in character as ${npc.name} throughout this roleplay scenario.
${encounter && encounter.encounter_count > 0
  ? `You have met this student before (${encounter.encounter_count} time(s)). Last time: "${encounter.last_summary_pt}". Naturally acknowledge you remember them, early in the conversation.`
  : `This is the first time you are meeting this student.`}
You are still fundamentally a supportive English teacher underneath the character — all correction, pedagogy, and JSON-response rules below still apply, just narrated in character as ${npc.name}.
```

Every other instruction in the system prompt (correction detection, JSON response shape, pronunciation hints, intervention timing by CEFR level) is untouched — the NPC is a persona swap layered on the existing pedagogy engine, not a parallel system.

If the `npc_encounters` read fails, treat it as "first encounter" (`encounter_count: 0`, no `last_summary_pt`) rather than failing the conversation turn — matches the resilience posture of this route's other reads.

### 3. Memory update — `app/api/session/[id]/finalize/route.ts` (modified)

Inside the existing `if (msgs.length > 0) { ... }` block, after `generateSessionMemory()` succeeds and `session_memory` is inserted: if the session has `npc_key` set AND `duration_seconds > 0` (same practice-time gate already used for the streak update below it), call a new Postgres RPC, `increment_npc_encounter`, matching the codebase's existing `increment_missions_completed`/`increment_topic_progress` convention for atomic upsert-with-increment (avoids a read-then-write race that a plain client-side `upsert` with a computed `+1` would have):

```sql
CREATE OR REPLACE FUNCTION increment_npc_encounter(p_user_id uuid, p_npc_key text, p_summary_pt text)
RETURNS void AS $$
  INSERT INTO npc_encounters (user_id, npc_key, encounter_count, first_encountered_at, last_encountered_at, last_summary_pt)
  VALUES (p_user_id, p_npc_key, 1, now(), now(), p_summary_pt)
  ON CONFLICT (user_id, npc_key) DO UPDATE SET
    encounter_count = npc_encounters.encounter_count + 1,
    last_encountered_at = now(),
    last_summary_pt = p_summary_pt;
$$ LANGUAGE sql;
```

```typescript
await supabase.rpc('increment_npc_encounter', {
  p_user_id: user.id,
  p_npc_key: session.npc_key,
  p_summary_pt: memory.summary,
})
```

Reuses `memory.summary` — the same value already generated by `generateSessionMemory()` for `session_memory` — for `last_summary_pt`. No additional AI call. Wrapped in the same try/catch as the surrounding memory-generation block: a failure here is logged and never fails the finalize response.

### 4. UI surfacing

**Intro step** (`components/lesson/IntroStep.tsx`, which already renders `choice_explanation_pt`): when the `intro` step carries a non-null `npc_intro_pt`, render it alongside the existing choice-explanation text, same visual treatment.

**Chat header during the roleplay exchange — correction from an earlier draft of this spec:** the natural place to signal "who you're talking to" is NOT `components/aula/TopicBadge.tsx`/`AulaClient.tsx` — that component tree only renders for non-`lesson`-mode sessions (`free`/`scenario`/`guided`/`daily`), and NPC sessions are always `mode: 'lesson'` (created by `/api/lesson/generate`). The actual roleplay conversation for a lesson-mode session happens inside `components/lesson/GuidedConvoStep.tsx` (rendered by `components/lesson/LessonEngine.tsx`), which already calls `/api/conversation` per exchange and already labels each teacher message with a `teacherName`/`teacherImageUrl` pair (currently always the real teacher's).

`LessonEngine` already receives the full `lesson: GeneratedLesson` object, which includes the intro step carrying the new `npc_key` field. `LessonEngine` resolves `const npc = npcKey ? getNpcByKey(npcKey) : null` once, and when rendering `GuidedConvoStep`, passes `teacherName={npc?.name ?? teacherName}` while leaving `teacherImageUrl` unchanged (still the real teacher's photo — no separate avatar per NPC, per the non-goals above). This means the chat bubbles during roleplay show "Tom" instead of the teacher's name, with no new fetch and no change needed to `AulaClient.tsx` or `TopicBadge.tsx` at all.

## Testing

- `__tests__/lib/npcs.test.ts` (new): catalog has exactly 5 NPCs; `getNpcForTopic()` returns the correct NPC for each of the 5 mapped topic keys; returns `null` for a topic key with no NPC (e.g. `'family'`).
- `__tests__/app/api/session/finalize.test.ts` (modified): new case asserting the `npc_encounters` upsert fires with the memory summary when `session.npc_key` is set and `duration_seconds > 0`; a case confirming sessions without `npc_key` never touch `npc_encounters`.
- Lesson-generate route tests (modified): case confirming `npc_key` and `npc_intro_pt` are set when methodology resolves to `'roleplay'` on an NPC-mapped topic (both first-encounter and returning-encounter phrasing); case confirming no NPC fields are set for a roleplay session on a non-NPC topic.
- Conversation route tests (modified): case confirming `npcBlock` appears in the constructed system prompt when `session.npc_key` is set, with the correct first-time vs. returning-encounter phrasing.
- `LessonEngine` tests (modified): case confirming `GuidedConvoStep` receives the NPC's name (not the teacher's) as `teacherName` when the lesson's intro step carries a matching `npc_key`, and that `teacherImageUrl` is unchanged.
- No new test for `lib/npcs.ts`'s static `NPCS` array beyond the count/lookup checks above — it's plain data, same precedent as `TOPICS_BY_LEVEL` in `lib/topics.ts`.

## Rollout

One new migration (`sessions.npc_key` column + `npc_encounters` table). No feature flag — ships as one plan, same as prior features this cycle. After merging, per this project's known drift pattern: the migration needs manual `apply_migration` against the live Supabase project, and a fresh `vercel --prod` run — neither happens automatically on merge/push.
