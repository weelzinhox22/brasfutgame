'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Trophy, Goal, Square, AlertTriangle, Activity, Timer, Play, Table2, ListChecks, Loader2, Crown, Medal, ChevronDown, ChevronUp, Star, Flag, LogOut, RotateCcw, ArrowRight, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { OvrBadge } from './badges'
import { Confetti } from './confetti'
import type { MatchEvent } from '@/lib/types'
import { cn } from '@/lib/utils'


export function ChampionshipScreen({ emit }: { emit: (e: string, d?: any) => void }) {
  const user = useUserStore((s) => s.user)!
  const game = useGameStore()
  const router = useRouter()
  const championship = game.championship
  const matchTimer = game.matchTimer
  const currentMatch = game.currentMatch
  const events = game.matchEvents
  const standings = game.standings
  const draft = game.draft

  const myParticipant = game.participants.find((p) => p.userId === user.id)
  const isHost = myParticipant?.isHost || false
  const [showFullTable, setShowFullTable] = useState(false)
  const [showStandingsModal, setShowStandingsModal] = useState(false)
  const [prevStandings, setPrevStandings] = useState<typeof standings>([])
  const [lastRoundIndex, setLastRoundIndex] = useState(-1)

  // Compute movements by comparing current standings to previous snapshot.
  // We update the snapshot in a transition right after rendering.
  const standingsKey = standings.map((s) => `${s.id}:${s.points}`).join('|')
  const prevKey = prevStandings.map((s) => `${s.id}:${s.points}`).join('|')
  const movements: Record<string, 'up' | 'down' | 'same'> = {}
  if (standingsKey !== prevKey && prevStandings.length > 0) {
    const prevPositions = new Map<string, number>()
    prevStandings.forEach((s, i) => prevPositions.set(s.id, i))
    standings.forEach((s, i) => {
      const prevPos = prevPositions.get(s.id)
      if (prevPos === undefined) movements[s.id] = 'same'
      else if (i < prevPos) movements[s.id] = 'up'
      else if (i > prevPos) movements[s.id] = 'down'
      else movements[s.id] = 'same'
    })
    // Schedule snapshot update (deferred so the animation shows on this render)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setPrevStandings(standings), 300)
    }
  } else {
    standings.forEach((s) => { movements[s.id] = 'same' })
  }

  // Show standings modal when round completes
  useEffect(() => {
    if (championship && championship.currentRound > lastRoundIndex && lastRoundIndex >= 0) {
      setShowStandingsModal(true)
    }
    if (championship) {
      setLastRoundIndex(championship.currentRound)
    }
  }, [championship?.currentRound, lastRoundIndex])

  const startChampionship = () => {
    emit('championship:start')
  }

  const startNextMatch = () => {
    emit('championship:start-next-match')
  }

  const advanceToNextRound = () => {
    emit('championship:advance-round')
  }

  const handleOpenStandingsModal = () => {
    setShowStandingsModal(true)
    // Request standings refresh
    emit('championship:request-standings')
  }

  // Ready-to-start state (after draft, before championship)
  if (game.status === 'draft' && draft?.status === 'done' && !championship) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pitch-bg bg-emerald-500/5 p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-2xl shadow-amber-500/40"
            >
              <Trophy className="h-10 w-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-black">Draft concluído!</h1>
            <p className="mt-2 text-muted-foreground">Todos os times estão montados. Pronto para iniciar o campeonato.</p>
          </motion.div>
          <CardContent className="p-6">
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {game.squads.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3"
                >
                  <div>
                    <p className="font-semibold">{s.teamName || s.username}</p>
                    <p className="text-xs text-muted-foreground">{s.formation} · {s.squad.length} jogadores</p>
                  </div>
                  <OvrBadge ovr={s.teamOvr} className="text-base px-2 py-1" />
                </motion.div>
              ))}
            </div>
            {isHost ? (
              <Button size="lg" className="w-full text-lg font-bold" onClick={startChampionship}>
                <Play className="mr-2 h-5 w-5" /> Iniciar Campeonato
              </Button>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Aguarde o host iniciar o campeonato...</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Finished — elaborate champion screen
  if (championship?.finished || game.champion) {
    return (
      <ChampionScreen
        champion={game.champion}
        standings={standings}
        topScorers={championship?.topScorers || []}
        isHost={isHost}
        onRestart={() => emit('room:restart')}
        onLeave={() => {
          emit('room:leave')
          game.reset()
          game.setView('lobby')
          router.push('/')
        }}
      />
    )
  }

  if (!championship) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando campeonato...</p>
        </div>
      </div>
    )
  }

  // Waiting for host to start next match (manual control mode)
  if (!matchTimer && !currentMatch && game.settings.manualMatchControl && championship.currentMatchIndex < (championship.schedule[championship.currentRound]?.length || 0)) {
    const nextMatch = championship.schedule[championship.currentRound]?.[championship.currentMatchIndex]
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="overflow-hidden">
          <div className="pitch-bg bg-sky-500/5 p-8 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-sky-400" />
            <h1 className="mt-4 text-2xl font-black">Aguardando Host</h1>
            <p className="mt-2 text-muted-foreground">
              {nextMatch ? `Próxima partida: ${nextMatch.homeName} vs ${nextMatch.awayName}` : 'Aguardando próxima partida...'}
            </p>
            {isHost && (
              <Button size="lg" className="mt-6 font-bold bg-sky-500 hover:bg-sky-600" onClick={startNextMatch}>
                <Play className="mr-2 h-5 w-5" /> Iniciar Partida
              </Button>
            )}
          </div>
        </Card>
      </div>
    )
  }

  const secondsLeft = matchTimer?.secondsLeft ?? 0
  const simMinute = matchTimer?.simMinute ?? 0
  const totalRounds = championship.schedule.length
  const currentRoundMatches = championship.schedule[championship.currentRound] || []
  const allMatchesPlayed = championship.currentMatchIndex >= currentRoundMatches.length
  const isLastRound = championship.currentRound >= totalRounds - 1

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Campeonato</h1>
          <p className="text-sm text-muted-foreground">
            Rodada {championship.currentRound + 1}/{totalRounds} · Partida {championship.currentMatchIndex + 1}/{currentRoundMatches.length || 0}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showStandingsModal} onOpenChange={(open) => {
            if (open) handleOpenStandingsModal()
            else setShowStandingsModal(false)
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Table2 className="h-4 w-4" /> Ver Tabela
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Classificação</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-[60vh] pr-4">
                {standings.length > 0 ? (
                  <StandingsTable
                    standings={standings}
                    movements={movements}
                    expanded={true}
                    onToggle={() => {}}
                    currentMatch={currentMatch}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full py-12">
                    <p className="text-muted-foreground">Carregando classificação...</p>
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" /> AO VIVO
          </Badge>
        </div>
      </div>

      {/* Host controls for manual match control */}
      {isHost && game.settings.manualMatchControl && (
        <Card className="mb-4 border-sky-500/30 bg-sky-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-300">Controle Manual de Partidas</p>
                <p className="text-xs text-muted-foreground">
                  {allMatchesPlayed && !isLastRound
                    ? 'Todas as partidas desta rodada foram jogadas'
                    : matchTimer
                    ? 'Partida em andamento...'
                    : championship.waitingForHost || (!currentMatch && !matchTimer)
                    ? 'Aguardando início da próxima partida'
                    : 'Aguardando início da próxima partida'}
                </p>
              </div>
              <div className="flex gap-2">
                {(!matchTimer && championship.waitingForHost) && (
                  <Button size="sm" onClick={startNextMatch} className="bg-sky-500 hover:bg-sky-600">
                    <Play className="mr-1 h-4 w-4" /> Iniciar Próxima Partida
                  </Button>
                )}
                {allMatchesPlayed && !isLastRound && (
                  <Button size="sm" onClick={advanceToNextRound} variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                    <ArrowRight className="mr-1 h-4 w-4" /> Avançar para Rodada {championship.currentRound + 2}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Current match */}
          <Card className="overflow-hidden">
            <div className="pitch-bg bg-gradient-to-b from-emerald-500/10 to-transparent p-6 pb-4">
              <div className="grid grid-cols-3 items-center gap-4">
                {/* Home */}
                <motion.div
                  key={`home-${currentMatch?.homeName}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <TeamBlock name={currentMatch?.homeName || '—'} ovr={currentMatch?.homeOvr || 0} />
                  <p className="font-bold leading-tight">{currentMatch?.homeName}</p>
                </motion.div>
                {/* Score + timer */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3 text-5xl font-black tabular-nums">
                    <motion.span
                      key={`h-${currentMatch?.homeScore}`}
                      initial={{ scale: 1.6, color: '#10b981', rotate: -10 }}
                      animate={{ scale: 1, color: '#fff', rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                      className="text-glow"
                    >
                      {currentMatch?.homeScore ?? 0}
                    </motion.span>
                    <span className="text-muted-foreground">x</span>
                    <motion.span
                      key={`a-${currentMatch?.awayScore}`}
                      initial={{ scale: 1.6, color: '#10b981', rotate: 10 }}
                      animate={{ scale: 1, color: '#fff', rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                      className="text-glow"
                    >
                      {currentMatch?.awayScore ?? 0}
                    </motion.span>
                  </div>
                  <motion.div
                    animate={secondsLeft <= 5 ? { scale: [1, 1.1, 1] } : {}}
                    transition={secondsLeft <= 5 ? { repeat: Infinity, duration: 0.6 } : {}}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums',
                      secondsLeft <= 5 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                    )}
                  >
                    <Timer className="h-4 w-4" />
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                  </motion.div>
                  <Badge variant="outline" className="text-xs">{simMinute}'</Badge>
                </div>
                {/* Away */}
                <motion.div
                  key={`away-${currentMatch?.awayName}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <TeamBlock name={currentMatch?.awayName || '—'} ovr={currentMatch?.awayOvr || 0} />
                  <p className="font-bold leading-tight">{currentMatch?.awayName}</p>
                </motion.div>
              </div>
              {/* Show "Ver Tabela" button when match ends */}
              {!matchTimer && currentMatch && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => setShowStandingsModal(true)} className="gap-2">
                    <Table2 className="h-4 w-4" /> Ver Tabela
                  </Button>
                </div>
              )}
            </div>

          </Card>            {/* Events feed — full width since pitch was removed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5 text-emerald-400" /> Eventos da partida
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[20rem] pr-2" scrollHideDelay={0}>
                {events.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">A partida começou. Aguarde os eventos...</p>
                ) : (
                  <div className="space-y-1.5">
                    {events.filter(isImportantEvent).map((e, i) => (
                      <motion.div
                        key={`evt-${i}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-2.5',
                          e.type === 'goal' ? 'border-emerald-500/50 bg-emerald-500/10' :
                          e.type === 'red' ? 'border-rose-500/50 bg-rose-500/10' :
                          e.type === 'yellow' ? 'border-amber-500/50 bg-amber-500/10' :
                          'border-border/50 bg-card/30'
                        )}
                      >
                        <Badge variant="outline" className="font-mono tabular-nums">{e.minute}'</Badge>
                        <EventIcon type={e.type} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            <span className={cn(e.team === 'home' ? 'text-emerald-300' : 'text-sky-300')}>
                              {e.team === 'home' ? currentMatch?.homeName : currentMatch?.awayName}
                            </span>
                            {' — '}
                            {eventLabel(e)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Standings + schedule */}
        <div className="space-y-4">
          <StandingsTable
            standings={standings}
            movements={movements}
            expanded={showFullTable}
            onToggle={() => setShowFullTable((v) => !v)}
            currentMatch={currentMatch}
          />

          {/* Artilharia (Top Scorers) */}
          {championship.topScorers && championship.topScorers.length > 0 && (
            <Card>
              <CardHeader className="pb-2.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="h-5 w-5 text-amber-400" /> Artilharia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[14rem] pr-2">
                  <div className="space-y-2">
                    {championship.topScorers.slice(0, 10).map((ts: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between border-b border-border/30 pb-1.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-muted-foreground w-4">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-xs">{ts.player}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{ts.team}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="font-black text-xs gap-1.5 shrink-0 px-2 py-0.5">
                          ⚽ {ts.goals} {ts.goals === 1 ? 'gol' : 'gols'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Round schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Table2 className="h-5 w-5 text-emerald-400" /> Próximas partidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[16rem] pr-2">
                <div className="space-y-1.5">
                  {championship.schedule.slice(championship.currentRound, championship.currentRound + 2).map((round, ri) => (
                    <div key={ri} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">Rodada {championship.currentRound + ri + 1}</p>
                      {round.map((m, mi) => (
                        <div key={mi} className="flex items-center justify-between rounded border border-border/40 bg-card/30 px-2 py-1.5 text-xs">
                          <span className="truncate">{m.homeName}</span>
                          <span className="text-muted-foreground">x</span>
                          <span className="truncate text-right">{m.awayName}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function TeamBlock({ name, ovr }: { name: string; ovr: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-lg font-black text-white shadow-lg"
    >
      {initials}
    </motion.div>
  )
}

/** Filtra apenas eventos importantes, removendo dribles, passes curtos, desarmes etc */
function isImportantEvent(e: MatchEvent): boolean {
  const noisyTypes = new Set([
    'dribble',
    'pass',
    'tackle',
    'interception',
    'clearance',
    'throw_in',
    'long_pass',
  ])
  // Mostrar todos os eventos exceto os muito frequentes
  return !noisyTypes.has(e.type)
}

function EventIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5 shrink-0'
  if (type === 'goal') return <Goal className={cn(cls, 'text-emerald-400')} />
  if (type === 'yellow') return <Square className={cn(cls, 'fill-amber-400 text-amber-400')} />
  if (type === 'red') return <Square className={cn(cls, 'fill-rose-500 text-rose-500')} />
  if (type === 'injury') return <AlertTriangle className={cn(cls, 'text-orange-400')} />
  if (type === 'sub') return <Activity className={cn(cls, 'text-sky-400')} />
  if (type === 'save') return <Activity className={cn(cls, 'text-violet-400')} />
  if (type === 'corner') return <Flag className={cn(cls, 'text-yellow-300')} />
  if (type === 'shot' || type === 'header') return <Goal className={cn(cls, 'text-orange-400')} />
  if (type === 'pass' || type === 'long_pass' || type === 'through_ball') return <ArrowRight className={cn(cls, 'text-emerald-400')} />
  if (type === 'cross') return <Flag className={cn(cls, 'text-emerald-400')} />
  if (type === 'dribble') return <Activity className={cn(cls, 'text-blue-400')} />
  if (type === 'tackle' || type === 'interception') return <AlertTriangle className={cn(cls, 'text-cyan-400')} />
  if (type === 'foul') return <AlertTriangle className={cn(cls, 'text-rose-400')} />
  if (type === 'offside') return <Flag className={cn(cls, 'text-amber-400')} />
  if (type === 'free_kick' || type === 'goal_kick') return <Circle className={cn(cls, 'text-white')} />
  if (type === 'kickoff' || type === 'half_start' || type === 'half_end' || type === 'match_end') return <Activity className={cn(cls, 'text-muted-foreground')} />
  if (type === 'clearance') return <AlertTriangle className={cn(cls, 'text-lime-400')} />
  return <Activity className={cn(cls, 'text-muted-foreground')} />
}

function eventLabel(e: MatchEvent): string {
  switch (e.type) {
    case 'goal': return `⚽ GOL! ${e.player}${e.detail ? ` (${e.detail})` : ''}`
    case 'yellow': return `Cartão amarelo: ${e.player}`
    case 'red': return `Cartão vermelho: ${e.player}`
    case 'injury': return `Lesão: ${e.player}`
    case 'sub': return `Substituição: ${e.player}`
    case 'chance': return `Chance perdida: ${e.player}`
    case 'save': return `Defesa: ${e.player}`
    case 'corner': return `Escanteio cobrado por ${e.player}`
    case 'shot': return `Finalização de ${e.player}`
    case 'header': return `Cabeceio de ${e.player}`
    case 'pass': case 'long_pass': {
      const parts = e.detail?.split(' → ') || [e.player, '']
      return `${parts[0]} → ${parts[1] || '...'}`
    }
    case 'through_ball': return `Enfiada de ${e.player}`
    case 'cross': return `Cruzamento de ${e.player}`
    case 'dribble': return `${e.player} avança driblando`
    case 'tackle': return `Desarme: ${e.player}`
    case 'interception': return `Interceptação: ${e.player}`
    case 'foul': return `Falta: ${e.player}${e.detail ? ` (${e.detail})` : ''}`
    case 'offside': return `🚩 Impedimento! ${e.player}`
    case 'free_kick': return `Tiro livre: ${e.player}`
    case 'goal_kick': return `Tiro de meta`
    case 'clearance': return `Afastamento: ${e.player}`
    case 'throw_in': return `Arremesso lateral`
    case 'kickoff': case 'half_start': return `${e.detail || 'Início de partida'}`
    case 'half_end': return `⏰ Fim do primeiro tempo`
    case 'match_end': return `🏁 Fim de partida`
    default: return e.detail || e.player
  }
}

// ============================================================
// Standings table with movement indicators + expand toggle
// ============================================================
function StandingsTable({
  standings,
  movements,
  expanded,
  onToggle,
  currentMatch,
}: {
  standings: any[]
  movements?: Record<string, 'up' | 'down' | 'same'>
  expanded?: boolean
  onToggle?: () => void
  currentMatch?: { homeName: string; awayName: string } | null
}) {
  // When collapsed, show top 5; when expanded show all
  const displayCount = expanded ? standings.length : Math.min(5, standings.length)
  const visible = standings.slice(0, displayCount)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" /> Classificação
          </span>
          {standings.length > 5 && onToggle && (
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 text-xs">
              {expanded ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver tudo ({standings.length})</>}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {standings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aguardando primeira partida...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pl-1 text-left font-medium">#</th>
                  <th className="py-1.5 text-left font-medium">Time</th>
                  <th className="py-1.5 text-center font-medium">J</th>
                  <th className="py-1.5 text-center font-medium">V</th>
                  <th className="py-1.5 text-center font-medium">E</th>
                  <th className="py-1.5 text-center font-medium">D</th>
                  <th className="py-1.5 text-center font-medium">SG</th>
                  <th className="py-1.5 pr-1 text-center font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s, i) => {
                  const move = movements?.[s.id] || 'same'
                  const isPlaying = currentMatch && (currentMatch.homeName === s.name || currentMatch.awayName === s.name)
                  return (
                    <motion.tr
                      key={s.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className={cn(
                        'border-b border-border/30',
                        i === 0 && 'bg-amber-500/10',
                        i === 1 && 'bg-zinc-400/10',
                        i === 2 && 'bg-orange-700/10',
                        i >= 3 && i < 4 && 'bg-emerald-500/5',
                        isPlaying && 'ring-1 ring-emerald-500/40'
                      )}
                    >
                      <td className="py-1.5 pl-1">
                        <div className="flex items-center gap-1">
                          <span className="font-bold tabular-nums">{i + 1}</span>
                          {move === 'up' && <motion.span initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}><ChevronUp className="h-3 w-3 text-emerald-400" /></motion.span>}
                          {move === 'down' && <motion.span initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}><ChevronDown className="h-3 w-3 text-rose-400" /></motion.span>}
                          {move === 'same' && <span className="w-3" />}
                        </div>
                      </td>
                      <td className="py-1.5 font-medium truncate max-w-[110px]">
                        {s.name}
                        {isPlaying && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      </td>
                      <td className="py-1.5 text-center tabular-nums">{s.played}</td>
                      <td className="py-1.5 text-center tabular-nums text-emerald-400">{s.won}</td>
                      <td className="py-1.5 text-center tabular-nums">{s.drawn}</td>
                      <td className="py-1.5 text-center tabular-nums text-rose-400">{s.lost}</td>
                      <td className="py-1.5 text-center tabular-nums">{s.goalDifference > 0 ? '+' : ''}{s.goalDifference}</td>
                      <td className="py-1.5 pr-1 text-center font-black tabular-nums">{s.points}</td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
            {!expanded && standings.length > 5 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">+ {standings.length - 5} times abaixo</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Elaborate champion screen with podium + confetti
// ============================================================
function ChampionScreen({
  champion,
  standings,
  topScorers,
  isHost,
  onRestart,
  onLeave,
}: {
  champion: { id: string; name: string; points: number } | null
  standings: any[]
  topScorers: any[]
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}) {
  const top3 = standings.slice(0, 3)
  const rest = standings.slice(3)

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-8">
      <Confetti count={120} />

      {/* Hero champion */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 18 }}
        className="mb-8 text-center"
      >
        <motion.div
          initial={{ scale: 0, rotate: -360 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.3 }}
          className="mx-auto mb-4 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-2xl shadow-amber-500/50"
        >
          <Crown className="h-14 w-14 text-white drop-shadow-lg" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Badge variant="outline" className="mb-2 border-amber-500/40 text-amber-300">CAMPEÃO</Badge>
          <h1 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-5xl font-black tracking-tight text-transparent text-glow">
            {champion?.name || '—'}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            <Star className="mr-1 inline h-4 w-4 text-amber-400 fill-amber-400" />
            {champion?.points} pontos
          </p>
        </motion.div>
      </motion.div>

      {/* Podium top 3 */}
      {top3.length >= 3 && (
        <div className="mb-8 flex items-end justify-center gap-2 sm:gap-4">
          {/* 2nd place */}
          <PodiumCard standing={top3[1]} place={2} height="h-28" delay={0.7} />
          {/* 1st place (tallest) */}
          <PodiumCard standing={top3[0]} place={1} height="h-40" delay={0.6} />
          {/* 3rd place */}
          <PodiumCard standing={top3[2]} place={3} height="h-20" delay={0.8} />
        </div>
      )}

      {/* Full standings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Table2 className="h-5 w-5 text-emerald-400" /> Classificação final
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pl-1 text-left font-medium">#</th>
                  <th className="py-1.5 text-left font-medium">Time</th>
                  <th className="py-1.5 text-center font-medium">J</th>
                  <th className="py-1.5 text-center font-medium">V</th>
                  <th className="py-1.5 text-center font-medium">E</th>
                  <th className="py-1.5 text-center font-medium">D</th>
                  <th className="py-1.5 text-center font-medium">GP</th>
                  <th className="py-1.5 text-center font-medium">GC</th>
                  <th className="py-1.5 text-center font-medium">SG</th>
                  <th className="py-1.5 pr-1 text-center font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.9 + i * 0.04 }}
                    className={cn(
                      'border-b border-border/30',
                      i === 0 && 'bg-amber-500/15',
                      i === 1 && 'bg-zinc-400/10',
                      i === 2 && 'bg-orange-700/10'
                    )}
                  >
                    <td className="py-1.5 pl-1 font-bold tabular-nums">
                      {i < 3 ? <Medal className={cn('inline h-3.5 w-3.5', i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-300' : 'text-orange-600')} /> : null}
                      <span className="ml-1">{i + 1}</span>
                    </td>
                    <td className="py-1.5 font-medium truncate max-w-[140px]">{s.name}</td>
                    <td className="py-1.5 text-center tabular-nums">{s.played}</td>
                    <td className="py-1.5 text-center tabular-nums text-emerald-400">{s.won}</td>
                    <td className="py-1.5 text-center tabular-nums">{s.drawn}</td>
                    <td className="py-1.5 text-center tabular-nums text-rose-400">{s.lost}</td>
                    <td className="py-1.5 text-center tabular-nums">{s.goalsFor}</td>
                    <td className="py-1.5 text-center tabular-nums">{s.goalsAgainst}</td>
                    <td className="py-1.5 text-center tabular-nums">{s.goalDifference > 0 ? '+' : ''}{s.goalDifference}</td>
                    <td className="py-1.5 pr-1 text-center font-black tabular-nums">{s.points}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
        {isHost ? (
          <Button size="lg" className="w-full sm:w-auto font-bold bg-amber-500 hover:bg-amber-600 text-stone-950" onClick={onRestart}>
            <RotateCcw className="mr-2 h-5 w-5" /> Jogar Novamente
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground animate-pulse">Aguardando o host iniciar uma nova partida...</p>
        )}
        <Button size="lg" variant="outline" className="w-full sm:w-auto font-bold border-rose-500/30 text-rose-400 hover:bg-rose-500/10" onClick={onLeave}>
          <LogOut className="mr-2 h-5 w-5" /> Sair da Sala
        </Button>
      </div>
    </div>
  )
}

/** Auto-scrolls the events feed to the bottom when new events arrive */
function ScrollAnchor() {
  const ref = useRef<HTMLDivElement>(null)
  const events = useGameStore((s) => s.matchEvents)
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [events.length])
  return <div ref={ref} />
}

function PodiumCard({ standing, place, height, delay }: { standing: any; place: number; height: string; delay: number }) {
  const colors = {
    1: 'from-amber-300 to-amber-600',
    2: 'from-zinc-300 to-zinc-500',
    3: 'from-orange-500 to-orange-800',
  }
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 16, delay }}
      className="flex flex-col items-center"
    >
      <div className="mb-2 text-center">
        <p className="text-2xl">{medal[place as 1 | 2 | 3]}</p>
        <p className="max-w-[100px] truncate text-sm font-bold">{standing.name}</p>
        <p className="text-xs text-muted-foreground">{standing.points} pts</p>
      </div>
      <motion.div
        whileHover={{ scale: 1.05 }}
        className={cn('w-20 rounded-t-lg bg-gradient-to-b shadow-lg', height, colors[place as 1 | 2 | 3])}
      />
      <div className={cn('w-24 rounded-b bg-gradient-to-b py-1 text-center text-2xl font-black text-white', colors[place as 1 | 2 | 3])}>
        {place}
      </div>
    </motion.div>
  )
}
