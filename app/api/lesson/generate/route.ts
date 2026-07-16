import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import OpenAI from 'openai'
import { getStudentContext } from '@/lib/student-context'
import { getTopicsForLevel } from '@/lib/topics'
import { getLessonShape } from '@/lib/lesson-shape'
import { METHODOLOGY_INSTRUCTIONS, METHODOLOGY_NAMES_PT } from '@/lib/mastery'
import type { Topic } from '@/lib/topics'
import type { Methodology } from '@/lib/mastery'
import type { CefrLevel } from '@/types'
import type { GeneratedLesson, LessonStep, VocabItem, LearningObjective } from '@/types/lesson'

interface TopicProgress {
  topic_id: string
  mastery_status: string | null
  last_methodology: string | null
  next_review_at: string | null
}

function selectNextTopic(
  cefrLevel: string,
  allProgress: TopicProgress[],
): { topic: Topic; isRetry: boolean; isReview: boolean; methodology: Methodology } | null {
  const topics = getTopicsForLevel(cefrLevel)
  const progressMap = new Map(allProgress.map(p => [p.topic_id, p]))
  const now = new Date()

  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'learning') {
      const nextMethod = (p.last_methodology ?? 'conversation') as Methodology
      return { topic: t, isRetry: true, isReview: false, methodology: nextMethod }
    }
  }
  for (const t of topics) {
    const p = progressMap.get(t.key)
    if (p?.mastery_status === 'mastered' && p.next_review_at && new Date(p.next_review_at) <= now) {
      return { topic: t, isRetry: false, isReview: true, methodology: 'conversation' }
    }
  }
  for (const t of topics) {
    if (!progressMap.has(t.key)) {
      return { topic: t, isRetry: false, isReview: false, methodology: 'conversation' }
    }
  }
  const first = topics[0]
  return first
    ? { topic: first, isRetry: false, isReview: true, methodology: 'conversation' }
    : null
}

interface AiExercise {
  vocab_word: string
  question_pt: string
  correct_answer: string
  choices: string[]
  explanation_pt: string
  fill_blank_sentence: string
  fill_blank_hint_pt: string
}

interface AiLessonContent {
  title_pt: string
  objective_pt: string
  learning_objectives: LearningObjective[]
  grammar_point: { teacher_script: string; explanation_pt: string; example_sentence_en: string; example_sentence_pt: string }
  grammar_exercise: AiExercise
  listening_passage: { teacher_script: string }
  listening_questions: [AiExercise, AiExercise]
  vocabulary: Array<VocabItem & { example_sentence_en: string; example_sentence_pt: string; teacher_script: string }>
  exercises: AiExercise[]
  guided_convo_opening: string
  guided_convo_opening_pt: string
  challenge_opening: string
  challenge_opening_pt: string
}

function fallbackAiContent(topic: Topic): AiLessonContent {
  const word = topic.objectivesPt[0]?.split(' ')[0]?.toLowerCase() ?? 'hello'
  return {
    title_pt: topic.labelPt,
    objective_pt: topic.objectivesPt[0] ?? 'Praticar inglês',
    learning_objectives: [{ id: 'obj-1', description_pt: topic.objectivesPt[0] ?? 'Praticar inglês', vocab_words: [word] }],
    grammar_point: {
      teacher_script: `Let's learn: ${topic.grammarFocus}.`,
      explanation_pt: topic.grammarFocus,
      example_sentence_en: topic.starterPhrase,
      example_sentence_pt: topic.starterPhrase,
    },
    grammar_exercise: {
      vocab_word: word,
      question_pt: `Qual frase usa corretamente: ${topic.grammarFocus}?`,
      correct_answer: topic.starterPhrase,
      choices: [topic.starterPhrase, 'other', 'more', 'less'],
      explanation_pt: topic.grammarFocus,
      fill_blank_sentence: `I say ___.`,
      fill_blank_hint_pt: topic.starterPhrase,
    },
    listening_passage: {
      teacher_script: `${topic.starterPhrase} ${topic.promptEn}.`,
    },
    listening_questions: [
      {
        vocab_word: 'n/a',
        question_pt: `Sobre o que é a conversa?`,
        correct_answer: topic.labelPt,
        choices: [topic.labelPt, 'other', 'more', 'less'],
        explanation_pt: topic.promptEn,
        fill_blank_sentence: `I say ___.`,
        fill_blank_hint_pt: topic.starterPhrase,
      },
      {
        vocab_word: 'n/a',
        question_pt: `O que foi dito primeiro?`,
        correct_answer: topic.starterPhrase,
        choices: [topic.starterPhrase, 'other', 'more', 'less'],
        explanation_pt: topic.promptEn,
        fill_blank_sentence: `I say ___.`,
        fill_blank_hint_pt: topic.starterPhrase,
      },
    ],
    vocabulary: [{ word, translation_pt: word, emoji: '📘', pronunciation_hint: word, example_sentence_en: topic.starterPhrase, example_sentence_pt: topic.starterPhrase, teacher_script: topic.starterPhrase }],
    exercises: [{ vocab_word: word, question_pt: `O que significa "${word}"?`, correct_answer: word, choices: [word, 'other', 'more', 'less'], explanation_pt: topic.promptEn, fill_blank_sentence: `I say ___.`, fill_blank_hint_pt: topic.starterPhrase }],
    guided_convo_opening: topic.starterPhrase,
    guided_convo_opening_pt: topic.starterPhrase,
    challenge_opening: topic.starterPhrase,
    challenge_opening_pt: topic.starterPhrase,
  }
}

