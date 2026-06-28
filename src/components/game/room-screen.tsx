'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Crown, Bot, UserPlus, UserMinus, Play, Settings, Users, MessageSquare, ArrowLeft, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { SIM_SPEEDS, BOT_MODES, BOT_MODE_LABELS, type RoomSettings, type BotMode } from '@/lib/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function RoomScreen({ emit }: { emit: (e: string, d?: any) => void }) {
  const user = useUserStore((s) => s.user)!
  const game = useGameStore()
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const isHost = game.hostId === user.id
  const participants = game.participants
  const humans = participants.filter((p) => !p.isBot)
  const bots = participants.filter((p) => p.isBot)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [game.chat.length])

  const sendChat = () => {
    if (!chatInput.trim()) return
    emit('chat:message', { content: chatInput.trim() })
    setChatInput('')
  }

  const updateSettings = (patch: Partial<RoomSettings>) => {
    emit('room:update-settings', { settings: patch })
  }

  const addBots = () => {
    emit('room:add-bots', { count: game.settings.botCount || 1 })
    toast.success('Adicionando bots...')
  }

  const removeBot = (id: string) => {
    emit('room:remove-bot', { participantId: id })
  }

  const startDraft = () => {
    if (participants.length < 2) {
      toast.error('É necessário pelo menos 2 participantes.')
      return
    }
    emit('room:start-draft')
  }

  const setFormation = (f: string) => {
    emit('room:set-formation', { formation: f })
  }

  const leaveRoom = () => {
    emit('room:leave')
    game.reset()
    game.setView('lobby')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* header bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={leaveRoom} title="Sair da sala">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{game.roomName || `Sala ${game.roomCode}`}</h1>
            <p className="font-mono text-sm text-emerald-400">Código: {game.roomCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Users className="h-3.5 w-3.5" /> {humans.length} humano(s) · {bots.length} bot(s)
          </Badge>
          {game.status === 'waiting' && isHost && (
            <Button size="lg" className="font-bold" onClick={startDraft}>
              <Play className="mr-1 h-5 w-5" /> Iniciar Draft
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_320px]">
        {/* Participants */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-emerald-400" /> Participantes
              <Badge variant="secondary" className="ml-auto">{participants.length}/{game.settings.maxPlayers}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ScrollArea className="h-[28rem] pr-2">
              <AnimatePresence>
                {participants.map((p, i) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className={cn(
                      'mb-2 flex items-center gap-3 rounded-lg border p-2.5 transition',
                      p.isHost ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50 bg-card/40',
                      !p.online && 'opacity-50'
                    )}
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold"
                      style={{ backgroundColor: p.isBot ? '#475569' : user.avatarColor, color: '#fff' }}>
                      {p.isBot ? <Bot className="h-4 w-4" /> : p.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {p.username}
                        {p.isHost && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                        {p.isBot && <Badge variant="outline" className="text-[9px] py-0 px-1">{BOT_MODE_LABELS[p.botMode as BotMode]}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.online ? (p.isHost ? 'Host' : 'Online') : 'Desconectado'}
                        {p.teamName && ` · ${p.teamName}`}
                      </p>
                    </div>
                    {isHost && p.isBot && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeBot(p.id)}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </ScrollArea>
            {isHost && game.status === 'waiting' && (
              <div className="space-y-2 border-t border-border/50 pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Adicionar bots</Label>
                  <span className="text-sm font-bold text-emerald-400">{game.settings.botCount}</span>
                </div>
                <Slider value={[game.settings.botCount]} min={1} max={11} step={1} onValueChange={([v]) => updateSettings({ botCount: v })} />
                <Button variant="secondary" className="w-full" size="sm" onClick={addBots}>
                  <UserPlus className="mr-1 h-4 w-4" /> Adicionar {game.settings.botCount} bot(s)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-emerald-400" /> Configurações da sala
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Times permitidos</Label>
                <Select value={game.settings.teamFilter} onValueChange={(v) => updateSettings({ teamFilter: v as any })} disabled={!isHost}>
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
                <Select value={game.settings.botMode} onValueChange={(v) => updateSettings({ botMode: v as BotMode })} disabled={!isHost}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{BOT_MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Velocidade da simulação</Label>
                <Select value={game.settings.simSpeed} onValueChange={(v) => updateSettings({ simSpeed: v as any })} disabled={!isHost}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIM_SPEEDS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label} ({s.seconds}s/partida)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Turnos (idas e voltas)</Label>
                <Select value={String(game.settings.rounds)} onValueChange={(v) => updateSettings({ rounds: parseInt(v) })} disabled={!isHost}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} turno(s)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs">Sua formação (para o draft)</Label>
              <Select value={participants.find((p) => p.userId === user.id)?.formation || '4-3-3'} onValueChange={setFormation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-5-1', '3-4-3'].map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A formação define quais posições você precisa draftar.</p>
            </div>

            {isHost && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <Shield className="h-4 w-4" /> Você é o host
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se você desconectar, o host será transferido automaticamente para o jogador humano mais antigo da sala.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground">Participantes</p>
                <p className="text-lg font-bold">{participants.length}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground">Humanos</p>
                <p className="text-lg font-bold">{humans.length}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground">Bots</p>
                <p className="text-lg font-bold">{bots.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-emerald-400" /> Chat da sala
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-2">
            <ScrollArea className="h-[24rem] pr-2">
              <div className="space-y-2">
                {game.chat.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Diga olá!</p>
                )}
                {game.chat.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm',
                      m.type === 'system' ? 'bg-amber-500/10 text-amber-200 italic' : 'bg-muted/40'
                    )}
                  >
                    <span className="font-semibold">{m.username}: </span>
                    <span>{m.content}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Mensagem..."
                maxLength={500}
              />
              <Button size="icon" onClick={sendChat} disabled={!chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
