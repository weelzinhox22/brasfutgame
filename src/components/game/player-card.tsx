'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Star, Check, Sparkles, User, Loader2 } from 'lucide-react'
import type { HistoricalPlayer, Position } from '@/lib/types'
import { cn } from '@/lib/utils'

// In-memory cache for player photos keyed by "PlayerName-ClubName"
export const photoCache = new Map<string, string | null>()

/**
 * Fetch player photos from Wikipedia using names and clubs.
 * Validates that the returned page title actually matches the player's name to avoid false positives.
 */
export async function getWikipediaPhoto(playerName: string, clubName: string): Promise<string | null> {
  const cacheKey = `${playerName}-${clubName}`
  if (photoCache.has(cacheKey)) {
    return photoCache.get(cacheKey)!
  }

  // Clean name and club name
  const cleanName = playerName.replace(/\([^)]*\)/g, '').trim()
  const cleanClub = clubName.replace(/\([^)]*\)/g, '').trim()
  
  // Name match validation rule: Page title must contain at least one main part of the name
  const isNameMatch = (wikiTitle: string) => {
    const titleLower = wikiTitle.toLowerCase()
    const nameParts = cleanName.toLowerCase().split(' ').filter(p => p.length > 2)
    return nameParts.some(part => titleLower.includes(part))
  }

  // 1. Try Portuguese Wikipedia with Name + Club to get the exact match
  try {
    const query = encodeURIComponent(`${cleanName} "${cleanClub}" futebol`)
    const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageimages&pithumbsize=400&piprop=thumbnail&format=json&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    if (data?.query?.pages) {
      const pages = data.query.pages
      const pageId = Object.keys(pages)[0]
      const page = pages[pageId]
      const source = page?.thumbnail?.source
      const title = page?.title || ""
      if (source && isNameMatch(title)) {
        photoCache.set(cacheKey, source)
        return source
      }
    }
  } catch (e) {
    console.error("Wikipedia PT error for:", cleanName, cleanClub, e)
  }

  // 2. Try English Wikipedia with Name + Club
  try {
    const query = encodeURIComponent(`${cleanName} "${cleanClub}" football`)
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageimages&pithumbsize=400&piprop=thumbnail&format=json&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    if (data?.query?.pages) {
      const pages = data.query.pages
      const pageId = Object.keys(pages)[0]
      const page = pages[pageId]
      const source = page?.thumbnail?.source
      const title = page?.title || ""
      if (source && isNameMatch(title)) {
        photoCache.set(cacheKey, source)
        return source
      }
    }
  } catch (e) {
    console.error("Wikipedia EN error for:", cleanName, cleanClub, e)
  }

  // 3. Fallback to general Portuguese "Name futebolista" search
  try {
    const query = encodeURIComponent(`${cleanName} futebolista`)
    const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageimages&pithumbsize=400&piprop=thumbnail&format=json&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    if (data?.query?.pages) {
      const pages = data.query.pages
      const pageId = Object.keys(pages)[0]
      const page = pages[pageId]
      const source = page?.thumbnail?.source
      const title = page?.title || ""
      if (source && isNameMatch(title)) {
        photoCache.set(cacheKey, source)
        return source
      }
    }
  } catch (e) {
    console.error("Wikipedia Fallback PT error:", cleanName, e)
  }

  // 4. Fallback to general English "Name footballer" search
  try {
    const query = encodeURIComponent(`${cleanName} footballer`)
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageimages&pithumbsize=400&piprop=thumbnail&format=json&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    if (data?.query?.pages) {
      const pages = data.query.pages
      const pageId = Object.keys(pages)[0]
      const page = pages[pageId]
      const source = page?.thumbnail?.source
      const title = page?.title || ""
      if (source && isNameMatch(title)) {
        photoCache.set(cacheKey, source)
        return source
      }
    }
  } catch (e) {
    console.error("Wikipedia Fallback EN error:", cleanName, e)
  }

  photoCache.set(cacheKey, null)
  return null
}

interface PlayerCardProps {
  player: HistoricalPlayer
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  hideOvr?: boolean
}

