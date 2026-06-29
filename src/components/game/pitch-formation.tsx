'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Position, HistoricalPlayer, MatchEvent } from '@/lib/types'
import { OvrBadge } from './badges'
import { cn } from '@/lib/utils'
import { getWikipediaPhoto } from './player-card'

interface PitchSlot {
  position: Position
  x: number // 0-100 (left to right)
  y: number // 0-100 (goal line to attack)
  label: string
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
    { position: 'Ponta Esquerda', x: 20, y: 72, label: 'PE' },
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

export function FieldPlayerNode({ player, compact }: { player: HistoricalPlayer; compact?: boolean }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getWikipediaPhoto(player.name, player.club).then((url) => {
      if (active) setPhotoUrl(url)
    })
    return () => { active = false }
  }, [player.name, player.club])

  const initials = player.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div
      className="relative overflow-hidden rounded-full border-2 shadow-lg bg-black/40"
      style={{
        width: compact ? 38 : 46,
        height: compact ? 38 : 46,
        borderColor: 'rgba(255, 255, 255, 0.95)',
      }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={player.name} className="h-full w-full object-cover object-top scale-110" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#475569]/30">
          <span className="text-[10px] font-black text-white drop-shadow">{initials}</span>
        </div>
      )}
    </div>
  )
}

