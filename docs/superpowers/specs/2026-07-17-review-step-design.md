# Religar o ReviewStep — Design Spec

**Source:** discovered during investigation of roadmap item #6 ("Explicações simples") — `docs/superpowers/specs/2026-07-15-explicit-grammar-teaching-design.md`'s "Non-goals" section flagged, as an aside: *"`ReviewStep`/`components/lesson/ReviewStep.tsx` is fully built and tested but never emitted by `buildSteps()` — a pre-existing, unrelated gap, not something this feature touches or fixes."* Investigated on user request; confirmed still true and worth fixing.

## Problem

`components/lesson/ReviewStep.tsx` is a fully built, fully tested active-recall flashcard component (show word → student tries to recall → reveal translation → mark "sabia"/"não sabia" → summary), and `components/lesson/LessonEngine.tsx:203` already has a render case for `step.type === 'review'`. But `buildSteps()` in `app/api/lesson/generate/route.ts` never constructs a step of that type, so the component is unreachable in production — paid-for work sitting unused. The component dates to July 4 (commit `dca611f`), from an earlier static-route lesson architecture (`/licao/[slug]`) that no longer exists; when the app moved to the current dynamic `/api/lesson/generate` + `LessonEngine` pipeline, `GuidedConvoStep` was carried forward and adapted, but `ReviewStep` was not.

## Goal

Every generated lesson includes an active-recall review moment for its own vocabulary, positioned right after the last `vocab_repeat` step and before `listening_present` — reusing the existing component and type exactly as built, with one new line in `buildSteps()`.

## Non-goals

- **No AI-generated `instruction_pt` for this step.** A fixed Portuguese string is used, matching the precedent already set by `guided_convo`'s two steps (`'Converse usando o que você aprendeu hoje.'`, `'Use tudo que você aprendeu nesta aula para ir além.'`), both hardcoded, not AI-generated. Adding AI generation for a one-line instruction would be unjustified prompt-engineering overhead.
- **No propagation of the flashcard result** (words known/not known) beyond the summary already shown inline by `ReviewStep` itself. It does not feed `LessonEngine`'s struggle-event counter, `vocabScores`, or any database table — deliberately kept as a self-contained self-check, not mixed with the objective right/wrong signal exercises already provide.
- **No conditional skip logic.** Every CEFR level's lesson shape (`lib/lesson-shape.ts`) generates at least 3 vocabulary words (A1) up to 6 (C2) — never fewer — so the flashcard never has a degenerate 0-1-card case. The step is unconditionally included in every lesson.
- **No changes to `components/lesson/ReviewStep.tsx`, `types/lesson.ts`, or `LessonEngine.tsx`** — all three are already correct and already tested; this is purely a `buildSteps()` wiring fix.

## The change

### `app/api/lesson/generate/route.ts` (modified)

In `buildSteps()`, immediately after the existing `vocab_repeat` step push (the block guarded by `if (lastVocab) { steps.push({ type: 'vocab_repeat', ... }) }`) and before the `listening_present` step push, add:

```typescript
steps.push({
  id: nextId('rv'),
  type: 'review',
  instruction_pt: 'Vamos revisar o que você aprendeu! Tente lembrar antes de ver a tradução.',
})
```

Resulting sequence: `[warmup_review]?` → `intro` → `grammar_present` → grammar exercise → (`vocab_present` → exercise) × N → `vocab_repeat` → **`review`** → `listening_present` → 2 comprehension questions → `guided_convo` × 2 → `summary`.

No other file changes. `types/lesson.ts`'s `ReviewStep` interface, `components/lesson/ReviewStep.tsx`, and `LessonEngine.tsx`'s render case are already correct as-is and untouched by this change.

## Testing

- `__tests__/app/api/lesson/generate.test.ts` (modified): one new case confirming `buildSteps()`'s output includes a `type: 'review'` step immediately after the `vocab_repeat` step and immediately before `listening_present`, using the same index-based assertion style the file's existing sequencing tests already use (e.g. `steps[vocabRepeatIndex + 1].type`).
- No new test for `ReviewStep.tsx` or `LessonEngine.tsx`'s `'review'` case — both already have passing test coverage (`__tests__/components/lesson/ReviewStep.test.tsx` already exists and already passes); this change only makes that already-tested code reachable in production, it doesn't change its behavior.
- Manual pass: complete a lesson through to the end and confirm the flashcard review screen appears right after finishing the last vocabulary word's pronunciation practice, before the listening passage.

## Rollout

No database changes, no schema, no feature flag, no AI prompt changes — a single new line in an existing function. Ships as one plan. After merging, the usual `vercel --prod` (no `apply_migration` step needed).