// 2px solid black outline style to guarantee absolute readability of OVR/Position on top of detailed frame graphics
const textOutlineStyle = {
  textShadow: `
    2px 2px 0 #000,
    -2px -2px 0 #000,
    2px -2px 0 #000,
    -2px 2px 0 #000,
    0px 2px 0 #000,
    0px -2px 0 #000,
    2px 0px 0 #000,
    -2px 0px 0 #000,
    1px 1px 3px rgba(0,0,0,0.9)
  `
}

/** Static Card showcasing the premium Ultimate Team style frame with Wikipedia photo integration */
export function PlayerCard({ player, selected, disabled, onClick, size = 'md', hideOvr }: PlayerCardProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getWikipediaPhoto(player.name, player.club).then((url) => {
      if (active) {
        setPhotoUrl(url)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [player.name, player.club])

  // Exact 2:3 aspect ratio dimensions
  const dims =
    size === 'sm' ? 'w-32 h-48' : size === 'lg' ? 'w-48 h-72' : 'w-36 h-54'
  
  const initials = player.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const stats = player.stats || { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 }
  
  const posShort: Record<Position, string> = {
    Goleiro: 'GOL', 'Lateral Direito': 'LD', Zagueiro: 'ZAG', 'Lateral Esquerdo': 'LE',
    Volante: 'VOL', 'Meio Campo': 'MC', 'Meia Ofensivo': 'MEI',
    'Ponta Direita': 'PD', 'Ponta Esquerda': 'PE', Atacante: 'ATA', Centroavante: 'CA',
  }

  // Determine card type based on overall rating
  const isSupreme = player.overall >= 90
  const isGold = player.overall >= 80 && player.overall < 90
  const isSilver = player.overall >= 70 && player.overall < 80
  
  const frameSrc = isSupreme
    ? '/supreme_frame.png'
    : isGold 
      ? '/gold_frame.png' 
      : isSilver 
        ? '/silver_frame.png' 
        : '/bronze_frame.png'

  const ovrColor = isSupreme
    ? 'text-[#e0f2fe]' // cosmic sky-blue
    : isGold 
      ? 'text-amber-400' 
      : isSilver 
        ? 'text-slate-100' 
        : 'text-[#e5a975]' // bronze-copper

  const posColor = isSupreme
    ? 'text-cyan-200'
    : isGold 
      ? 'text-amber-200' 
      : isSilver 
        ? 'text-slate-300' 
        : 'text-[#d28b52]'

  // Dynamic font sizing for player names based on length to prevent truncation
  const nameSize = player.name.length > 16 
    ? 'text-[10px]' 
    : player.name.length > 12 
      ? 'text-[11.5px]' 
      : 'text-[13px]'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.04, y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-2xl text-white shadow-2xl transition border border-amber-500/20',
        dims,
        selected && 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-background z-10',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
      style={{
        background: 'radial-gradient(circle at center, #1b1c20 0%, #0d0e12 100%)',
      }}
    >
      {/* 1. Behind the Frame: Player Photo / Portrait Cutout */}
      <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-[85%] h-[48%] overflow-hidden select-none">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500/60" />
          </div>
        ) : photoUrl ? (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={player.name}
              className="h-full w-full object-cover object-top scale-105"
              loading="lazy"
            />
            {/* bottom vignette fade to blend into the card background */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0d0e12] via-[#0d0e12]/80 to-transparent" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center opacity-30">
            <User className="h-16 w-16 text-slate-500" />
          </div>
        )}
      </div>

      {/* 2. Middle Layer: Gold/Silver/Bronze/Supreme Frame Asset Overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frameSrc}
        alt="Player Card Frame"
        className="pointer-events-none absolute inset-0 h-full w-full object-fill"
      />

      {/* 3. Front Layer: Player Metadata & Stats */}
      <div className="absolute inset-0 flex flex-col justify-between p-3 select-none">
        {/* Top Section: Overall + Position (High Contrast Outline Text) */}
        <div className="flex flex-col items-start leading-none mt-1.5 pl-1.5">
          {hideOvr ? (
            <span className="text-3xl font-black text-white" style={textOutlineStyle}>??</span>
          ) : (
            <span 
              className={cn("text-3xl font-black", ovrColor)} 
              style={textOutlineStyle}
            >
              {player.overall}
            </span>
          )}
          <span 
            className={cn("mt-0.5 text-[9.5px] font-black uppercase tracking-wider", posColor)} 
            style={textOutlineStyle}
          >
            {hideOvr ? '???' : posShort[player.position]}
          </span>
        </div>

        {/* Bottom Section: Name, Club, Stats */}
        <div className="flex flex-col items-center w-full pb-1">
          {/* Name */}
          <p 
            className={cn(
              "w-full text-center truncate font-black uppercase tracking-wide text-amber-50 drop-shadow-[0_1.5px_2px_rgba(0,0,0,1)] px-0.5",
              nameSize
            )}
          >
            {player.name}
          </p>
          {/* Club & Country */}
          <p className="w-full text-center truncate text-[9.5px] font-bold text-amber-400 drop-shadow-[0_1.5px_2px_rgba(0,0,0,1)]">
            {player.club} · {player.year}
          </p>

          {/* Divider */}
          <div className="my-1.5 h-[1px] w-4/5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

          {/* Stats Grid */}
          {!hideOvr && (
            <div className="grid grid-cols-3 gap-x-1.5 gap-y-0.5 w-full px-1 text-center">
              {[
                ['PAC', stats.pace],
                ['FIN', stats.shooting],
                ['PAS', stats.passing],
                ['DRI', stats.dribbling],
                ['DEF', stats.defending],
                ['FIS', stats.physical],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-center gap-0.5">
                  <span className="text-[7.5px] font-bold text-amber-200/70">{label}</span>
                  <span className="text-[10px] font-black text-amber-100 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Country footer representation */}
          <p className="mt-1 text-[7px] font-bold uppercase tracking-widest text-amber-300/30">{player.country}</p>
        </div>
      </div>

      {/* Selected Indicator */}
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow shadow-black/80 z-20"
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

/** Card that starts face-down (pack style) and flips to reveal the premium gold card */
export function RevealableCard({ player, revealed, onReveal, onSelect, selected, disabled, hideOvr }: RevealableCardProps) {
  const flipped = revealed

  const handleClick = () => {
    if (disabled) return
    if (!revealed) {
      onReveal()
    } else if (onSelect) {
      onSelect()
    }
  }

  // Determine card type based on overall rating
  const isSupreme = player.overall >= 90
  const isGold = player.overall >= 80 && player.overall < 90
  const isSilver = player.overall >= 70 && player.overall < 80
  
  const frameSrc = isSupreme
    ? '/supreme_frame.png'
    : isGold 
      ? '/gold_frame.png' 
      : isSilver 
        ? '/silver_frame.png' 
        : '/bronze_frame.png'

  return (
    <div className="relative h-54 w-36 [perspective:1000px]">
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
            'absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 text-white shadow-2xl [backface-visibility:hidden]',
            revealed && 'pointer-events-none',
            !revealed && !disabled && 'cursor-pointer hover:scale-105 transition'
          )}
          style={{
            background: 'radial-gradient(circle at center, #1b1c20 0%, #0d0e12 100%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frameSrc}
            alt="Frame Back"
            className="absolute inset-0 h-full w-full object-fill opacity-20 pointer-events-none"
          />
          <div className="relative grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 border border-amber-500/30 shadow-inner">
            <Star className="h-7 w-7 text-amber-500 animate-pulse" />
          </div>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-400">REVELAR</p>
          <p className="mt-0.5 text-[8px] text-amber-300/40">clique para ver</p>
        </button>

        {/* Front of card (revealed) */}
        <div className={cn(
          'absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]',
          !revealed && 'pointer-events-none'
        )}>
          <PlayerCard player={player} selected={selected} disabled={disabled} onClick={onSelect} hideOvr={hideOvr} />
        </div>
      </motion.div>
    </div>
  )
}
