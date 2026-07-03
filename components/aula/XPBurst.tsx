'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface XPBurstProps {
  xp: number
  id: number
}

export function XPBurst({ xp, id }: XPBurstProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1800)
    return () => clearTimeout(t)
  }, [id])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 8, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.9 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex justify-center"
          aria-live="polite"
          aria-label={`+${xp} XP`}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-streak/15 border border-brand-streak/30">
            <span className="text-brand-streak font-bold text-sm">+{xp} XP</span>
            <span className="text-base" role="img" aria-label="estrela">⭐</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
