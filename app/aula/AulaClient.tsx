'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RecordButton } from '@/components/aula/RecordButton'
import { MessageBubble } from '@/components/aula/MessageBubble'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'
import type { AvatarStatus } from '@/components/aula/TeacherAvatar'
import { TextInput } from '@/components/aula/TextInput'
import { PhaseIndicator } from '@/components/aula/PhaseIndicator'
import { TopicBadge } from '@/components/aula/TopicBadge'
import { SessionReport } from '@/components/aula/SessionReport'
import { LessonHero } from '@/components/aula/LessonHero'
import { HowItWorks } from '@/components/aula/HowItWorks'
import { StarterPhrase } from '@/components/aula/StarterPhrase'
import { ObjectiveStrip } from '@/components/aula/ObjectiveStrip'
import { XPBurst } from '@/components/aula/XPBurst'
import { CorrectionCard } from '@/components/aula/CorrectionCard'
import { WordsLearned } from '@/components/aula/WordsLearned'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSession } from '@/hooks/useSession'
import { getTopicByKey } from '@/lib/topics'
import type { Teacher, ConversationResponse, CefrLevel } from '@/types'
import type { CompetencyScores } from '@/lib/mastery'

interface AulaClientProps {
  teacher: Teacher
  cefrLevel: CefrLevel | null
}

