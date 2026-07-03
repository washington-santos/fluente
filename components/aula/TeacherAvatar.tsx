'use client'

import { motion, AnimatePresence } from 'framer-motion'

export type AvatarStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

interface TeacherAvatarProps {
  name: string
  imageUrl: string
  videoUrl: string | null
  isSpeaking: boolean
  status?: AvatarStatus
  compact?: boolean
}

const STATUS_LABEL: Record<AvatarStatus, string> = {
  idle: '',
  listening: '🎤 Ouvindo...',
  thinking: '💭 Pensando...',
  speaking: '🔊 Falando...',
}

const BAR_HEIGHTS = [0.4, 0.7, 1, 0.7, 0.4]

export function TeacherAvatar({ name, imageUrl, videoUrl, isSpeaking, status = 'idle', compact = false }: TeacherAvatarProps) {
  const avatarSize = compact ? 'w-16 h-16' : 'w-28 h-28'
  const containerSize = compact ? 'w-20 h-20' : 'w-32 h-32'
  const derivedStatus: AvatarStatus = isSpeaking ? 'speaking' : status

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${containerSize} flex items-center justify-center`}>
        {/* Outer pulse ring */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              key="ring-outer"
              className="absolute inset-0 rounded-full border-2 border-brand-cta/40"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.35, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        {/* Inner pulse ring */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              key="ring-inner"
              className="absolute inset-0 rounded-full border-2 border-brand-cta/60"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.18, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut', delay: 0.4 }}
            />
          )}
        </AnimatePresence>

        {/* Listening ring */}
        <AnimatePresence>
          {derivedStatus === 'listening' && (
            <motion.div
              key="ring-listening"
              className="absolute inset-0 rounded-full border-2 border-green-400/60"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.25, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        {/* Glow ring */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isSpeaking
              ? 'shadow-[0_0_24px_6px] shadow-brand-cta/40 ring-2 ring-brand-cta/70'
              : derivedStatus === 'listening'
              ? 'ring-2 ring-green-400/60'
              : 'ring-2 ring-surface-light-card dark:ring-surface-dark-card'
          }`}
        />

        {/* Avatar image/video */}
        <motion.div
          className={`${avatarSize} rounded-full overflow-hidden relative z-10`}
          animate={isSpeaking ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={isSpeaking ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : { duration: 0.3 }}
        >
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          )}
        </motion.div>
      </div>

      {/* Name + status */}
      <div className="flex flex-col items-center gap-0.5">
        <p className={`font-semibold text-content-light dark:text-content-dark ${compact ? 'text-xs' : 'text-sm'}`}>
          {name}
        </p>
        <AnimatePresence mode="wait">
          {STATUS_LABEL[derivedStatus] && (
            <motion.p
              key={derivedStatus}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="text-xs text-content-light-secondary dark:text-content-dark-secondary"
              aria-live="polite"
            >
              {STATUS_LABEL[derivedStatus]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Sound wave bars — only when speaking and not compact */}
      {!compact && (
        <div className="flex items-end gap-[3px] h-5">
          {BAR_HEIGHTS.map((h, i) => (
            <motion.div
              key={i}
              className="w-[4px] rounded-full bg-brand-cta"
              animate={
                isSpeaking
                  ? { scaleY: [h, 1, h * 0.6, 1, h], opacity: 1 }
                  : { scaleY: 0.15, opacity: 0.3 }
              }
              transition={
                isSpeaking
                  ? { repeat: Infinity, duration: 0.7 + i * 0.1, delay: i * 0.08, ease: 'easeInOut' }
                  : { duration: 0.4 }
              }
              style={{ height: '20px', originY: 1 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
