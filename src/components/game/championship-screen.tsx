'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Goal, Square, AlertTriangle, Activity, Timer, Play, Table2, ListChecks, Loader2, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { OvrBadge } from './badges'
import type { MatchEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChampionshipScreen({ emit }: { emit: (e: string, d?: any) => void }) {
  const user = useUserStore((s) => s.user)!
  const game = useGameStore()
  const championship = game.championship
  const matchTimer = game.matchTimer
  const currentMatch = game.currentMatch
  const events = game.matchEvents
  const standings = game.standings
  const draft = game.draft

  const isHost = game.hostId === user.id

  const startChampionship = () => {
    emit('championship:start')
  }

  // Ready-to-start state (after draft, before championship)
  if (game.status === 'draft' && draft?.status === 'done' && !championship) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="overflow-hidden">
          <div className="pitch-bg bg-emerald-500/5 p-8 text-center">
            <Trophy className="mx-auto mb-4 h-16 w-16 text-amber-400" />
            <h1 className="text-3xl font-black">Draft concluído!</h1>
            <p className="mt-2 text-muted-foreground">Todos os times estão montados. Pronto para iniciar o campeonato.</p>
          </div>
          <CardContent className="p-6">
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {game.squads.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3">
                  <div>
                    <p className="font-semibold">{s.teamName || s.username}</p>
                    <p className="text-xs text-muted-foreground">{s.formation} · {s.squad.length} jogadores</p>
                  </div>
                  <OvrBadge ovr={s.teamOvr} className="text-base px-2 py-1" />
                </div>
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

  // Finished
  if (championship?.finished || game.champion) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-2xl shadow-amber-500/30">
            <Crown className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-black">🏆 {game.champion?.name} é o CAMPEÃO!</h1>
          <p className="mt-1 text-muted-foreground">{game.champion?.points} pontos</p>
        </motion.div>
        <StandingsTable standings={standings} />
      </div>
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

  const secondsLeft = matchTimer?.secondsLeft ?? 0
  const simMinute = matchTimer?.simMinute ?? 0
  const totalRounds = championship.schedule.length

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Campeonato</h1>
          <p className="text-sm text-muted-foreground">
            Rodada {championship.currentRound + 1}/{totalRounds} · Partida {championship.currentMatchIndex + 1}/{championship.schedule[championship.currentRound]?.length || 0}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" /> AO VIVO
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Current match */}
          <Card className="overflow-hidden">
            <div className="pitch-bg bg-gradient-to-b from-emerald-500/10 to-transparent p-6">
              <div className="grid grid-cols-3 items-center gap-4">
                {/* Home */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <TeamBlock name={currentMatch?.homeName || '—'} ovr={currentMatch?.homeOvr || 0} />
                  <p className="font-bold leading-tight">{currentMatch?.homeName}</p>
                </div>
                {/* Score + timer */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3 text-5xl font-black tabular-nums">
                    <motion.span key={`h-${currentMatch?.homeScore}`} initial={{ scale: 1.5, color: '#10b981' }} animate={{ scale: 1, color: '#fff' }} className="text-glow">
                      {currentMatch?.homeScore ?? 0}
                    </motion.span>
                    <span className="text-muted-foreground">x</span>
                    <motion.span key={`a-${currentMatch?.awayScore}`} initial={{ scale: 1.5, color: '#10b981' }} animate={{ scale: 1, color: '#fff' }} className="text-glow">
                      {currentMatch?.awayScore ?? 0}
                    </motion.span>
                  </div>
                  <div className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums', secondsLeft <= 5 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300')}>
                    <Timer className="h-4 w-4" />
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                  </div>
                  <Badge variant="outline" className="text-xs">{simMinute}'</Badge>
                </div>
                {/* Away */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <TeamBlock name={currentMatch?.awayName || '—'} ovr={currentMatch?.awayOvr || 0} />
                  <p className="font-bold leading-tight">{currentMatch?.awayName}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Events feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5 text-emerald-400" /> Eventos da partida
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[22rem] pr-2">
                {events.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">A partida começou. Aguarde os eventos...</p>
                ) : (
                  <div className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {[...events].reverse().map((e, i) => (
                        <motion.div
                          key={`${e.minute}-${e.type}-${i}`}
                          initial={{ opacity: 0, x: -20, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
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
                    </AnimatePresence>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Standings */}
        <div className="space-y-4">
          <StandingsTable standings={standings} compact />

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
    <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-lg font-black text-white shadow-lg">
      {initials}
    </div>
  )
}

function EventIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5 shrink-0'
  if (type === 'goal') return <Goal className={cn(cls, 'text-emerald-400')} />
  if (type === 'yellow') return <Square className={cn(cls, 'fill-amber-400 text-amber-400')} />
  if (type === 'red') return <Square className={cn(cls, 'fill-rose-500 text-rose-500')} />
  if (type === 'injury') return <AlertTriangle className={cn(cls, 'text-orange-400')} />
  if (type === 'sub') return <Activity className={cn(cls, 'text-sky-400')} />
  if (type === 'save') return <Activity className={cn(cls, 'text-violet-400')} />
  return <Activity className={cn(cls, 'text-muted-foreground')} />
}

function eventLabel(e: MatchEvent): string {
  switch (e.type) {
    case 'goal': return `GOL! ${e.player}${e.detail ? ` (assist: ${e.detail})` : ''}`
    case 'yellow': return `Cartão amarelo: ${e.player}`
    case 'red': return `Cartão vermelho: ${e.player}`
    case 'injury': return `Lesão: ${e.player}`
    case 'sub': return `Substituição: ${e.player}`
    case 'chance': return `Chance perdida: ${e.player}`
    case 'save': return `Defesa: ${e.player}`
    default: return e.player
  }
}

function StandingsTable({ standings, compact }: { standings: any[]; compact?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-amber-400" /> Classificação
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
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      'border-b border-border/30',
                      i === 0 && 'bg-amber-500/10',
                      i < 4 && i > 0 && 'bg-emerald-500/5'
                    )}
                  >
                    <td className="py-1.5 pl-1 font-bold tabular-nums">{i + 1}</td>
                    <td className="py-1.5 font-medium truncate max-w-[120px]">{s.name}</td>
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
        )}
      </CardContent>
    </Card>
  )
}
