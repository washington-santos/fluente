'use client'

import { Mic, MicOff } from 'lucide-react'
import { motion } from 'framer-motion'

interface RecordButtonProps {
  isRecording: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled: boolean
}

export function RecordButton({ isRecording, onPressStart, onPressEnd, disabled }: RecordButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onTouchStart={onPressStart}
        onTouchEnd={onPressEnd}
        disabled={disabled}
        animate={isRecording ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={isRecording ? { repeat: Infinity, duration: 1 } : {}}
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors select-none ${
          isRecording
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
            : 'bg-brand-interactive text-white hover:opacity-90'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
      >
        {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
      </motion.button>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
        {isRecording ? 'Gravando...' : 'Pressionar para falar'}
      </p>
    </div>
  )
}