export function AulaClient({ teacher, cefrLevel }: AulaClientProps) {
  const router = useRouter()
  const {
    sessionId,
    topic,
    messages,
    loading,
    sending,
    turnError,
    initError,
    quotaExceeded,
    lastPromptHint,
    sendTurn,
    endSession,
  } = useSession(teacher.id)

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [textValue, setTextValue] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [reportData, setReportData] = useState<{
    userMessages: number
    corrections: number
    pronunciationHints: number
    durationSeconds: number
    missionCompleted: boolean
    missionTitle: string
    assessment?: {
      scores: CompetencyScores
      final_score: number
      passed: boolean
      failed_competencies: string[]
      feedback_pt: string
      highlight_pt: string
      attempt_count: number
    } | null
  } | null>(null)

  // Intro screen — hide once first turn is sent or session has existing messages
  const [showIntro, setShowIntro] = useState(true)

  // Gamification
  const [learnedWords, setLearnedWords] = useState<string[]>([])
  const [xpBurst, setXpBurst] = useState<{ key: number; xp: number } | null>(null)
  const [xpTotal, setXpTotal] = useState(0)
  const xpKeyRef = useRef(0)

  // Correction overlay
  const [lastCorrection, setLastCorrection] = useState<{
    error_text: string
    correct_form: string
    error_type: string | null
  } | null>(null)
  const correctionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length
  const topicData = getTopicByKey(topic)
  const teacherFirstName = teacher.name.split(' ')[0]

  // Skip intro if returning user has messages
  useEffect(() => {
    if (!loading && messages.length > 0) setShowIntro(false)
  }, [loading, messages.length])

  const handleTurn = useCallback(
    async (input: File | string) => {
      setTextValue('')
      setShowIntro(false)
      const response = await sendTurn(input)
      if (!response) return
      playAudio(response)
      accumulateResults(response)
    },
    [sendTurn],
  )

  function accumulateResults(response: ConversationResponse) {
    // Learned words
    if (response.new_words?.length) {
      setLearnedWords((prev) => {
        const combined = [...prev]
        for (const w of response.new_words!) {
          if (!combined.includes(w)) combined.push(w)
        }
        return combined
      })
    }

    // XP burst
    const xp = 10 + (!response.had_correction ? 5 : 0) + (response.new_words?.length ? 5 : 0)
    xpKeyRef.current++
    setXpBurst({ key: xpKeyRef.current, xp })
    setXpTotal((prev) => prev + xp)
    setTimeout(() => setXpBurst(null), 2200)

    // Correction card
    if (
      response.had_correction &&
      response.error_report.error_text &&
      response.error_report.correct_form
    ) {
      if (correctionTimerRef.current) clearTimeout(correctionTimerRef.current)
      setLastCorrection({
        error_text: response.error_report.error_text,
        correct_form: response.error_report.correct_form,
        error_type: response.error_report.error_type ?? null,
      })
      correctionTimerRef.current = setTimeout(() => setLastCorrection(null), 7000)
    }
  }

  function playAudio(response: ConversationResponse) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    setVideoUrl(response.video_url)
    if (!response.audio_url) return
    const audio = new Audio(response.audio_url)
    audioRef.current = audio
    setIsSpeaking(true)
    const cleanup = () => {
      setIsSpeaking(false)
      audioRef.current = null
    }
    audio.onended = cleanup
    audio.onerror = cleanup
    audio.play().catch(cleanup)
  }

  const { isRecording, startRecording, stopRecording, cancelRecording, error: micError } =
    useAudioRecorder({
      onComplete: (blob) => {
        const base = blob.type.split(';')[0]
        const ext = base.split('/')[1] || 'webm'
        handleTurn(new File([blob], `recording.${ext}`, { type: base }))
      },
    })

  // Derive avatar status
  const avatarStatus: AvatarStatus = isSpeaking
    ? 'speaking'
    : isRecording
    ? 'listening'
    : sending
    ? 'thinking'
    : 'idle'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.onended = null
        audioRef.current = null
      }
      if (correctionTimerRef.current) clearTimeout(correctionTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handleUnload = () => {
      endSession()
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [endSession])

  async function handleEnd() {
    await endSession()
    if (sessionId) {
      try {
        const [reportRes, assessRes] = await Promise.allSettled([
          fetch(`/api/session/${sessionId}/report`),
          fetch(`/api/session/${sessionId}/assess`, { method: 'POST' }),
        ])
        if (reportRes.status === 'fulfilled' && reportRes.value.ok) {
          const data = await reportRes.value.json()
          let assessment = null
          if (assessRes.status === 'fulfilled' && assessRes.value.ok) {
            const a = await assessRes.value.json()
            if (!a.too_short && !a.error) assessment = a
          }
          setReportData({ ...data, assessment })
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

  const handleChipClick = useCallback((text: string) => {
    setTextValue(text)
  }, [])

  function handleNaoEntendi() {
    handleTurn("Could you please say that again more simply? I didn't understand.")
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-red-500 text-center">{initError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-brand-cta text-content-dark hover:opacity-90 transition-opacity"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // ── Intro screen ──────────────────────────────────────────────────────────
  if (showIntro && !loading && messages.length === 0 && !quotaExceeded) {
    return (
      <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
        <header className="flex items-center justify-between p-4 shrink-0">
          <button
            onClick={handleEnd}
            disabled={sending}
            className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <X size={16} /> Encerrar aula
          </button>
          <ThemeToggle />
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col items-center gap-4">
          {/* Avatar compact centered */}
          <div className="pt-2 pb-1">
            <TeacherAvatar
              name={teacher.name}
              imageUrl={teacher.avatar_image_url}
              videoUrl={null}
              isSpeaking={false}
              status="idle"
            />
          </div>

          {/* Lesson hero */}
          {topicData ? (
            <LessonHero topic={topicData} cefrLevel={cefrLevel} />
          ) : (
            <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-5 text-center">
              <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
                Preparando sua aula...
              </p>
            </div>
          )}

          {/* How it works */}
          <div className="w-full">
            <HowItWorks />
          </div>

          {/* Starter phrase */}
          <div className="w-full">
            <StarterPhrase
              teacherFirstName={teacherFirstName}
              phrase={topicData?.starterPhrase ?? `Hello, ${teacherFirstName}!`}
              onUse={() => handleTurn(topicData?.starterPhrase ?? `Hello, ${teacherFirstName}!`)}
              onOther={() => setShowIntro(false)}
              disabled={sending || loading}
            />
          </div>
        </div>

        {showReport && reportData && (
          <SessionReport
            userMessages={reportData.userMessages}
            corrections={reportData.corrections}
            pronunciationHints={reportData.pronunciationHints}
            durationSeconds={reportData.durationSeconds}
            missionCompleted={reportData.missionCompleted}
            missionTitle={reportData.missionTitle}
            assessment={reportData.assessment}
            onClose={handleReportClose}
          />
        )}
      </main>
    )
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading && messages.length === 0) {
    return (
      <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-surface-light-card dark:bg-surface-dark-card animate-pulse" />
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary animate-pulse">
          Conectando à aula...
        </p>
      </main>
    )
  }

  // ── Chat screen ───────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col max-h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-surface-light-card dark:border-surface-dark-card">
        <button
          onClick={handleEnd}
          disabled={sending || loading}
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <X size={16} /> Encerrar aula
        </button>

        <div className="flex items-center gap-3">
          {/* Words learned counter */}
          <WordsLearned words={learnedWords} />

          {/* XP total — compact */}
          {xpTotal > 0 && (
            <span className="text-xs font-semibold text-brand-streak">
              ⭐ {xpTotal} XP
            </span>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* Phase indicator */}
      <div className="shrink-0">
        <PhaseIndicator assistantMessageCount={assistantMessageCount} />
      </div>

      {/* Topic label */}
      {topicData && (
        <div className="flex justify-center pb-1 shrink-0">
          <TopicBadge topic={topicData.labelPt} />
        </div>
      )}

      {/* Objective strip */}
      {lastPromptHint && (
        <div className="shrink-0 pb-2">
          <ObjectiveStrip hint={lastPromptHint} />
        </div>
      )}

      {/* Avatar — compact, always visible */}
      <div className="flex flex-col items-center py-2 shrink-0">
        <TeacherAvatar
          name={teacher.name}
          imageUrl={teacher.avatar_image_url}
          videoUrl={videoUrl}
          isSpeaking={isSpeaking}
          status={avatarStatus}
          compact
        />
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {/* Empty state — first load with no messages after intro dismissed */}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="text-4xl" role="img" aria-label="início">👋</span>
            <p className="text-sm text-content-light dark:text-content-dark font-medium">
              Fale ou escreva para começar!
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary max-w-xs">
              {teacher.name} está aguardando você. Não se preocupe com erros — é assim que se aprende.
            </p>
          </div>
        )}

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

        {/* Thinking bubble */}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-surface-light-card dark:bg-surface-dark-card">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-content-light-secondary dark:bg-content-dark-secondary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* XP burst */}
        {xpBurst && <XPBurst xp={xpBurst.xp} id={xpBurst.key} />}

        {/* Correction card */}
        <AnimatePresence>
          {lastCorrection && (
            <CorrectionCard
              errorText={lastCorrection.error_text}
              correctForm={lastCorrection.correct_form}
              errorType={lastCorrection.error_type}
            />
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 px-4 pt-2 pb-5 flex flex-col items-center gap-3 border-t border-surface-light-card dark:border-surface-dark-card">
        {quotaExceeded ? (
          <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-base font-bold text-content-light dark:text-content-dark">
              Sua Demonstração Premium chegou ao fim.
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary leading-relaxed">
              Esperamos que você tenha conhecido todo o potencial da plataforma.
              Continue aprendendo inglês com aulas personalizadas por IA assinando um dos planos abaixo.
            </p>
            <a
              href="/planos"
              className="mt-1 w-full py-3 rounded-xl bg-brand-cta text-content-dark text-sm font-semibold hover:opacity-90 transition-opacity text-center"
            >
              Ver planos e assinar
            </a>
          </div>
        ) : (
          <>
            {(micError || turnError) && (
              <p role="alert" className="text-xs text-red-500 text-center">
                {micError || turnError}
              </p>
            )}

            {lastPromptHint && !isRecording && !sending && (
              <p
                className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center px-2"
                data-testid="prompt-hint"
              >
                💡 {lastPromptHint}
              </p>
            )}

            <RecordButton
              isRecording={isRecording}
              onStartRecording={startRecording}
              onSendRecording={stopRecording}
              onCancelRecording={cancelRecording}
              disabled={sending || loading}
            />

            {!isRecording && (
              <TextInput
                value={textValue}
                onChange={setTextValue}
                onSubmit={(text) => handleTurn(text)}
                onNaoEntendi={handleNaoEntendi}
                disabled={sending || loading}
              />
            )}
          </>
        )}
      </div>

      {showReport && reportData && (
        <SessionReport
          userMessages={reportData.userMessages}
          corrections={reportData.corrections}
          pronunciationHints={reportData.pronunciationHints}
          durationSeconds={reportData.durationSeconds}
          missionCompleted={reportData.missionCompleted}
          missionTitle={reportData.missionTitle}
          assessment={reportData.assessment}
          onClose={handleReportClose}
        />
      )}
    </main>
  )
}