function buildSteps(
  content: AiLessonContent,
  shape: ReturnType<typeof getLessonShape>,
  warmup: { recentSummaryPt: string | null; frequentErrorsPt: string[]; recentWords: string[] } | null,
): LessonStep[] {
  const steps: LessonStep[] = []
  let idCounter = 0
  const nextId = (prefix: string) => `${prefix}-${idCounter++}`

  if (warmup) {
    steps.push({
      id: nextId('warmup'),
      type: 'warmup_review',
      recent_summary_pt: warmup.recentSummaryPt,
      frequent_errors_pt: warmup.frequentErrorsPt,
      recent_words: warmup.recentWords,
    })
  }

  steps.push({ id: nextId('intro'), type: 'intro', title_pt: content.title_pt, description_pt: content.objective_pt })

  steps.push({
    id: nextId('gr'),
    type: 'grammar_present',
    teacher_script: content.grammar_point.teacher_script,
    explanation_pt: content.grammar_point.explanation_pt,
    example_sentence_en: content.grammar_point.example_sentence_en,
    example_sentence_pt: content.grammar_point.example_sentence_pt,
  })

  steps.push({
    id: nextId('gr-ex'),
    type: 'exercise_choice',
    question_pt: content.grammar_exercise.question_pt,
    image_emoji: '📐',
    correct_answer: content.grammar_exercise.correct_answer,
    choices: content.grammar_exercise.choices,
    explanation_pt: content.grammar_exercise.explanation_pt,
  })

  content.vocabulary.forEach((vocab, i) => {
    steps.push({
      id: nextId('vp'),
      type: 'vocab_present',
      vocab_index: i,
      teacher_script: vocab.teacher_script,
      example_sentence_en: vocab.example_sentence_en,
      example_sentence_pt: vocab.example_sentence_pt,
    })
    const exercise = content.exercises[i] ?? content.exercises[0]
    if (exercise) {
      if (i % 2 === 0) {
        steps.push({
          id: nextId('ex'),
          type: 'exercise_choice',
          question_pt: exercise.question_pt,
          image_emoji: vocab.emoji,
          correct_answer: exercise.correct_answer,
          choices: exercise.choices,
          explanation_pt: exercise.explanation_pt,
        })
      } else {
        steps.push({
          id: nextId('ex'),
          type: 'exercise_fill_blank',
          sentence_pt_hint: exercise.fill_blank_hint_pt,
          sentence_with_blank: exercise.fill_blank_sentence,
          correct_answer: exercise.correct_answer,
          explanation_pt: exercise.explanation_pt,
        })
      }
    }
  })

  const lastVocab = content.vocabulary[content.vocabulary.length - 1]
  if (lastVocab) {
    steps.push({
      id: nextId('vr'),
      type: 'vocab_repeat',
      vocab_index: content.vocabulary.length - 1,
      instruction_pt: `Pratique a pronúncia de "${lastVocab.word}"`,
    })
  }

  steps.push({
    id: nextId('ln'),
    type: 'listening_present',
    teacher_script: content.listening_passage.teacher_script,
  })

  content.listening_questions.forEach(question => {
    steps.push({
      id: nextId('ln-q'),
      type: 'exercise_choice',
      question_pt: question.question_pt,
      image_emoji: '🎧',
      correct_answer: question.correct_answer,
      choices: question.choices,
      explanation_pt: question.explanation_pt,
    })
  })

  const allowedVocabulary = content.vocabulary.map(v => v.word)

  steps.push({
    id: nextId('gc'),
    type: 'guided_convo',
    instruction_pt: 'Converse usando o que você aprendeu hoje.',
    teacher_opens_with: content.guided_convo_opening,
    teacher_opens_with_pt: content.guided_convo_opening_pt,
    allowed_vocabulary: allowedVocabulary,
    min_exchanges: shape.minExchangesPractice,
  })

  steps.push({
    id: nextId('gc'),
    type: 'guided_convo',
    instruction_pt: 'Use tudo que você aprendeu nesta aula para ir além.',
    teacher_opens_with: content.challenge_opening,
    teacher_opens_with_pt: content.challenge_opening_pt,
    allowed_vocabulary: allowedVocabulary,
    min_exchanges: shape.minExchangesChallenge,
    is_challenge: true,
  })

  steps.push({ id: nextId('summary'), type: 'summary' })

  return steps
}

