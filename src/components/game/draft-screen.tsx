'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dices, Check, ChevronRight, Loader2, Bot, Crown, ListOrdered, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { OvrBadge, PosBadge, PlayerAvatar } from './badges'
import { POSITIONS, type Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const FORMATION_PITCH: Record<string, Position[]> = {
  '4-3-3': ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meio Campo', 'Meia Ofensivo', 'Ponta Direita', 'Centroavante', 'Ponta Esquerdo'],
  '4-4-2': ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meio Campo', 'Meia Ofensivo', 'Ponta Direita', 'Centroavante', 'Ponta Esquerdo'],
  '3-5-2': ['Goleiro', 'Zagueiro', 'Zagueiro', 'Zagueiro', 'Lateral Direito', 'Volante', 'Meio Campo', 'Meia Ofensivo', 'Lateral Esquerdo', 'Atacante', 'Centroavante'],
  '4-2-3-1': ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Volante', 'Ponta Direita', 'Meia Ofensivo', 'Ponta Esquerda', 'Centroavante'],
  '5-3-2': ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Zagueiro', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meio Campo', 'Meia Ofensivo', 'Atacante', 'Centroavante'],
  '4-5-1': ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meio Campo', 'Meia Ofensivo', 'Ponta Direita', 'Ponta Esquerda', 'Centroavante'],
  '3-4-3': ['Goleiro', 'Zagueiro', 'Zagueiro', 'Zagueiro', 'Lateral Direito', 'Volante', 'Meio Campo', 'Lateral Esquerdo', 'Ponta Direita', 'Centroavante', 'Ponta Esquerda'],
}

