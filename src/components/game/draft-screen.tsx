'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dices, Check, Loader2, Bot, Crown, ListOrdered, Users, Sparkles, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store/user-store'
import { useGameStore, type DraftSquad } from '@/store/game-store'
import { PitchFormation, getFormationSlots } from './pitch-formation'
import { PlayerCard, RevealableCard } from './player-card'
import { OvrBadge, PosBadge } from './badges'
import type { HistoricalPlayer, Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function DraftScreen({ emit }: { emit: (e: string, d?: any) => void }) {
  const user = useUserStore((s) => s.user)!
  const game = useGameStore()
  const draft = game.draft
  const participants = game.participants

  // Track which option cards have been revealed (by player id)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string[]>([])
  const [rolling, setRolling] = useState(false)
  const [displayRoll, setDisplayRoll] = useState<number | null>(null)
  // Picks being animated (flying to pitch)
  const [animatingPicks, setAnimatingPicks] = useState<HistoricalPlayer[]>([])

  const myParticipant = participants.find((p) => p.userId === user.id)
  const currentId = draft?.order[draft.currentTurnIndex]
  const currentParticipant = participants.find((p) => p.id === currentId)
  const isMyTurn = currentId === myParticipant?.id

  // Get my squad from draft.squads (live-updated) — fallback to game.squads
  const myDraftSquad: DraftSquad | undefined = draft?.squads?.find((s) => s.id === myParticipant?.id)
  const mySquad: HistoricalPlayer[] = myDraftSquad?.squad || []
  const myFormation = myDraftSquad?.formation || myParticipant?.formation || '4-3-3'

  // Reset selection/revealed when turn changes
  const [lastTurn, setLastTurn] = useState<string | undefined>(currentId)
  const [lastOptions, setLastOptions] = useState<number>(draft?.currentOptions.length || 0)
  if (currentId !== lastTurn || (draft?.currentOptions.length || 0) !== lastOptions) {
    setLastTurn(currentId)
    setLastOptions(draft?.currentOptions.length || 0)
    setSelected([])
    setRevealed(new Set())
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
    const pid = participants.find((p) => p.userId === user.id)?.id
    emit('draft:roll', { participantId: pid })
  }

  const handleReveal = (playerId: string) => {
    setRevealed((prev) => new Set(prev).add(playerId))
  }

  const toggleSelect = (playerId: string) => {
    setSelected((prev) => {
      if (prev.includes(playerId)) return prev.filter((x) => x !== playerId)
      if (prev.length >= (draft?.picksPerTurn || 2)) return [prev[1], playerId]
      return [...prev, playerId]
    })
  }

  const handlePick = () => {
    if (selected.length === 0) {
      toast.error('Selecione pelo menos 1 jogador.')
      return
    }
    // Animate the picked players flying to the pitch before confirming
    const pickedPlayers = (draft?.currentOptions || []).filter((o) => selected.includes(o.id))
    setAnimatingPicks(pickedPlayers)
    setTimeout(() => {
      const pid = participants.find((p) => p.userId === user.id)?.id
      emit('draft:pick', { participantId: pid, playerIds: selected })
      setSelected([])
      setRevealed(new Set())
      setAnimatingPicks([])
    }, 700)
  }

  const formationSlots = getFormationSlots(myFormation)
  const shownRoll = draft?.lastRoll == null ? null : displayRoll

  // Needed positions for highlighting on pitch
  const neededPositions = useMemo(() => {
    const required = formationSlots.map((s) => s.position)
    const have = [...mySquad.map((p) => p.position)]
    const needed = new Set<Position>()
    for (const req of required) {
      const idx = have.indexOf(req)
      if (idx >= 0) have.splice(idx, 1)
      else needed.add(req)
    }
    return needed
  }, [mySquad, formationSlots])

  // highlight the most urgent needed position
  const highlightPosition = neededPositions.size > 0 ? Array.from(neededPositions)[0] : null

  const picksPerTurn = draft?.picksPerTurn || 2

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
            Rodada {draft.currentRound}/{draft.totalRounds} · Escolha {picksPerTurn} jogadores por turno
          </p>
        </div>
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

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Left: Draft order */}
        <Card className="hidden lg:block">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListOrdered className="h-5 w-5 text-emerald-400" /> Ordem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[34rem] pr-2">
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

        {/* Center: My pitch + dice + cards */}
        <div className="space-y-4">
          {/* My pitch */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-400" /> Meu time
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{myFormation}</Badge>
                  <Badge variant="secondary">{mySquad.length}/12</Badge>
                  {mySquad.length >= 11 && <OvrBadge ovr={Math.round(mySquad.slice(0, 11).reduce((a, p) => a + p.overall, 0) / Math.min(11, mySquad.length))} />}
                </div>
              </CardTitle>
              {neededPositions.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  Posições a preencher: {Array.from(neededPositions).map((p) => p).join(', ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <PitchFormation
                formation={myFormation}
                squad={mySquad}
                highlightPosition={highlightPosition}
                compact
              />
            </CardContent>
          </Card>

          {/* Dice + action area */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col items-center gap-4">
                {/* Turn indicator */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Vez de:</span>
                  <span className="font-bold text-emerald-400">{currentParticipant?.username}</span>
                  {currentParticipant?.isBot && <Badge variant="outline" className="text-xs"><Bot className="mr-1 h-3 w-3" /> Bot</Badge>}
                </div>

                {/* Dice */}
                <div className="flex items-center gap-4">
                  <AnimatePresence mode="wait">
                    {shownRoll !== null ? (
                      <motion.div
                        key={shownRoll}
                        initial={{ scale: 0, rotate: -180 }}
                        animate={
                          rolling
                            ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.15, 1], y: [0, -15, 0] }
                            : { scale: 1, rotate: 0, y: 0 }
                        }
                        transition={
                          rolling
                            ? { repeat: Infinity, duration: 0.5, ease: "linear" }
                            : { type: 'spring', stiffness: 200, damping: 12 }
                        }
                        className={cn(
                          'grid h-20 w-20 place-items-center rounded-2xl text-4xl font-black shadow-2xl',
                          rolling ? 'bg-amber-500 text-black' : 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white'
                        )}
                      >
                        {shownRoll}
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid h-20 w-20 place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/30"
                      >
                        <Dices className="h-9 w-9 text-muted-foreground" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col gap-1.5">
                    {draft.status === 'rolling' && isMyTurn && (
                      <Button size="lg" className="font-bold" onClick={handleRoll}>
                        <Dices className="mr-2 h-5 w-5" /> Rolar dado
                      </Button>
                    )}
                    {draft.status === 'rolling' && !isMyTurn && (
                      <p className="text-sm text-muted-foreground">Aguardando rolar o dado...</p>
                    )}
                    {draft.status === 'choosing' && isMyTurn && (
                      <>
                        <p className="text-sm font-semibold text-emerald-400">Escolha {picksPerTurn} cartas</p>
                        <p className="text-xs text-muted-foreground">Clique para revelar, depois selecione</p>
                      </>
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

                {/* Pick confirmation */}
                {isMyTurn && draft.status === 'choosing' && (
                  <div className="flex w-full items-center gap-3">
                    <Badge variant="secondary" className="text-sm">
                      {selected.length}/{picksPerTurn} selecionados
                    </Badge>
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={handlePick}
                      disabled={selected.length === 0}
                    >
                      <Check className="mr-2 h-5 w-5" /> Confirmar ({selected.length})
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Options as eFootball cards with reveal animation */}
          {draft.currentOptions.length > 0 && draft.status !== 'done' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-amber-400" /> Cartas disponíveis
                  {isMyTurn && draft.status === 'choosing' && (
                    <Badge variant="outline" className="text-xs">Clique para revelar</Badge>
                  )}
                  {draft.hideOvr && (
                    <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-300">OVR oculto</Badge>
                  )}
                  {draft.privatePicks && (
                    <Badge variant="outline" className="text-xs border-rose-500/40 text-rose-300">Picks privados</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  <AnimatePresence>
                    {draft.currentOptions.map((opt) => {
                      const isRevealed = revealed.has(opt.id)
                      const isSel = selected.includes(opt.id)
                      const canInteract = isMyTurn && draft.status === 'choosing'
                      return (
                        <motion.div
                          key={opt.id}
                          layout
                          initial={{ opacity: 0, scale: 0.5, y: 30, rotateY: -15 }}
                          animate={{
                            opacity: 1,
                            scale: animatingPicks.find((p) => p.id === opt.id) ? 0.3 : 1,
                            y: animatingPicks.find((p) => p.id === opt.id) ? -120 : 0,
                            rotateY: animatingPicks.find((p) => p.id === opt.id) ? 180 : 0,
                          }}
                          exit={{ opacity: 0, scale: 0, y: -50 }}
                          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                          whileHover={!isRevealed || !canInteract ? {} : { scale: 1.05 }}
                        >
                          <RevealableCard
                            player={opt}
                            revealed={isRevealed}
                            onReveal={() => handleReveal(opt.id)}
                            onSelect={() => canInteract && toggleSelect(opt.id)}
                            selected={isSel}
                            disabled={!canInteract && !isRevealed}
                            hideOvr={draft.hideOvr}
                          />
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          )}

          {draft.currentOptions.length === 0 && draft.status !== 'done' && draft.lastRoll === null && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {isMyTurn ? 'Role o dado para revelar as cartas de jogadores.' : 'Aguarde o turno atual.'}
              </CardContent>
            </Card>
          )}

          {/* Private picks: other players see a hidden state */}
          {draft.privatePicks && !isMyTurn && draft.status === 'choosing' && (
            <Card className="border-rose-500/30 bg-rose-500/5">
              <CardContent className="p-8 text-center">
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-sm font-semibold text-rose-300"
                >
                  🔒 {currentParticipant?.username} está escolhendo em privado...
                </motion.div>
                <p className="mt-1 text-xs text-muted-foreground">As cartas ficam ocultas até o pick ser confirmado.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Picks feed + needed positions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListOrdered className="h-5 w-5 text-emerald-400" /> Posições
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {formationSlots.map((slot, i) => {
                  const filled = mySquad.filter((p) => p.position === slot.position).length > i - mySquad.filter((p) => p.position === slot.position && formationSlots.findIndex(s => s.position === slot.position) < formationSlots.indexOf(slot)).length
                  // simpler: count how many of this position we have
                  const haveCount = mySquad.filter((p) => p.position === slot.position).length
                  const slotIndex = formationSlots.filter((s, si) => si <= i && s.position === slot.position).length
                  const isFilled = slotIndex <= haveCount
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2',
                        isFilled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-dashed border-border/40 bg-muted/20'
                      )}
                    >
                      <PosBadge position={slot.position} className="w-12" />
                      <span className="flex-1 text-xs">{isFilled ? 'Preenchido' : 'Vazio'}</span>
                      {isFilled ? <Check className="h-4 w-4 text-emerald-400" /> : null}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ChevronRight className="h-5 w-5 text-emerald-400" /> Últimas escolhas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[16rem] pr-2">
                <div className="space-y-1.5">
                  {[...draft.picks].reverse().slice(0, 15).map((pick, i) => {
                    const p = participants.find((pp) => pp.id === pick.participantId)
                    return (
                      <motion.div
                        key={`${pick.participantId}-${pick.playerId}-${i}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 rounded border border-border/40 bg-card/30 p-1.5"
                      >
                        <PosBadge position={pick.position} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{pick.playerName}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{p?.username}</p>
                        </div>
                        <OvrBadge ovr={pick.overall} className="scale-90" />
                      </motion.div>
                    )
                  })}
                  {draft.picks.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma escolha ainda.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