export async function POST() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('teacher_id, cefr_level')
    .eq('id', user.id)
    .single()

  if (!userData?.teacher_id) return NextResponse.json({ error: 'No teacher assigned' }, { status: 400 })

  const [context, { data: allProgressRows }, { data: recentVocabRows }] = await Promise.all([
    getStudentContext(user.id, supabase),
    supabase
      .from('user_topic_progress')
      .select('topic_id, mastery_status, last_methodology, next_review_at')
      .eq('user_id', user.id),
    supabase
      .from('vocab_log')
      .select('word')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const allProgress = (allProgressRows ?? []) as TopicProgress[]
  const selection = selectNextTopic(context.cefrLevel, allProgress)
  if (!selection) return NextResponse.json({ error: 'No topic available' }, { status: 500 })

  const { topic, isRetry, isReview, methodology } = selection
  const cefrLevel = context.cefrLevel as CefrLevel
  const shape = getLessonShape(cefrLevel)

  const contextLines: string[] = []
  if (context.personalContext.length > 0) contextLines.push(context.personalContext.slice(0, 3).join('; '))
  if (context.goal) contextLines.push(`Goal: ${context.goal}`)
  if (context.biggestDifficulty) contextLines.push(`Biggest difficulty: ${context.biggestDifficulty}`)

  const retryNote = isRetry
    ? `\nIMPORTANT: The student already attempted this topic before. Use a COMPLETELY DIFFERENT teaching approach this time.\nMETHODOLOGY THIS SESSION: ${METHODOLOGY_NAMES_PT[methodology]} — ${METHODOLOGY_INSTRUCTIONS[methodology]}`
    : isReview
    ? `\nIMPORTANT: This is a REVIEW session — the student learned this topic before. Make it feel fresh. Test retention with new examples.`
    : ''

  const prompt = `Create the teaching content for one structured English lesson for a Brazilian student.

STUDENT:
- Name: ${context.name ?? 'Aluno'}
- CEFR Level: ${cefrLevel}
${contextLines.length > 0 ? `- Context: ${contextLines.join(' | ')}` : ''}
${context.frequentErrors.length > 0 ? `- Frequent mistakes: ${context.frequentErrors.join(', ')}` : ''}

TODAY'S TOPIC: ${topic.labelPt} (${topic.promptEn})
OBJECTIVES: ${topic.objectivesPt.join(', ')}
GRAMMAR FOCUS: ${topic.grammarFocus}
VOCABULARY COUNT: exactly ${shape.vocabCount} words/phrases, appropriate for ${cefrLevel}
${retryNote}

Return ONLY valid JSON:
{
  "title_pt": "lesson title in Portuguese (max 5 words)",
  "objective_pt": "one sentence — what the student will achieve today (Portuguese)",
  "learning_objectives": [{"id":"obj-1","description_pt":"...","vocab_words":["word1"]}],
  "grammar_point": {"teacher_script":"spoken explanation of the GRAMMAR FOCUS rule, in English","explanation_pt":"how/when to use it, in Portuguese","example_sentence_en":"...","example_sentence_pt":"..."},
  "grammar_exercise": {"vocab_word":"n/a","question_pt":"a multiple-choice question testing the GRAMMAR FOCUS rule","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"...","fill_blank_hint_pt":"..."},
  "listening_passage": {"teacher_script":"a short 3-5 sentence spoken passage in English, using today's topic and vocabulary, calibrated to the student's CEFR level"},
  "listening_questions": [{"vocab_word":"n/a","question_pt":"a multiple-choice comprehension question about the listening_passage, in Portuguese","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"what the passage said, explaining the answer, in Portuguese","fill_blank_sentence":"...","fill_blank_hint_pt":"..."},{"vocab_word":"n/a","question_pt":"a second, different multiple-choice comprehension question about the listening_passage","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"...","fill_blank_hint_pt":"..."}],
  "vocabulary": [{"word":"...","translation_pt":"...","emoji":"...","pronunciation_hint":"...","example_sentence_en":"...","example_sentence_pt":"...","teacher_script":"spoken intro of this word: say it, translate it, give one example"}],
  "exercises": [{"vocab_word":"...","question_pt":"...","correct_answer":"...","choices":["...","...","...","..."],"explanation_pt":"...","fill_blank_sentence":"a sentence with the word replaced by ___","fill_blank_hint_pt":"Portuguese translation of that full sentence"}],
  "guided_convo_opening": "teacher's opening question for guided practice, in English, using only today's vocabulary",
  "guided_convo_opening_pt": "Portuguese translation",
  "challenge_opening": "a harder closing question asking the student to combine everything learned, in English",
  "challenge_opening_pt": "Portuguese translation"
}
Provide exactly ${shape.vocabCount} vocabulary items and exactly ${shape.vocabCount} exercises (one per vocabulary item, in the same order), plus the grammar_point and grammar_exercise for the GRAMMAR FOCUS above, plus the listening_passage and exactly 2 listening_questions testing comprehension of that passage.`

  let aiContent: AiLessonContent
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2200,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}') as Partial<AiLessonContent>
    if (!parsed.vocabulary?.length || !parsed.exercises?.length || !parsed.grammar_point || !parsed.grammar_exercise || !parsed.listening_passage || !parsed.listening_questions || parsed.listening_questions.length < 2) throw new Error('Incomplete AI lesson content')
    parsed.listening_questions = parsed.listening_questions.slice(0, 2) as [AiExercise, AiExercise]
    aiContent = parsed as AiLessonContent
  } catch {
    aiContent = fallbackAiContent(topic)
  }

  const recentWords = ((recentVocabRows ?? []) as Array<{ word: string }>).map(r => r.word)

  const warmup = (context.recentSessionSummary || context.frequentErrors.length > 0 || recentWords.length > 0)
    ? {
        recentSummaryPt: context.recentSessionSummary,
        frequentErrorsPt: context.frequentErrors,
        recentWords,
      }
    : null

  const steps = buildSteps(aiContent, shape, warmup)

  const generatedLesson: GeneratedLesson = {
    title_pt: aiContent.title_pt,
    objective_pt: aiContent.objective_pt,
    vocabulary: aiContent.vocabulary.map(v => ({ word: v.word, translation_pt: v.translation_pt, emoji: v.emoji, pronunciation_hint: v.pronunciation_hint })),
    learning_objectives: aiContent.learning_objectives,
    steps,
  }

  const lessonPlanFull = {
    ...generatedLesson,
    topic_key: topic.key,
    topic_label_pt: topic.labelPt,
    topic_prompt_en: topic.promptEn,
    methodology,
    is_retry: isRetry,
    is_review: isReview,
    generated_at: new Date().toISOString(),
  }

  await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('teacher_id', userData.teacher_id)
    .is('ended_at', null)

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      teacher_id: userData.teacher_id,
      mode: 'lesson',
      topic: topic.key,
      lesson_plan_json: lessonPlanFull,
      lesson_topic_id: topic.key,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Session creation failed' }, { status: 500 })
  }

  await supabase.rpc('increment_topic_progress', {
    p_user_id: user.id,
    p_topic_id: topic.key,
    p_cefr_level: cefrLevel,
  })

  return NextResponse.json({
    session_id: session.id,
    teacher_id: userData.teacher_id,
    lesson: {
      title_pt: generatedLesson.title_pt,
      objective_pt: generatedLesson.objective_pt,
      topic_key: topic.key,
      topic_label_pt: topic.labelPt,
      emoji: topic.emoji,
      methodology,
      is_retry: isRetry,
      is_review: isReview,
    },
  })
}