export function PitchFormation({ formation, squad, highlightPosition, compact, onSlotClick }: PitchFormationProps) {
  const slots = getFormationSlots(formation)
  const used = new Set<string>()
  const slotPlayers: (HistoricalPlayer | null)[] = slots.map((slot) => {
    const player = squad.find((p) => p.position === slot.position && !used.has(p.id))
    if (player) { used.add(player.id); return player }
    return null
  })
  const benchPlayers = squad.filter((p) => !used.has(p.id))

  return (
    <div className={cn('relative w-full overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl', compact ? 'aspect-[3/4] max-h-[420px]' : 'aspect-[3/4]')}
      style={{ background: 'linear-gradient(180deg, #166534 0%, #15803d 25%, #166534 50%, #15803d 75%, #166534 100%)' }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 133" preserveAspectRatio="none" fill="none">
        <rect x="3" y="3" width="94" height="127" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <line x1="3" y1="66.5" x2="97" y2="66.5" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <circle cx="50" cy="66.5" r="10" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <circle cx="50" cy="66.5" r="0.8" fill="rgba(255,255,255,0.9)" />
        <rect x="22" y="3" width="56" height="18" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="36" y="3" width="28" height="7" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <path d="M 36 21 A 12 12 0 0 0 64 21" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="22" y="112" width="56" height="18" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="36" y="123" width="28" height="7" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <path d="M 36 112 A 12 12 0 0 1 64 112" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
        <rect x="44" y="1" width="12" height="2" stroke="rgba(255,255,255,0.9)" strokeWidth="0.4" />
        <rect x="44" y="130" width="12" height="2" stroke="rgba(255,255,255,0.9)" strokeWidth="0.4" />
      </svg>
      {slots.map((slot, i) => {
        const player = slotPlayers[i]
        const isHighlight = highlightPosition && slot.position === highlightPosition
        return (
          <motion.button key={i} type="button" onClick={() => onSlotClick?.(slot.position, i)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${slot.x}%`, top: `${100 - slot.y}%` }}
            initial={false}
            animate={isHighlight ? { scale: [1, 1.15, 1], transition: { repeat: Infinity, duration: 1.2 } } : { scale: 1 }}>
            <AnimatePresence mode="wait">
              {player ? (
                <motion.div key={player.id} initial={{ scale: 0, rotateY: 180, opacity: 0 }}
                  animate={{ scale: 1, rotateY: 0, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className="flex flex-col items-center">
                  <FieldPlayerNode player={player} compact={compact} />
                  <OvrBadge ovr={player.overall} className="mt-0.5 scale-90 z-10" />
                  <span className="mt-0.5 max-w-[65px] truncate rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-white drop-shadow">
                    {player.name.split(' ').slice(-1)[0]}
                  </span>
                </motion.div>
              ) : (
                <motion.div key={`empty-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center">
                  <div className={cn('grid place-items-center rounded-full border-2 border-dashed', isHighlight ? 'border-amber-300 bg-amber-400/30 shadow-lg' : 'border-white/60 bg-white/5')}
                    style={{ width: compact ? 36 : 44, height: compact ? 36 : 44 }}>
                    <span className={cn('text-[10px] font-black', isHighlight ? 'text-amber-200' : 'text-white/80')}>{slot.label}</span>
                  </div>
                  <span className="mt-1 rounded bg-black/40 px-1 text-[8px] font-medium uppercase tracking-wider text-white/60">vazio</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}
      {benchPlayers.length > 0 && (
        <div className="absolute bottom-1 left-1 right-1 flex flex-wrap items-center justify-center gap-1 rounded bg-black/60 px-2 py-1 max-h-[80px] overflow-y-auto">
          <span className="text-[8px] font-bold uppercase text-white/60">Banco:</span>
          {benchPlayers.map((p) => {
            const initials = p.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
            return (
              <div key={p.id} className="flex items-center gap-0.5 rounded bg-white/10 px-1 py-0.5">
                <div className="grid h-4 w-4 place-items-center rounded-full bg-slate-700/50 text-[7px] font-black text-white">{initials}</div>
                <span className="text-[8px] font-medium text-white">{p.name.split(' ').slice(-1)[0]}</span>
                <OvrBadge ovr={p.overall} className="scale-75" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface MappedPlayer {
  player: HistoricalPlayer
  x: number
  y: number
  team: 'home' | 'away'
}

interface MatchSimulationPitchProps {
  homeSquad: HistoricalPlayer[]
  homeFormation: string
  awaySquad: HistoricalPlayer[]
  awayFormation: string
  events: MatchEvent[]
  simMinute: number
}

/**
 * Server-driven simulation pitch:
 * - Ball animates smoothly between server-computed positions
 * - Pass trajectories shown as dashed lines with arrow
 * - Goals: ball enters net, celebration, then kickoff reset
 * - Corners: ball goes to corner flag with flag indicator
 * - Offside: flag indicator
 * - Free kicks: ball stops, indicator shows
 * - ALL clients see IDENTICAL data
 */
export function MatchSimulationPitch({
  homeSquad, homeFormation, awaySquad, awayFormation, events, simMinute,
}: MatchSimulationPitchProps) {
  // Build player positions from formations
  const { homePlayers, awayPlayers, allPlayers } = useMemo(() => {
    const homeSlots = getFormationSlots(homeFormation)
    const awaySlots = getFormationSlots(awayFormation)
    const homeUsed = new Set<string>()
    const awayUsed = new Set<string>()

    const home = homeSlots.map((slot) => {
      const player = homeSquad.find((p) => p.position === slot.position && !homeUsed.has(p.id))
      if (player) { homeUsed.add(player.id); return { player, x: slot.x, y: 100 - slot.y * 0.5, team: 'home' as const } }
      return null
    }).filter((p): p is MappedPlayer => p !== null)

    const away = awaySlots.map((slot) => {
      const player = awaySquad.find((p) => p.position === slot.position && !awayUsed.has(p.id))
      if (player) { awayUsed.add(player.id); return { player, x: 100 - slot.x, y: slot.y * 0.5, team: 'away' as const } }
      return null
    }).filter((p): p is MappedPlayer => p !== null)

    return { homePlayers: home, awayPlayers: away, allPlayers: [...home, ...away] }
  }, [homeSquad, homeFormation, awaySquad, awayFormation])

  // ---- Animation state ----
  const [displayBall, setDisplayBall] = useState({ x: 50, y: 50 })
  const [ballAnimating, setBallAnimating] = useState(false)
  const [celebrationActive, setCelebrationActive] = useState(false)
  const [scoringTeam, setScoringTeam] = useState<'home' | 'away' | null>(null)
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  const [passTrajectory, setPassTrajectory] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null)
  const lastEventKeyRef = useRef<string>('')
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Process latest event
  const latestEvent = events.length > 0 ? events[events.length - 1] : null

  useEffect(() => {
    if (!latestEvent) return

    const eventKey = `${latestEvent.minute}-${latestEvent.type}-${latestEvent.player}-${latestEvent.ballX}-${latestEvent.ballY}`
    if (eventKey === lastEventKeyRef.current) return
    lastEventKeyRef.current = eventKey

    // Clear any pending timeouts
    for (const t of timeoutsRef.current) clearTimeout(t)
    timeoutsRef.current = []

    const bx = latestEvent.ballX ?? 50
    const by = latestEvent.ballY ?? 50

    // Show pass trajectory if we have fromX/fromY and it's a passing action
    const isPassAction = ['pass', 'long_pass', 'through_ball', 'cross'].includes(latestEvent.type)
    if (isPassAction && latestEvent.fromX !== undefined && latestEvent.fromY !== undefined) {
      setPassTrajectory({
        fromX: latestEvent.fromX,
        fromY: latestEvent.fromY,
        toX: bx,
        toY: by,
      })
      // Vary trajectory visibility by pass type
      const duration = latestEvent.type === 'long_pass' ? 1500 : latestEvent.type === 'through_ball' ? 1200 : latestEvent.type === 'cross' ? 1400 : 700
      const t = setTimeout(() => setPassTrajectory(null), duration)
      timeoutsRef.current.push(t)
    } else {
      setPassTrajectory(null)
    }

    // Special indicators
    if (latestEvent.action === 'offside_flag') {
      setCurrentAction('offside_flag')
      const t = setTimeout(() => setCurrentAction(null), 2000)
      timeoutsRef.current.push(t)
    }

    if (latestEvent.action === 'free_kick') {
      setCurrentAction('free_kick')
    }

    if (latestEvent.type === 'corner') {
      setCurrentAction('corner_kick')
    }

    // Goal handling
    if (latestEvent.type === 'goal') {
      setScoringTeam(latestEvent.team)
      setCelebrationActive(true)
      setCurrentAction('goal_scored')
      setBallAnimating(true)
      setDisplayBall({ x: bx, y: by })

      const t1 = setTimeout(() => {
        if (lastEventKeyRef.current !== eventKey) return
        setCurrentAction('goal_kickoff')
        setDisplayBall({ x: 50, y: 50 })
        // Clear trajectory
        setPassTrajectory(null)
        const t2 = setTimeout(() => {
          if (lastEventKeyRef.current !== eventKey) return
          setCelebrationActive(false)
          setScoringTeam(null)
          setCurrentAction(null)
          setBallAnimating(false)
        }, 1200)
        timeoutsRef.current.push(t2)
      }, 2200)
      timeoutsRef.current.push(t1)
    } else {
      // Normal event: smooth ball movement
      setBallAnimating(true)
      setDisplayBall({ x: bx, y: by })

      if (latestEvent.type !== 'corner') {
        setCurrentAction(null)
      }
      if (latestEvent.type !== 'goal') {
        // Don't cancel celebration during goal sequence
        // but do cancel it for other event types after goal celebration
      }
    }

    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t)
      timeoutsRef.current = []
    }
  }, [latestEvent])

  // Find ball carrier
  const ballCarrier = useMemo(() => {
    if (!latestEvent || celebrationActive) return null
    return allPlayers.find((p) => p.player.name === latestEvent.player && p.team === latestEvent.team) || null
  }, [latestEvent, allPlayers, celebrationActive])

  // Goal fireworks
  const goalFireworks = useMemo(() => {
    if (!celebrationActive || !scoringTeam) return []
    const items = []
    for (let i = 0; i < 16; i++) {
      items.push({
        id: i, x: 20 + Math.random() * 60, y: scoringTeam === 'home' ? 10 + Math.random() * 25 : 65 + Math.random() * 25,
        delay: i * 0.07, color: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#f97316'][i % 6],
      })
    }
    return items
  }, [celebrationActive, scoringTeam])

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl bg-gradient-to-b from-emerald-800 to-emerald-950"
      style={{ aspectRatio: '3 / 5', maxHeight: '600px', minHeight: '380px' }}>
      {/* Pitch SVG lines */}
      <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice" fill="none">
        <rect x="2" y="2" width="96" height="156" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <line x1="2" y1="80" x2="98" y2="80" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <circle cx="50" cy="80" r="12" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <circle cx="50" cy="80" r="1" fill="rgba(255,255,255,0.9)" />
        <rect x="18" y="124" width="64" height="34" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <rect x="34" y="144" width="32" height="14" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <path d="M 34 124 A 14 14 0 0 1 66 124" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <rect x="18" y="2" width="64" height="34" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <rect x="34" y="2" width="32" height="14" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <path d="M 34 36 A 14 14 0 0 0 66 36" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4" />
        <rect x="38" y="1" width="24" height="3" stroke="rgba(255,255,255,0.6)" strokeWidth="0.3" fill="rgba(0,255,0,0.03)" />
        <rect x="38" y="156" width="24" height="3" stroke="rgba(255,255,255,0.6)" strokeWidth="0.3" fill="rgba(0,255,0,0.03)" />
      </svg>

      {/* Goal net animation */}
      <AnimatePresence>
        {celebrationActive && scoringTeam && (
          <motion.div key="goal-net"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1.1, 1], opacity: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={cn('absolute left-1/2 -translate-x-1/2 w-[32%] h-[8%] z-30', scoringTeam === 'home' ? 'top-0' : 'bottom-0')}>
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
              <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
              <line x1="2" y1="25" x2="98" y2="25" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <line x1="2" y1="75" x2="98" y2="75" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <line x1="25" y1="2" x2="25" y2="98" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <line x1="75" y1="2" x2="75" y2="98" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pass trajectory line */}
      <AnimatePresence>
        {passTrajectory && (
          <motion.svg key="pass-line"
            initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }}
            className="absolute inset-0 h-full w-full z-20 pointer-events-none"
            viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice">
            <line x1={passTrajectory.fromX} y1={passTrajectory.fromY}
              x2={passTrajectory.toX} y2={passTrajectory.toY}
              stroke="rgba(255,255,100,0.6)" strokeWidth="0.5" strokeDasharray="2,2" />
            <circle cx={passTrajectory.fromX} cy={passTrajectory.fromY} r="0.8" fill="rgba(255,255,100,0.3)" />
          </motion.svg>
        )}
      </AnimatePresence>

      {/* 22 Players */}
      {allPlayers.map(({ player, x, y, team }) => {
        const isCarrier = ballCarrier?.player.name === player.name && ballCarrier?.team === team
        const goalsCount = events.filter((e) => e.player === player.name && e.type === 'goal').length
        const hasYellow = events.some((e) => e.player === player.name && e.type === 'yellow')
        const hasRed = events.some((e) => e.player === player.name && e.type === 'red')

        return (
          <motion.div key={player.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center z-10 select-none"
            style={{ left: `${x}%`, top: `${y}%` }}
            animate={isCarrier && !celebrationActive ? { scale: 1.15, transition: { type: 'spring', stiffness: 220, damping: 10 } } : { scale: 1 }}>
            <div className="relative">
              <FieldPlayerNode player={player} compact={true} />
              <div className="absolute -right-1 -top-1 flex flex-col gap-0.5 z-20">
                {hasRed && <div className="h-3.5 w-2.5 rounded-[1px] bg-rose-600 shadow shadow-black/80 animate-bounce" />}
                {hasYellow && !hasRed && <div className="h-3.5 w-2.5 rounded-[1px] bg-amber-500 shadow shadow-black/80" />}
                {goalsCount > 0 && (
                  <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white border border-emerald-500 text-[8px] shadow shadow-black/80 font-black">⚽</div>
                )}
              </div>
            </div>
            <span className={cn('mt-0.5 max-w-[55px] truncate rounded px-1 py-0.5 text-[8px] font-black text-white leading-none drop-shadow',
              team === 'home' ? 'bg-emerald-950/80 border border-emerald-600/30' : 'bg-sky-950/80 border border-sky-600/30')}>
              {player.name.split(' ').slice(-1)[0]}
            </span>
          </motion.div>
        )
      })}

      {/* Goal celebration fireworks */}
      <AnimatePresence>
        {celebrationActive && goalFireworks.map((fw) => (
          <motion.div key={`fw-${fw.id}`} className="absolute z-30 pointer-events-none"
            style={{ left: `${fw.x}%`, top: `${fw.y}%` }}
            initial={{ scale: 0, opacity: 1, y: 0 }}
            animate={{ scale: [0, 1.5, 0], opacity: [1, 1, 0], y: [0, -25, -50] }}
            transition={{ duration: 1.8, delay: fw.delay, ease: 'easeOut' }}>
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: fw.color, boxShadow: `0 0 8px ${fw.color}` }} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* GOL! text overlay */}
      <AnimatePresence>
        {celebrationActive && scoringTeam && (
          <motion.div key="goal-text"
            initial={{ scale: 0, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 150, damping: 12 }}
            className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
                className="text-6xl font-black tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                style={{
                  color: scoringTeam === 'home' ? '#34d399' : '#60a5fa',
                  textShadow: `0 0 30px ${scoringTeam === 'home' ? 'rgba(52,211,153,0.6)' : 'rgba(96,165,250,0.6)'}`,
                }}>
                ⚽ GOL!
              </motion.span>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="mt-2 text-lg font-bold text-white/80 drop-shadow">
                {latestEvent?.player}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action indicators */}
      <AnimatePresence>
        {currentAction === 'goal_kickoff' && (
          <motion.div key="kickoff"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 1] }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ repeat: 2, duration: 0.6 }}
            className="absolute z-30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-16 w-16 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
              <span className="text-xs font-bold text-white/70">SAÍDA</span>
            </div>
          </motion.div>
        )}

        {currentAction === 'corner_kick' && latestEvent && (
          <motion.div key="corner"
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            className="absolute z-30 pointer-events-none"
            style={{ left: `${latestEvent.ballX}%`, top: `${latestEvent.ballY}%` }}>
            <motion.span animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-3xl font-black text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">🚩</motion.span>
          </motion.div>
        )}

        {currentAction === 'offside_flag' && (
          <motion.div key="offside"
            initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }}
            className="absolute top-4 left-4 z-40 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/80 px-3 py-1.5 text-sm font-black text-white shadow-lg">
              🚩 IMPEDIMENTO
            </span>
          </motion.div>
        )}

        {currentAction === 'free_kick' && latestEvent && (
          <motion.div key="free-kick"
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            className="absolute z-30 pointer-events-none"
            style={{ left: `${latestEvent.ballX}%`, top: `${latestEvent.ballY}%` }}>
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: 2, duration: 0.4 }}
              className="h-6 w-6 rounded-full border-2 border-white/70 flex items-center justify-center bg-white/10">
              <span className="text-[10px] font-black text-white">⚪</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* THE BALL - smooth spring animation */}
      <motion.div className="absolute z-20 pointer-events-none"
        animate={{ left: `${displayBall.x}%`, top: `${displayBall.y}%` }}
        transition={{
          type: 'spring', stiffness: 80, damping: 14, mass: 0.6,
        }}
        style={{ transform: 'translate(-50%, -50%)' }}>
        <motion.div
          animate={{
            rotate: ballAnimating ? [0, 360] : 0,
            scale: currentAction === 'goal_scored' ? [1, 1.4, 1] : 1,
          }}
          transition={{
            rotate: currentAction === 'goal_kickoff'
              ? { repeat: Infinity, duration: 0.3, ease: 'linear' }
              : ballAnimating ? { repeat: Infinity, duration: 1.5 } : { duration: 0.3 },
            scale: { duration: 0.3 },
          }}
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] ring-2 ring-white/30">
          <span className="text-[10px] leading-none">⚽</span>
        </motion.div>
      </motion.div>

      {/* Minute + latest event label */}
      <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white/80">
        <span className="tabular-nums">{simMinute}'</span>
        {latestEvent && !celebrationActive && (
          <span className="truncate max-w-[100px] text-emerald-300">
            {latestEvent.player.split(' ').slice(-1)[0]}
          </span>
        )}
        {latestEvent?.type === 'corner' && <span className="text-yellow-300">🚩</span>}
        {latestEvent?.type === 'goal' && <span className="text-emerald-300 animate-pulse">⚽</span>}
      </div>
    </div>
  )
}
