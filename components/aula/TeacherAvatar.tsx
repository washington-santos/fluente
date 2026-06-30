'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface TeacherAvatarProps {
  name: string
  imageUrl: string
  videoUrl: string | null
  isSpeaking: boolean
}

const BAR_HEIGHTS = [0.4, 0.7, 1, 0.7, 0.4]

export function TeacherAvatar({ name, imageUrl, videoUrl, isSpeaking }: TeacherAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-32 h-32 flex items-center justify-center">
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

        {/* Glow ring when speaking */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isSpeaking
              ? 'shadow-[0_0_24px_6px] shadow-brand-cta/40 ring-2 ring-brand-cta/70'
              : 'ring-2 ring-surface-light-card dark:ring-surface-dark-card'
          }`}
        />

        {/* Avatar image/video */}
        <motion.div
          className="w-28 h-28 rounded-full overflow-hidden relative z-10"
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

      {/* Name */}
      <p className="text-sm font-semibold text-content-light dark:text-content-dark">{name}</p>

      {/* Sound wave bars */}
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
                ? {
                    repeat: Infinity,
                    duration: 0.7 + i * 0.1,
                    delay: i * 0.08,
                    ease: 'easeInOut',
                  }
                : { duration: 0.4 }
            }
            style={{ height: '20px', originY: 1 }}
          />
        ))}
      </div>
    </div>
  )
}
