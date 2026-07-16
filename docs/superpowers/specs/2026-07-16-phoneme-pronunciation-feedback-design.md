# Phoneme-Level Pronunciation Feedback — Design Spec

**Source:** item #5 (the last item) of the 5-item pedagogical improvement list identified after reviewing the shipped level state machine. Items #1 (in-lesson adaptive difficulty), #2 (explicit grammar teaching), #3 (automatic level promotion), and #4 (dedicated listening exercise) are already shipped.

## Problem

Pronunciation is currently assessed by transcribing the student's recording with Whisper and then asking `gpt-4o-mini` to compare the **transcribed text** against the target word. Whisper's language model already biases transcription toward the nearest valid English word, so a mispronounced sound is frequently "corrected" away before the assessment model ever sees it — the pipeline judges what the student *probably meant to say*, not what they actually *said*. The resulting feedback (`feedback_pt`) is generic ("quase lá, tente de novo") because the assessment model has no access to the actual sound the student produced, only a word-level guess.

## Goal

When a student mispronounces a word in `VocabRepeatStep`, give them a specific, plain-language explanation of which sound was wrong — derived from an assessment model that actually listens to the audio, not one that reasons over an already-corrected transcript.

## Non-goals

- **No change to `GuidedConvoStep` or any other speaking step.** Free-form conversation has no single "target word" to assess against, and analyzing full-sentence audio for phoneme-level errors is a materially different, larger problem. Scope is `VocabRepeatStep` only.
- **No change to the shared `useAudioRecorder` hook or its output format.** It continues to record webm/mp4 exactly as it does today, for every step that uses it (including `GuidedConvoStep`). All new handling of the audio format lives entirely inside the `/api/lesson/assess` route.
- **No IPA symbols on screen.** Feedback is a plain Portuguese sentence describing the sound in accessible terms (e.g. "o som TH precisa da língua entre os dentes"), not phonetic notation.
- **No new third-party vendor.** The feature stays on OpenAI, the vendor already used for every other AI call in this app — it switches from a Whisper-transcription-then-text-judgment pipeline to a single OpenAI audio-input model call.
- **No change to scoring semantics.** `assessment` (`'correct' | 'close' | 'incorrect'`), `score` (0–1), the 3-attempt cap, `canAdvance` logic, and the adaptive-difficulty struggle-event threshold (`score < 0.6`) in `LessonEngine.tsx` are all unchanged — only the *origin* of the judgment changes (real audio instead of a transcribed-and-corrected text guess), not its shape or its downstream consumers.

## Architecture

### Audio format constraint

`gpt-4o-mini-audio-preview` (OpenAI's audio-input-capable chat model) only accepts `wav` or `mp3` as an input audio format. The browser records `webm` (or `mp4` as a fallback) via `MediaRecorder`, per `hooks/useAudioRecorder.ts`. A transcoding step is required before the audio can be sent to the model.

This transcoding happens **server-side only**, inside `app/api/lesson/assess/route.ts`'s `type === 'pronunciation'` branch, using `ffmpeg-static` (a prebuilt, statically-linked `ffmpeg` binary distributed as an npm package, invoked via Node's `child_process`). The uploaded blob is written to a temp file, transcoded to a mono 16kHz WAV temp file, read back as a buffer, and both temp files are deleted. No other route or component is touched by this conversion.

**Model name caveat:** this spec refers to the audio-input-capable chat model as `gpt-4o-mini-audio-preview` throughout. Confirm the exact current model ID against OpenAI's live model list at implementation time — model names for preview/audio-capable variants change over time, and using a stale or incorrect ID would fail at the first API call rather than at review time.

### Replacing the assessment pipeline

The current `type === 'pronunciation'` branch does:
1. Transcribe the audio with `whisper-1` → text.
2. Ask `gpt-4o-mini` to compare that text against `target`, in a text-only prompt.

This is replaced with:
1. Transcode the uploaded audio blob to WAV (see above).
2. Send the WAV audio directly to `gpt-4o-mini-audio-preview` via `chat.completions.create`, using the `input_audio` content type (base64-encoded WAV, `format: 'wav'`), in a single call that both listens to the audio and produces the full assessment — no separate transcription step.

