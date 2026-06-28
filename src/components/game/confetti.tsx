'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

const COLORS = ['#fbbf24', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ec4899', '#f97316']

/**
 * Animated confetti burst. Renders N pieces that fall from the top.
 */
export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100, // vw
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 2.5,
        rotate: Math.random() * 360,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 30,
      })),
    [count]
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.x}vw`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: ['0vh', '110vh'],
            x: [0, p.drift, 0],
            rotate: [0, p.rotate],
            opacity: [1, 1, 0.9, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  )
}
