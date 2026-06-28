'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { Position, HistoricalPlayer } from '@/lib/types'
import { PlayerAvatar, OvrBadge, PosBadge } from './badges'
import { cn } from '@/lib/utils'

/**
 * Formation -> array of { position, x%, y% } on the pitch.
 * y=0 is the goal line (bottom), y=100 is the attack (top).
 * Pitch is rendered vertically (attack at top).
 */
interface PitchSlot {
  position: Position
  x: number // 0-100 (left to right)
  y: number // 0-100 (goal line to attack)
  label: string
}

const POS_LABELS: Record<Position, string> = {
  Goleiro: 'GOL',
  'Lateral Direito': 'LD',
  Zagueiro: 'ZAG',
  'Lateral Esquerdo': 'LE',
  Volante: 'VOL',
  'Meio Campo': 'MC',
  'Meia Ofensivo': 'MEI',
  'Ponta Direita': 'PD',
  'Ponta Esquerda': 'PE',
  Atacante: 'ATA',
  Centroavante: 'CA',
}

export const FORMATIONS: Record<string, PitchSlot[]> = {
  '4-3-3': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Lateral Direito', x: 82, y: 24, label: 'LD' },
    { position: 'Zagueiro', x: 62, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 38, y: 20, label: 'ZAG' },
    { position: 'Lateral Esquerdo', x: 18, y: 24, label: 'LE' },
    { position: 'Volante', x: 50, y: 42, label: 'VOL' },
    { position: 'Meio Campo', x: 70, y: 50, label: 'MC' },
    { position: 'Meia Ofensivo', x: 30, y: 50, label: 'MEI' },
    { position: 'Ponta Direita', x: 80, y: 72, label: 'PD' },
    { position: 'Centroavante', x: 50, y: 78, label: 'CA' },
    { position: 'Ponta Esquerdo', x: 20, y: 72, label: 'PE' },
  ],
  '4-4-2': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Lateral Direito', x: 82, y: 24, label: 'LD' },
    { position: 'Zagueiro', x: 62, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 38, y: 20, label: 'ZAG' },
    { position: 'Lateral Esquerdo', x: 18, y: 24, label: 'LE' },
    { position: 'Volante', x: 35, y: 45, label: 'VOL' },
    { position: 'Meio Campo', x: 65, y: 45, label: 'MC' },
    { position: 'Meia Ofensivo', x: 35, y: 60, label: 'MEI' },
    { position: 'Ponta Direita', x: 78, y: 60, label: 'PD' },
    { position: 'Centroavante', x: 60, y: 80, label: 'CA' },
    { position: 'Ponta Esquerda', x: 22, y: 60, label: 'PE' },
  ],
  '3-5-2': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Zagueiro', x: 70, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 50, y: 18, label: 'ZAG' },
    { position: 'Zagueiro', x: 30, y: 20, label: 'ZAG' },
    { position: 'Lateral Direito', x: 85, y: 45, label: 'LD' },
    { position: 'Volante', x: 50, y: 40, label: 'VOL' },
    { position: 'Meio Campo', x: 65, y: 52, label: 'MC' },
    { position: 'Meia Ofensivo', x: 35, y: 52, label: 'MEI' },
    { position: 'Lateral Esquerdo', x: 15, y: 45, label: 'LE' },
    { position: 'Atacante', x: 62, y: 78, label: 'ATA' },
    { position: 'Centroavante', x: 38, y: 78, label: 'CA' },
  ],
  '4-2-3-1': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Lateral Direito', x: 82, y: 24, label: 'LD' },
    { position: 'Zagueiro', x: 62, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 38, y: 20, label: 'ZAG' },
    { position: 'Lateral Esquerdo', x: 18, y: 24, label: 'LE' },
    { position: 'Volante', x: 40, y: 38, label: 'VOL' },
    { position: 'Volante', x: 60, y: 38, label: 'VOL' },
    { position: 'Ponta Direita', x: 80, y: 58, label: 'PD' },
    { position: 'Meia Ofensivo', x: 50, y: 55, label: 'MEI' },
    { position: 'Ponta Esquerda', x: 20, y: 58, label: 'PE' },
    { position: 'Centroavante', x: 50, y: 80, label: 'CA' },
  ],
  '5-3-2': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Lateral Direito', x: 88, y: 26, label: 'LD' },
    { position: 'Zagueiro', x: 68, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 50, y: 18, label: 'ZAG' },
    { position: 'Zagueiro', x: 32, y: 20, label: 'ZAG' },
    { position: 'Lateral Esquerdo', x: 12, y: 26, label: 'LE' },
    { position: 'Volante', x: 50, y: 42, label: 'VOL' },
    { position: 'Meio Campo', x: 70, y: 50, label: 'MC' },
    { position: 'Meia Ofensivo', x: 30, y: 50, label: 'MEI' },
    { position: 'Atacante', x: 62, y: 78, label: 'ATA' },
    { position: 'Centroavante', x: 38, y: 78, label: 'CA' },
  ],
  '4-5-1': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Lateral Direito', x: 82, y: 24, label: 'LD' },
    { position: 'Zagueiro', x: 62, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 38, y: 20, label: 'ZAG' },
    { position: 'Lateral Esquerdo', x: 18, y: 24, label: 'LE' },
    { position: 'Volante', x: 50, y: 40, label: 'VOL' },
    { position: 'Meio Campo', x: 68, y: 48, label: 'MC' },
    { position: 'Meia Ofensivo', x: 32, y: 48, label: 'MEI' },
    { position: 'Ponta Direita', x: 82, y: 64, label: 'PD' },
    { position: 'Ponta Esquerda', x: 18, y: 64, label: 'PE' },
    { position: 'Centroavante', x: 50, y: 82, label: 'CA' },
  ],
  '3-4-3': [
    { position: 'Goleiro', x: 50, y: 8, label: 'GOL' },
    { position: 'Zagueiro', x: 70, y: 20, label: 'ZAG' },
    { position: 'Zagueiro', x: 50, y: 18, label: 'ZAG' },
    { position: 'Zagueiro', x: 30, y: 20, label: 'ZAG' },
    { position: 'Lateral Direito', x: 85, y: 42, label: 'LD' },
    { position: 'Volante', x: 55, y: 40, label: 'VOL' },
    { position: 'Meio Campo', x: 45, y: 48, label: 'MC' },
    { position: 'Lateral Esquerdo', x: 15, y: 42, label: 'LE' },
    { position: 'Ponta Direita', x: 80, y: 72, label: 'PD' },
    { position: 'Centroavante', x: 50, y: 80, label: 'CA' },
    { position: 'Ponta Esquerda', x: 20, y: 72, label: 'PE' },
  ],
}

