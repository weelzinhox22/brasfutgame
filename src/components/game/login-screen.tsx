'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Users, Bot, Zap, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { toast } from 'sonner'

const COUNTRIES = ['Brasil', 'Argentina', 'Uruguai', 'Chile', 'Colômbia', 'Portugal', 'Espanha', 'Itália', 'Alemanha', 'Inglaterra', 'França', 'Holanda']

export function LoginScreen() {
  const setUser = useUserStore((s) => s.setUser)
  const setView = useGameStore((s) => s.setView)
  const [username, setUsername] = useState('')
  const [country, setCountry] = useState('Brasil')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (username.trim().length < 2) {
      toast.error('Digite um nome com pelo menos 2 caracteres.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, country }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      setUser(data)
      setView('lobby')
      toast.success(`Bem-vindo, ${data.username}!`)
    } catch (e: any) {
      toast.error(e.message || 'Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col items-center justify-center px-4 py-10">
      {/* pitch background */}
      <div className="pointer-events-none absolute inset-0 -z-10 pitch-bg opacity-30" />

      <div className="grid w-full gap-8 lg:grid-cols-2 lg:items-center">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Zap className="h-3.5 w-3.5" /> Multiplayer em tempo real
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Monte times com
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent text-glow">
              lendas históricas
            </span>
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Crie salas privadas, dispute o draft com amigos e bots, e simule campeonatos com mais de 549 times e 9.900 jogadores de todas as épocas.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Feature icon={Users} title="12 jogadores" desc="por sala" />
            <Feature icon={Bot} title="4 modos" desc="de IA" />
            <Feature icon={Trophy} title="9.900+" desc="lendas históricas" />
          </div>
        </motion.div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          <div className="mb-6 space-y-1">
            <h2 className="text-2xl font-bold">Entrar no jogo</h2>
            <p className="text-sm text-muted-foreground">Escolha seu nome e país para começar.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Nome de usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Ex: Pelé1970"
                maxLength={24}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>País</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleLogin}
              disabled={loading || username.trim().length < 2}
              className="h-11 w-full text-base font-semibold"
              size="lg"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Entrar
              {!loading && <ChevronRight className="ml-1 h-5 w-5" />}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Sem cadastro. Seu nome é salvo apenas neste navegador.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-3 text-center">
      <Icon className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
      <p className="text-sm font-bold leading-tight">{title}</p>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </div>
  )
}