The Whisper transcription step is removed entirely from this branch (the `panicText` fallback — accepting a `text` form field instead of audio — is preserved unchanged, since there's no audio to analyze in that case; the existing text-comparison prompt is reused only for that fallback path).

### Prompt and response shape

The audio-model prompt asks for the same fields as today (`assessment`, `score`, `feedback_pt`) plus one new field:

```
{"assessment":"close","score":0.55,"feedback_pt":"Quase lá! Preste atenção no som final.","phoneme_note_pt":"Você disse thing como \"ting\" — o som TH precisa da língua entre os dentes, não só um T."}
```

- `phoneme_note_pt: string | null` — a single plain-Portuguese sentence naming the specific sound that was wrong and how to fix it. `null` when `assessment` is `'correct'` (nothing to correct).
- All other fields keep their existing meaning and are still produced by the model in the same response — this is one call replacing two, not an additional call layered on top.

### `app/api/lesson/assess/route.ts`

- New import: `ffmpeg-static` (binary path) and Node's `child_process`/`fs`/`os` for the transcode step.
- The `type === 'pronunciation'` branch, when audio is present (not the `panicText` fallback), transcodes then calls `gpt-4o-mini-audio-preview` with the `input_audio` content block, replacing the current `whisper-1` + text-prompt calls.
- Response JSON gains `phoneme_note_pt`.
- If ffmpeg transcoding fails, or the audio-model call fails or returns unparseable JSON, the route returns the same generic error response it does today (`{ error: ... }`, 500) — no dual-pipeline fallback to the old Whisper path. This matches the existing error-handling shape the frontend already handles (`VocabRepeatStep`'s `catch` block shows "Erro ao avaliar. Tente novamente.").

### `components/lesson/VocabRepeatStep.tsx`

- `AssessResult` type gains `phoneme_note_pt: string | null`.
- When `result.phoneme_note_pt` is present, render it as an additional line inside the existing feedback card, below `feedback_pt`, in the same card (no new card, no new visual state) — styled as secondary text (`text-xs`, muted color) to read as a supporting detail under the main feedback line.

## Testing

- **Transcode helper:** if the transcode logic is extracted into a small pure-ish helper (e.g. `lib/transcode-audio.ts` wrapping the `ffmpeg-static` child-process call), unit-test it with a real short sample webm fixture, asserting the output buffer is valid WAV (correct RIFF header). If it's not extracted and stays inline in the route, cover it via the route-level test's mocked child_process instead.
- **API test (`__tests__/app/api/lesson/assess.test.ts`):** mock the transcode step and the OpenAI audio-model call; assert the route sends `input_audio` with `format: 'wav'` to `gpt-4o-mini-audio-preview` (not `whisper-1`), and that the JSON response includes `phoneme_note_pt`. Add a case verifying `phoneme_note_pt` is `null` when the mocked model returns `assessment: 'correct'`. Preserve the existing `panicText` fallback test unchanged (still text-only, still no audio call).
- **Component test (`__tests__/components/lesson/VocabRepeatStep.test.tsx`):** assert `phoneme_note_pt` renders as a visible line when present, and that nothing extra renders when it's `null` (e.g. on a `'correct'` result).
- **Manual pass:** record a deliberately mispronounced word in `VocabRepeatStep`, confirm the feedback card shows a specific, plain-Portuguese sound explanation (not a generic "tente novamente"), and confirm a correctly pronounced word shows no phoneme note.

## Rollout

- New npm dependency: `ffmpeg-static`. Verify the resulting serverless function bundle size stays within Vercel's function size limit before shipping (the binary is tens of MB) — flag this explicitly at implementation time, since it's the one part of this feature with real deployment risk the previous four features didn't have.
- No database changes — the response shape change is API-only, and `topic_assessments.pronunciation` (the session-level competency score used by `PronunciationScoreCard`) is computed by a separate route (`/api/session/[id]/assess`) untouched by this feature.
- No feature flag — ships as one plan, same as every prior feature this session.