export function getFormationSlots(formation: string): PitchSlot[] {
  return FORMATIONS[formation] || FORMATIONS['4-3-3']
}

interface PitchFormationProps {
  formation: string
  squad: HistoricalPlayer[]
  highlightPosition?: Position | null
  compact?: boolean
  onSlotClick?: (position: Position, slotIndex: number) => void
}

/**
 * Vertical football pitch with marked positions like the reference image.
 * Players are placed at their formation slot once drafted.
 */
export function PitchFormation({ formation, squad, highlightPosition, compact, onSlotClick }: PitchFormationProps) {
  const slots = getFormationSlots(formation)

  // assign squad players to slots (each slot consumes one player of matching position)
  const assigned: (HistoricalPlayer | null)[] = slots.map((slot) => {
    const idx = squad.findIndex((p) => p.position === slot.position && !slots.some((s, si) => si < slots.indexOf(slot) && s.position === slot.position && squad.indexOf(p) === -1))
    return idx >= 0 ? squad[idx] : null
  })
  // simpler: track used player ids
  const used = new Set<string>()
  const slotPlayers: (HistoricalPlayer | null)[] = slots.map((slot) => {
    const player = squad.find((p) => p.position === slot.position && !used.has(p.id))
    if (player) {
      used.add(player.id)
      return player
    }
    return null
  })

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl',
        compact ? 'aspect-[3/4] max-h-[420px]' : 'aspect-[3/4]'
      )}
      style={{
        background:
          'linear-gradient(180deg, #166534 0%, #15803d 25%, #166534 50%, #15803d 75%, #166534 100%)',
      }}
    >
      {/* Pitch lines */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 133" preserveAspectRatio="none" fill="none">
        {/* outer boundary */}
        <rect x="3" y="3" width="94" height="127" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        {/* halfway line */}
        <line x1="3" y1="66.5" x2="97" y2="66.5" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        {/* center circle */}
        <circle cx="50" cy="66.5" r="10" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <circle cx="50" cy="66.5" r="0.8" fill="rgba(255,255,255,0.9)" />
        {/* bottom penalty area (goal line) */}
        <rect x="22" y="3" width="56" height="18" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="36" y="3" width="28" height="7" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <path d="M 36 21 A 12 12 0 0 0 64 21" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        {/* top penalty area (attack) */}
        <rect x="22" y="112" width="56" height="18" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="36" y="123" width="28" height="7" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <path d="M 36 112 A 12 12 0 0 1 64 112" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        {/* goals */}
        <rect x="44" y="1" width="12" height="2" stroke="rgba(255,255,255,0.9)" strokeWidth="0.4" />
        <rect x="44" y="130" width="12" height="2" stroke="rgba(255,255,255,0.9)" strokeWidth="0.4" />
      </svg>

      {/* Position slots */}
      {slots.map((slot, i) => {
        const player = slotPlayers[i]
        const isHighlight = highlightPosition && slot.position === highlightPosition
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => onSlotClick?.(slot.position, i)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${slot.x}%`, top: `${100 - slot.y}%` }}
            initial={false}
            animate={
              isHighlight
                ? { scale: [1, 1.15, 1], transition: { repeat: Infinity, duration: 1.2 } }
                : { scale: 1 }
            }
          >
            <AnimatePresence mode="wait">
              {player ? (
                <motion.div
                  key={player.id}
                  initial={{ scale: 0, rotateY: 180, opacity: 0 }}
                  animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className="grid place-items-center rounded-full border-2 shadow-lg"
                    style={{
                      width: compact ? 36 : 44,
                      height: compact ? 36 : 44,
                      backgroundColor: player.photoColor,
                      borderColor: 'rgba(255,255,255,0.9)',
                    }}
                  >
                    <span className="text-[9px] font-black text-white drop-shadow">
                      {player.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <OvrBadge ovr={player.overall} className="mt-0.5 scale-90" />
                  <span className="mt-0.5 max-w-[60px] truncate rounded bg-black/60 px-1 text-[9px] font-semibold text-white">
                    {player.name.split(' ').slice(-1)[0]}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key={`empty-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className={cn(
                      'grid place-items-center rounded-full border-2 border-dashed',
                      isHighlight ? 'border-amber-300 bg-amber-400/30' : 'border-white/60 bg-white/5'
                    )}
                    style={{ width: compact ? 36 : 44, height: compact ? 36 : 44 }}
                  >
                    <span className={cn('text-[10px] font-black', isHighlight ? 'text-amber-200' : 'text-white/80')}>
                      {slot.label}
                    </span>
                  </div>
                  <span className="mt-1 rounded bg-black/40 px-1 text-[8px] font-medium uppercase tracking-wider text-white/60">
                    vazio
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}

      {/* Bench (extra players not in starting XI) */}
      {squad.length > 11 && (
        <div className="absolute bottom-1 left-1 right-1 flex flex-wrap items-center justify-center gap-1 rounded bg-black/40 px-2 py-1">
          <span className="text-[8px] font-bold uppercase text-white/60">Banco:</span>
          {squad.slice(11).map((p) => (
            <div key={p.id} className="flex items-center gap-0.5 rounded bg-white/10 px-1 py-0.5">
              <PlayerAvatar name={p.name} color={p.photoColor} size="sm" />
              <span className="text-[8px] font-medium text-white">{p.name.split(' ').slice(-1)[0]}</span>
              <OvrBadge ovr={p.overall} className="scale-75" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
