'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Medal, Globe, Crown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store/user-store'
import { cn } from '@/lib/utils'

interface RankRow {
  rank: number
  id: string
  username: string
  country: string
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  championships: number
  points: number
  matchesPlayed: number
}

export function RankingScreen() {
  const user = useUserStore((s) => s.user)!
  const [scope, setScope] = useState('global')
  const [rows, setRows] = useState<RankRow[]>([])

  useEffect(() => {
    const params = new URLSearchParams({ limit: '100' })
    if (scope === 'brazil') params.set('country', 'Brasil')
    fetch(`/api/ranking?${params}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rankings || []))
      .catch(() => setRows([]))
  }, [scope])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Ranking Mundial</h1>
          <p className="text-muted-foreground">Os melhores treinadores da comunidade.</p>
        </div>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-48">
            <Globe className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Mundial</SelectItem>
            <SelectItem value="brazil">Brasil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-amber-400" /> Top {rows.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[32rem] pr-2">
            <div className="space-y-1.5">
              {rows.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum jogador ranqueado ainda. Dispute um campeonato!</p>
              )}
              {rows.map((r) => {
                const isMe = r.username === user.username
                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3',
                      r.rank <= 3 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50 bg-card/30',
                      isMe && 'ring-2 ring-emerald-500/50'
                    )}
                  >
                    <div className={cn(
                      'grid h-9 w-9 place-items-center rounded-full font-black',
                      r.rank === 1 ? 'bg-amber-400 text-black' :
                      r.rank === 2 ? 'bg-zinc-300 text-black' :
                      r.rank === 3 ? 'bg-orange-400 text-black' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {r.rank <= 3 ? <Medal className="h-4 w-4" /> : r.rank}
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{r.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {r.username}
                        {isMe && <Badge variant="secondary" className="text-[9px]">Você</Badge>}
                        {r.championships > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-400">
                            <Crown className="h-3 w-3" /> {r.championships}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.country} · {r.matchesPlayed} partidas</p>
                    </div>
                    <div className="flex items-center gap-4 text-center text-xs">
                      <div>
                        <p className="font-bold text-emerald-400">{r.wins}</p>
                        <p className="text-muted-foreground">V</p>
                      </div>
                      <div>
                        <p className="font-bold">{r.draws}</p>
                        <p className="text-muted-foreground">E</p>
                      </div>
                      <div>
                        <p className="font-bold text-rose-400">{r.losses}</p>
                        <p className="text-muted-foreground">D</p>
                      </div>
                      <div className="w-16">
                        <p className="text-lg font-black text-emerald-400">{r.points}</p>
                        <p className="text-muted-foreground">pts</p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
