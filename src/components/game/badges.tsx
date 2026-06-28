'use client'

import { cn } from '@/lib/utils'

export function ovrColor(ovr: number): string {
  if (ovr >= 90) return 'bg-emerald-500 text-white'
  if (ovr >= 80) return 'bg-lime-500 text-black'
  if (ovr >= 70) return 'bg-amber-500 text-black'
  if (ovr >= 60) return 'bg-orange-500 text-white'
  return 'bg-zinc-500 text-white'
}

export function OvrBadge({ ovr, className }: { ovr: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md font-bold text-xs px-1.5 py-0.5 min-w-[2rem] tabular-nums',
        ovrColor(ovr),
        className
      )}
    >
      {ovr}
    </span>
  )
}

export const POS_COLORS: Record<string, string> = {
  Goleiro: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  'Lateral Direito': 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Zagueiro: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  'Lateral Esquerdo': 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Volante: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'Meio Campo': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'Meia Ofensivo': 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  'Ponta Direita': 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  'Ponta Esquerda': 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  Atacante: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  Centroavante: 'bg-red-500/20 text-red-300 border-red-500/40',
}

export function PosBadge({ position, className }: { position: string; className?: string }) {
  const short: Record<string, string> = {
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
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        POS_COLORS[position] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
        className
      )}
      title={position}
    >
      {short[position] || position.slice(0, 3)}
    </span>
  )
}

export function TeamCrest({
  name,
  year,
  badgeColor,
  accentColor,
  size = 'md',
}: {
  name: string
  year?: number
  badgeColor: string
  accentColor: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-16 w-16 text-lg' : 'h-12 w-12 text-sm'
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div
      className={cn('relative flex items-center justify-center rounded-full font-extrabold shrink-0 shadow-lg', dims)}
      style={{
        background: `linear-gradient(135deg, ${badgeColor} 50%, ${accentColor} 50%)`,
        color: '#fff',
        border: '2px solid rgba(255,255,255,0.25)',
      }}
    >
      <span className="drop-shadow-md">{initials}</span>
    </div>
  )
}

export function PlayerAvatar({
  name,
  color,
  size = 'md',
}: {
  name: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-10 w-10 text-xs'
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div
      className={cn('flex items-center justify-center rounded-full font-bold shrink-0', dims)}
      style={{ backgroundColor: color, color: '#fff' }}
    >
      {initials}
    </div>
  )
}