export function DraftScreen({ emit }: { emit: (e: string, d?: any) => void }) {
  const user = useUserStore((s) => s.user)!
  const game = useGameStore()
  const draft = game.draft
  const participants = game.participants
  const [selected, setSelected] = useState<string[]>([])
  const [rolling, setRolling] = useState(false)
  const [displayRoll, setDisplayRoll] = useState<number | null>(null)

  const myParticipant = participants.find((p) => p.userId === user.id)
  const currentId = draft?.order[draft.currentTurnIndex]
  const currentParticipant = participants.find((p) => p.id === currentId)
  const isMyTurn = currentId === myParticipant?.id
  const mySquad = game.squads.find((s) => s.id === myParticipant?.id)?.squad || []
  const myFormation = myParticipant?.formation || '4-3-3'

  // Reset selection when turn changes (adjust during render — no effect needed)
  const [lastTurn, setLastTurn] = useState<string | undefined>(currentId)
  if (currentId !== lastTurn) {
    setLastTurn(currentId)
    setSelected([])
    setRolling(false)
  }

  // Animate dice when lastRoll changes (all setState inside rAF callback)
  useEffect(() => {
    const roll = draft?.lastRoll
    if (roll == null) return
    let raf = 0
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      if (elapsed < 800) {
        setDisplayRoll(Math.floor(Math.random() * 6) + 1)
        setRolling(true)
        raf = requestAnimationFrame(tick)
      } else {
        setDisplayRoll(roll)
        setRolling(false)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draft?.lastRoll])

  const handleRoll = () => {
    emit('draft:roll')
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= (draft?.picksPerTurn || 2)) return [prev[1], id]
      return [...prev, id]
    })
  }

  const handlePick = () => {
    if (selected.length === 0) {
      toast.error('Selecione pelo menos 1 jogador.')
      return
    }
    emit('draft:pick', { playerIds: selected })
    setSelected([])
  }

  const formationSlots = FORMATION_PITCH[myFormation] || FORMATION_PITCH['4-3-3']
  // Show placeholder when no roll for the current turn yet
  const shownRoll = draft?.lastRoll == null ? null : displayRoll

  // map my squad by position
  const squadByPos = useMemo(() => {
    const map: Record<string, typeof mySquad> = {}
    for (const pos of POSITIONS) map[pos] = []
    for (const p of mySquad) {
      if (!map[p.position]) map[p.position] = []
      map[p.position].push(p)
    }
    return map
  }, [mySquad])

  if (!draft) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    )
  }

  const progress = (draft.picks.length / (draft.order.length * draft.totalRounds * draft.picksPerTurn)) * 100

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Top bar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Draft</h1>
          <p className="text-sm text-muted-foreground">
            Rodada {draft.currentRound}/{draft.totalRounds} · Escolha {draft.picksPerTurn} jogadores por turno
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40 sm:w-56">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Progresso</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
        {/* Draft order */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListOrdered className="h-5 w-5 text-emerald-400" /> Ordem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[30rem] pr-2">
              <div className="space-y-1.5">
                {draft.order.map((pid, i) => {
                  const p = participants.find((pp) => pp.id === pid)
                  if (!p) return null
                  const sc = draft.squadCounts.find((s) => s.id === pid)
                  const isCurrent = i === draft.currentTurnIndex
                  return (
                    <div
                      key={pid}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2 transition',
                        isCurrent ? 'border-emerald-500/60 bg-emerald-500/10 shadow-md shadow-emerald-500/10' : 'border-border/40 bg-card/30'
                      )}
                    >
                      <span className={cn('grid h-6 w-6 place-items-center rounded text-xs font-bold', isCurrent ? 'bg-emerald-500 text-black' : 'bg-muted text-muted-foreground')}>
                        {i + 1}
                      </span>
                      <div className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: p.isBot ? '#475569' : '#16a34a' }}>
                        {p.isBot ? <Bot className="h-3.5 w-3.5" /> : p.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-semibold">
                          {p.username}
                          {p.isHost && <Crown className="h-3 w-3 text-amber-400" />}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{sc?.count || 0}/12</Badge>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Center: dice + options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Vez de: <span className="text-emerald-400">{currentParticipant?.username}</span></span>
              {currentParticipant?.isBot && <Badge variant="outline" className="text-xs"><Bot className="mr-1 h-3 w-3" /> Bot</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dice area */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-6">
              <AnimatePresence mode="wait">
                {shownRoll !== null ? (
                  <motion.div
                    key={shownRoll}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                    className={cn(
                      'grid h-24 w-24 place-items-center rounded-2xl text-5xl font-black shadow-2xl',
                      rolling ? 'bg-amber-500 text-black animate-pulse' : 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white'
                    )}
                  >
                    {shownRoll}
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/30"
                  >
                    <Dices className="h-10 w-10 text-muted-foreground" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="text-center">
                {draft.status === 'rolling' && isMyTurn && (
                  <Button size="lg" className="font-bold" onClick={handleRoll}>
                    <Dices className="mr-2 h-5 w-5" /> Rolar dado
                  </Button>
                )}
                {draft.status === 'rolling' && !isMyTurn && (
                  <p className="text-sm text-muted-foreground">Aguardando {currentParticipant?.username} rolar o dado...</p>
                )}
                {draft.status === 'choosing' && isMyTurn && (
                  <p className="text-sm font-semibold text-emerald-400">Escolha {draft.picksPerTurn} jogadores abaixo</p>
                )}
                {draft.status === 'choosing' && !isMyTurn && (
                  <p className="text-sm text-muted-foreground">{currentParticipant?.username} está escolhendo...</p>
                )}
                {draft.status === 'bot-thinking' && (
                  <p className="flex items-center gap-2 text-sm text-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> Bot pensando...
                  </p>
                )}
                {draft.status === 'done' && (
                  <p className="text-sm font-bold text-emerald-400">Draft concluído!</p>
                )}
              </div>
            </div>

            {/* Options */}
            {draft.currentOptions.length > 0 && draft.status !== 'done' && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Opções disponíveis</p>
                  {isMyTurn && draft.status === 'choosing' && (
                    <Badge variant="secondary">{selected.length}/{draft.picksPerTurn} selecionados</Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.currentOptions.map((opt) => {
                    const isSel = selected.includes(opt.id)
                    const canSelect = isMyTurn && draft.status === 'choosing'
                    return (
                      <motion.button
                        key={opt.id}
                        whileHover={canSelect ? { scale: 1.02 } : {}}
                        whileTap={canSelect ? { scale: 0.98 } : {}}
                        onClick={() => canSelect && toggleSelect(opt.id)}
                        disabled={!canSelect}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-2.5 text-left transition',
                          isSel ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/40' : 'border-border/50 bg-card/40 hover:border-emerald-500/40',
                          !canSelect && 'cursor-default'
                        )}
                      >
                        <PlayerAvatar name={opt.name} color={opt.photoColor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-sm">{opt.name}</p>
                          <div className="flex items-center gap-1.5">
                            <PosBadge position={opt.position} />
                            <span className="text-[10px] text-muted-foreground truncate">{opt.club} {opt.year}</span>
                          </div>
                        </div>
                        <OvrBadge ovr={opt.overall} />
                        {isSel && <Check className="h-4 w-4 text-emerald-400" />}
                      </motion.button>
                    )
                  })}
                </div>
                {isMyTurn && draft.status === 'choosing' && (
                  <Button className="mt-3 w-full" size="lg" onClick={handlePick} disabled={selected.length === 0}>
                    <Check className="mr-2 h-5 w-5" /> Confirmar ({selected.length})
                  </Button>
                )}
              </div>
            )}

            {draft.currentOptions.length === 0 && draft.status !== 'done' && draft.lastRoll === null && (
              <div className="rounded-lg border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
                {isMyTurn ? 'Role o dado para ver as opções de jogadores.' : 'Aguarde o turno atual.'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My squad */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-emerald-400" /> Meu time
            </CardTitle>
            <p className="text-xs text-muted-foreground">{myFormation} · {mySquad.length} jogadores</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[30rem] pr-2">
              <div className="space-y-1.5">
                {formationSlots.map((pos, i) => {
                  const players = squadByPos[pos] || []
                  const filled = players.length > 0
                  return (
                    <div key={i} className={cn('flex items-center gap-2 rounded-lg border p-2', filled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-dashed border-border/40 bg-muted/20')}>
                      <PosBadge position={pos} className="w-12" />
                      {filled ? (
                        <div className="flex flex-1 flex-wrap gap-1.5">
                          {players.map((p) => (
                            <div key={p.id} className="flex items-center gap-1.5 rounded bg-card/60 px-2 py-1">
                              <PlayerAvatar name={p.name} color={p.photoColor} size="sm" />
                              <span className="text-xs font-medium">{p.name}</span>
                              <OvrBadge ovr={p.overall} className="scale-90" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="flex-1 text-xs text-muted-foreground italic">Vazio</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
