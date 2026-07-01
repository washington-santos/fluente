'use client'

import { Mic, Check, X } from 'lucide-react'
import { motion } from 'framer-motion'

interface RecordButtonProps {
  isRecording: boolean
  onStartRecording: () => void
  onSendRecording: () => void
  onCancelRecording: () => void
  disabled: boolean
}

const WAVEFORM_BARS = [0.4, 0.9, 0.6, 1.0, 0.5, 0.8, 0.3]

export function RecordButton({ isRecording, onStartRecording, onSendRecording, onCancelRecording, disabled }: RecordButtonProps) {
  if (isRecording) {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="flex items-center gap-1.5 h-10">
          {WAVEFORM_BARS.map((peak, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full bg-red-500"
              animate={{ scaleY: [0.2, peak, 0.2] }}
              transition={{ duration: 0.7 + i * 0.05, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
              style={{ height: '32px', transformOrigin: 'center' }}
            />
          ))}
        </div>
        <p className="text-xs text-red-500 font-medium tracking-wide">Gravando... fale agora</p>
        <div className="flex gap-8">
          <button
            onClick={onCancelRecording}
            className="w-14 h-14 rounded-full bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary flex items-center justify-center hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            aria-label="Cancelar gravação"
          >
            <X size={22} />
          </button>
          <button
            onClick={onSendRecording}
            className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-lg shadow-green-500/30"
            aria-label="Enviar gravação"
          >
            <Check size={22} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        onClick={onStartRecording}
        disabled={disabled}
        whileTap={{ scale: 0.93 }}
        className="w-20 h-20 rounded-full bg-brand-interactive text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Iniciar gravação"
      >
        <Mic size={32} />
      </motion.button>
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
        Toque para falar
      </p>
    </div>
  )
}
