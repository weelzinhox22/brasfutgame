'use client'

import { motion } from 'framer-motion'
import { Star, Check, Sparkles } from 'lucide-react'
import type { HistoricalPlayer, Position } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * eFootball / EA FC style player card.
 * Shows: OVR, position, name, club, year, country, 6 stats, photo placeholder.
 * Has a "card pack" reveal animation when `reveal` is triggered.
 */

function tierBg(ovr: number): string {
  if (ovr >= 90) return 'linear-gradient(135deg, #1e3a8a 0%, #6d28d9 50%, #1e3a8a 100%)' // epic purple/blue
  if (ovr >= 85) return 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #b45309 100%)' // gold-orange
  if (ovr >= 78) return 'linear-gradient(135deg, #a16207 0%, #eab308 50%, #a16207 100%)' // gold
  if (ovr >= 70) return 'linear-gradient(135deg, #334155 0%, #64748b 50%, #334155 100%)' // silver
  return 'linear-gradient(135deg, #44403c 0%, #78716c 50%, #44403c 100%)' // bronze
}

function tierGlow(ovr: number): string {
  if (ovr >= 90) return 'shadow-[0_0_25px_rgba(124,58,237,0.6)]'
  if (ovr >= 85) return 'shadow-[0_0_20px_rgba(245,158,11,0.5)]'
  if (ovr >= 78) return 'shadow-[0_0_15px_rgba(234,179,8,0.4)]'
  return 'shadow-lg'
}

interface PlayerCardProps {
  player: HistoricalPlayer
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  hideOvr?: boolean
}

/** A static card (no reveal animation) — used for picked players / squad display */
export function PlayerCard({ player, selected, disabled, onClick, size = 'md', hideOvr }: PlayerCardProps) {
  const dims =
    size === 'sm' ? 'w-32 h-44' : size === 'lg' ? 'w-48 h-64' : 'w-36 h-52'
  const initials = player.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const stats = player.stats || { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 }
  const posShort: Record<Position, string> = {
    Goleiro: 'GOL', 'Lateral Direito': 'LD', Zagueiro: 'ZAG', 'Lateral Esquerdo': 'LE',
    Volante: 'VOL', 'Meio Campo': 'MC', 'Meia Ofensivo': 'MEI',
    'Ponta Direita': 'PD', 'Ponta Esquerda': 'PE', Atacante: 'ATA', Centroavante: 'CA',
  }

  // When hideOvr is on, use a neutral mysterious background
  const bg = hideOvr
    ? 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)'
    : tierBg(player.overall)
  const glow = hideOvr ? 'shadow-lg' : tierGlow(player.overall)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.04, y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-xl text-white transition',
        dims,
        glow,
        selected && 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-background',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
      style={{ background: bg }}
    >
      {/* shine overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/30" />
      <div className="pointer-events-none absolute -inset-x-10 -top-10 h-20 rotate-12 bg-white/10 blur-xl" />

      {/* Top row: OVR + position (hidden when hideOvr) */}
      <div className="relative flex items-start justify-between p-2">
        <div className="flex flex-col items-center leading-none">
          {hideOvr ? (
            <span className="text-lg font-black drop-shadow-md">??</span>
          ) : (
            <span className="text-2xl font-black drop-shadow-md">{player.overall}</span>
          )}
          <span className="mt-0.5 rounded bg-black/30 px-1 text-[9px] font-bold uppercase">{hideOvr ? '???' : posShort[player.position]}</span>
        </div>
        {!hideOvr && player.overall >= 90 && (
          <Sparkles className="h-4 w-4 text-amber-300" />
        )}
        {hideOvr && (
          <span className="text-[9px] font-bold uppercase text-white/40">mistério</span>
        )}
      </div>

      {/* Photo / avatar */}
      <div className="relative mx-auto -mt-1 grid h-14 w-14 place-items-center rounded-full border-2 border-white/40 bg-black/20">
        <span className="text-sm font-black drop-shadow">{initials}</span>
      </div>

      {/* Name (always visible) */}
      <div className="relative mt-1 px-1 text-center">
        <p className="truncate text-xs font-bold uppercase tracking-tight">{player.name}</p>
        <p className="truncate text-[9px] text-white/70">{player.club} · {player.year}</p>
      </div>

      {/* Stats grid (hidden when hideOvr) */}
      {!hideOvr && (
        <div className="relative mt-1.5 grid grid-cols-3 gap-x-1 gap-y-0.5 px-2 text-center">
          {[
            ['PAC', stats.pace],
            ['FIN', stats.shooting],
            ['PAS', stats.passing],
            ['DRI', stats.dribbling],
            ['DEF', stats.defending],
            ['FIS', stats.physical],
          ].map(([label, val]) => (
            <div key={label as string} className="flex items-center justify-center gap-0.5">
              <span className="text-[8px] font-bold text-white/60">{label}</span>
              <span className="text-[10px] font-black tabular-nums">{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Country footer */}
      <div className="relative mt-1 px-2 pb-1.5">
        <p className="text-center text-[8px] uppercase tracking-wider text-white/50">{player.country}</p>
      </div>

      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"
        >
          <Check className="h-3 w-3" />
        </motion.div>
      )}
    </motion.button>
  )
}

interface RevealableCardProps {
  player: HistoricalPlayer
  revealed: boolean
  onReveal: () => void
  onSelect?: () => void
  selected?: boolean
  disabled?: boolean
  hideOvr?: boolean
}

/**
 * Card that starts face-down (like a pack) and flips to reveal the player.
 * Calls onReveal when clicked face-down, then onSelect when clicked face-up.
 */
export function RevealableCard({ player, revealed, onReveal, onSelect, selected, disabled, hideOvr }: RevealableCardProps) {
  // Derive flipped state directly from the revealed prop — no effect needed.
  const flipped = revealed

  const handleClick = () => {
    if (disabled) return
    if (!revealed) {
      onReveal()
    } else if (onSelect) {
      onSelect()
    }
  }

  return (
    <div className="relative h-52 w-36 [perspective:1000px]">
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 120, damping: 18 }}
      >
        {/* Back of card (face down) */}
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-amber-400/60 text-white shadow-xl [backface-visibility:hidden]',
            !revealed && !disabled && 'cursor-pointer hover:scale-105 transition'
          )}
          style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)' }}
        >
          <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-500/20 ring-2 ring-amber-400/50">
            <Star className="h-7 w-7 text-amber-400" />
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-amber-300">Revelar</p>
          <p className="mt-0.5 text-[9px] text-amber-200/60">clique para ver</p>
        </button>

        {/* Front of card (revealed) */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <PlayerCard player={player} selected={selected} disabled={disabled} onClick={onSelect} hideOvr={hideOvr} />
        </div>
      </motion.div>
    </div>
  )
}
