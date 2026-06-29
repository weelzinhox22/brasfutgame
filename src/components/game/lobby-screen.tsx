'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Plus, LogIn, Search, Trophy, Users, Globe, Shuffle, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { TeamCrest, OvrBadge } from './badges'
import { SIM_SPEEDS, BOT_MODES, BOT_MODE_LABELS, type RoomSettings, type BotMode } from '@/lib/types'
import { useSocket } from '@/lib/socket-context'
import { toast } from 'sonner'

interface PublicRoom {
  id: string
  code: string
  name: string
  status: string
  settings: RoomSettings
  createdAt: string
  participantCount: number
}

interface TeamRow {
  id: string
  name: string
  year: number
  country: string
  league: string
  ovr: number
  formation: string
  decade: number
  badgeColor: string
  accentColor: string
  description: string
  playerCount: number
}

export function LobbyScreen({ emit: _emit }: { emit: (e: string, d?: any) => void }) {
  const { broadcast } = useSocket()
  const user = useUserStore((s) => s.user)!
  const setView = useGameStore((s) => s.setView)
  const router = useRouter()
  const [tab, setTab] = useState('rooms')

  // create room dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [roomName, setRoomName] = useState(`Sala de ${user.username}`)
  const [password, setPassword] = useState('')
  const [settings, setSettings] = useState<RoomSettings>({
    teamFilter: 'mixed',
    botCount: 4,
    simSpeed: 'normal',
    rounds: 1,
    botMode: 'balanced',
    maxPlayers: 20,
    competitionFormat: 'custom',
    hideOvr: false,
    privatePicks: false,
    skipDraft: false,
  })
  const [creating, setCreating] = useState(false)

  // join by code
  const [joinCode, setJoinCode] = useState('')
  const [joinPass, setJoinPass] = useState('')

  // public rooms
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [roomSearch, setRoomSearch] = useState('')

  const filteredRooms = rooms.filter(
    (r) =>
      r.code.toLowerCase().includes(roomSearch.toLowerCase()) ||
      r.name.toLowerCase().includes(roomSearch.toLowerCase())
  )

  // teams
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamSearch, setTeamSearch] = useState('')
  const [teamDecade, setTeamDecade] = useState('all')

  useEffect(() => {
    refreshRooms()
    refreshTeams()
  }, [])

  const refreshRooms = async () => {
    try {
      const res = await fetch('/api/rooms')
      const data = await res.json()
      setRooms(data.rooms || [])
    } catch {}
  }

  const refreshTeams = async () => {
    try {
      const params = new URLSearchParams({ limit: '60', sort: 'ovr' })
      if (teamSearch) params.set('q', teamSearch)
      if (teamDecade !== 'all') params.set('decade', teamDecade)
      const res = await fetch(`/api/teams?${params}`)
      const data = await res.json()
      setTeams(data.teams || [])
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(refreshTeams, 300)
    return () => clearTimeout(t)
  }, [teamSearch, teamDecade])

  const handleCreate = async () => {
    console.log('[handleCreate] start', { hasUser: !!user, userId: user?.id, roomName })
    setCreating(true)
    try {
      if (!user?.id) {
        console.log('[handleCreate] no user')
        toast.error('Usuário não encontrado. Recarregue a página.')
        return
      }
      console.log('[handleCreate] fetching...')
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          userId: user.id,
          username: user.username,
          password: password || undefined,
          settings,
        }),
      })
      const data = await res.json()
      console.log('[handleCreate] response', { ok: res.ok, code: data.code, error: data.error })
      if (!res.ok) throw new Error(data.error)
      // join via socket
      setCreateOpen(false)
      console.log('[handleCreate] navigate to room')
      router.push(`/room/${data.code}`)
      toast.success(`Sala ${data.code} criada!`)
    } catch (e: any) {
      console.error('[handleCreate] error', e)
      toast.error(e.message || 'Erro ao criar sala.')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinCode = async () => {
    if (joinCode.trim().length < 6) {
      toast.error('Código deve ter 6 caracteres.')
      return
    }
    // verify room exists
    try {
      const res = await fetch(`/api/rooms/${joinCode.trim().toUpperCase()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/room/${data.code}`)
      toast.success(`Entrou na sala ${data.code}`)
    } catch (e: any) {
      toast.error(e.message || 'Sala não encontrada.')
    }
  }

  const handleJoinPublic = (room: PublicRoom) => {
    router.push(`/room/${room.code}`)
    toast.success(`Entrou na sala ${room.code}`)
  }

  const fillBots = () => {
    setSettings((s) => ({ ...s, botCount: 19 }))
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Lobby</h1>
          <p className="text-muted-foreground">Crie uma sala privada ou entre com um código.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="font-semibold">
                <Plus className="mr-1 h-5 w-5" /> Criar sala
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar sala privada</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Nome da sala</Label>
                  <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={40} />
                </div>
                <div className="space-y-2">
                  <Label>Senha (opcional)</Label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Deixe vazio para sala aberta" maxLength={20} />
                </div>
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <p className="text-sm font-semibold">Configurações</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Formato da competição</Label>
                      <Select value={settings.competitionFormat} onValueChange={(v) => setSettings((s) => ({ ...s, competitionFormat: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Personalizado</SelectItem>
                          <SelectItem value="brasileirao">Brasileirão (38 rodadas)</SelectItem>
                          <SelectItem value="ucl-2026">UCL 2026 (liga + mata-mata)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Times</Label>
                      <Select value={settings.teamFilter} onValueChange={(v) => setSettings((s) => ({ ...s, teamFilter: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mixed">Mistos</SelectItem>
                          <SelectItem value="brazilian">Brasileiros</SelectItem>
                          <SelectItem value="international">Internacionais</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Modo dos bots</Label>
                      <Select value={settings.botMode} onValueChange={(v) => setSettings((s) => ({ ...s, botMode: v as BotMode }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BOT_MODES.map((m) => (
                            <SelectItem key={m} value={m}>{BOT_MODE_LABELS[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Velocidade</Label>
                      <Select value={settings.simSpeed} onValueChange={(v) => setSettings((s) => ({ ...s, simSpeed: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SIM_SPEEDS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label} ({s.seconds}s)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {settings.competitionFormat === 'custom' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rodadas (turnos)</Label>
                        <Select value={String(settings.rounds)} onValueChange={(v) => setSettings((s) => ({ ...s, rounds: parseInt(v) }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3].map((r) => (
                              <SelectItem key={r} value={String(r)}>{r} turno(s)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Quantidade inicial de bots</Label>
                      <span className="text-sm font-bold text-emerald-400">{settings.botCount}</span>
                    </div>
                    <Slider value={[settings.botCount]} min={0} max={19} step={1} onValueChange={([v]) => setSettings((s) => ({ ...s, botCount: v }))} />
                    <Button variant="ghost" size="sm" onClick={fillBots} className="h-7 text-xs">
                      <Shuffle className="mr-1 h-3 w-3" /> Preencher (19 bots)
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
                    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/40 p-2">
                      <div>
                        <p className="text-xs font-semibold">Ocultar OVR</p>
                        <p className="text-[10px] text-muted-foreground">Mostrar só nomes nas cartas</p>
                      </div>
                      <Switch checked={settings.hideOvr} onCheckedChange={(v) => setSettings((s) => ({ ...s, hideOvr: v }))} />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/40 p-2">
                      <div>
                        <p className="text-xs font-semibold">Picks privados</p>
                        <p className="text-[10px] text-muted-foreground">Esconder cartas dos outros</p>
                      </div>
                      <Switch checked={settings.privatePicks} onCheckedChange={(v) => setSettings((s) => ({ ...s, privatePicks: v }))} />
                    </label>
                  </div>
                  <div className="border-t border-border/40 pt-3">
                    <label className="flex cursor-pointer items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Zap className="h-3.5 w-3.5 text-amber-400" />
                          Draft automático
                        </p>
                        <p className="text-[10px] text-muted-foreground">Pular draft manual — escalações aleatórias para todos</p>
                      </div>
                      <Switch checked={settings.skipDraft} onCheckedChange={(v) => setSettings((s) => ({ ...s, skipDraft: v }))} />
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar e entrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="rooms">Salas</TabsTrigger>
          <TabsTrigger value="teams">Times históricos</TabsTrigger>
          <TabsTrigger value="join">Entrar por código</TabsTrigger>
        </TabsList>

        {/* Public rooms */}
        <TabsContent value="rooms" className="mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar sala por código ou nome..."
                className="pl-9 font-medium"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground hidden sm:block">Salas abertas aguardando jogadores</p>
              <Button variant="outline" size="sm" onClick={refreshRooms}>Atualizar</Button>
            </div>
          </div>

          {filteredRooms.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhuma sala encontrada.</p>
                <p className="text-sm text-muted-foreground">
                  {rooms.length === 0 ? 'Crie uma sala privada para começar!' : 'Tente buscar com outro código ou nome.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRooms.map((r) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="transition hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{r.name}</p>
                          <p className="font-mono text-xs text-emerald-400">{r.code}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          <Users className="mr-1 h-3 w-3" /> {r.participantCount}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {r.settings.teamFilter === 'mixed' ? 'Mistos' : r.settings.teamFilter === 'brazilian' ? 'Brasileiros' : 'Internacionais'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{r.settings.rounds} turno(s)</Badge>
                        <Badge variant="outline" className="text-[10px]">{BOT_MODE_LABELS[r.settings.botMode as BotMode]}</Badge>
                      </div>
                      <Button className="mt-3 w-full" size="sm" onClick={() => handleJoinPublic(r)}>
                        <LogIn className="mr-1 h-4 w-4" /> Entrar
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Historical teams */}
        <TabsContent value="teams" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-400" /> Banco de times históricos
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} placeholder="Buscar time..." className="pl-9" />
                </div>
                <Select value={teamDecade} onValueChange={setTeamDecade}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as décadas</SelectItem>
                    {[1950, 1960, 1970, 1980, 1990, 2000, 2010].map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[28rem] pr-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {teams.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 p-3 transition hover:border-emerald-500/40">
                      <TeamCrest name={t.name} badgeColor={t.badgeColor} accentColor={t.accentColor} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t.name} <span className="text-muted-foreground">{t.year}</span></p>
                        <p className="truncate text-xs text-muted-foreground">{t.country} · {t.league} · {t.decade}s · {t.formation}</p>
                      </div>
                      <OvrBadge ovr={t.ovr} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Join by code */}
        <TabsContent value="join" className="mt-4">
          <Card className="mx-auto max-w-md">
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <Label>Código da sala</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Ex: ABC123"
                  maxLength={6}
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha (se houver)</Label>
                <Input value={joinPass} onChange={(e) => setJoinPass(e.target.value)} type="password" placeholder="Opcional" />
              </div>
              <Button className="w-full" size="lg" onClick={handleJoinCode}>
                <LogIn className="mr-2 h-5 w-5" /> Entrar na sala
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
