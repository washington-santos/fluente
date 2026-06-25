'use client'

import { motion } from 'framer-motion'

interface TeacherAvatarProps {
  name: string
  imageUrl: string
  videoUrl: string | null
  isSpeaking: boolean
}

export function TeacherAvatar({ name, imageUrl, videoUrl, isSpeaking }: TeacherAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-brand-cta opacity-60"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          />
        )}
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            muted
            playsInline
            className="w-28 h-28 rounded-full object-cover"
          />
        ) : (
          <img
            src={imageUrl}
            alt={name}
            className="w-28 h-28 rounded-full object-cover"
          />
        )}
      </div>
      <p className="text-sm font-medium text-content-light dark:text-content-dark">{name}</p>
    </div>
  )
}
