'use client'

import { Trophy, Wifi, WifiOff, LogOut, Home, BarChart3 } from 'lucide-react'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function Header({ connected }: { connected: boolean }) {
  const user = useUserStore((s) => s.user)
  const logout = useUserStore((s) => s.logout)
  const view = useGameStore((s) => s.view)
  const setView = useGameStore((s) => s.setView)
  const roomCode = useGameStore((s) => s.roomCode)
  const reset = useGameStore((s) => s.reset)

  const handleLogout = () => {
    logout()
    reset()
    setView('login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <button
          onClick={() => user && setView('lobby')}
          className="flex items-center gap-2 font-extrabold text-lg tracking-tight"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
            <Trophy className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">
            FHC <span className="text-emerald-400">Championship</span>
          </span>
        </button>

        {user && view !== 'login' && (
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            <Button
              variant={view === 'lobby' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('lobby')}
            >
              <Home className="mr-1 h-4 w-4" /> Lobby
            </Button>
            <Button
              variant={view === 'ranking' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('ranking')}
            >
              <BarChart3 className="mr-1 h-4 w-4" /> Ranking
            </Button>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {roomCode && (
            <Badge variant="outline" className="hidden sm:inline-flex font-mono">
              Sala: {roomCode}
            </Badge>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            )}
          >
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? 'Online' : 'Offline'}
          </span>
          {user && (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border-2" style={{ borderColor: user.avatarColor }}>
                <AvatarFallback style={{ backgroundColor: user.avatarColor }}>
                  {user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-none">{user.username}</p>
                <p className="text-xs text-muted-foreground">{user.country}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
