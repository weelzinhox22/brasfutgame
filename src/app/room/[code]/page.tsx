'use client'

import { useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { useSocket } from '@/lib/socket-context'
import { Header } from '@/components/game/header'
import { Footer } from '@/components/game/footer'
import { RoomScreen } from '@/components/game/room-screen'
import { DraftScreen } from '@/components/game/draft-screen'
import { ChampionshipScreen } from '@/components/game/championship-screen'
import { Loader2 } from 'lucide-react'

export default function RoomPage() {
  const params = useParams()
  const code = ((params.code as string) || '').toUpperCase()
  const user = useUserStore((s) => s.user)
  const view = useGameStore((s) => s.view)
  const roomCode = useGameStore((s) => s.roomCode)
  const { connected, emit } = useSocket()
  const router = useRouter()
  const joinedRef = useRef(false)

  // Auto-join the room if not already in it
  useEffect(() => {
    if (!user) {
      router.replace('/')
      return
    }

    // If we already have this room loaded, just set the view
    if (roomCode === code && (view === 'room' || view === 'draft' || view === 'championship')) {
      joinedRef.current = true
      return
    }

    // If we're in a different room, or no room loaded yet, join this room
    if (!joinedRef.current && connected && code) {
      joinedRef.current = true
      // Reset state for new room
      if (roomCode !== code) {
        useGameStore.getState().reset()
        useGameStore.getState().setView('room')
      }
      emit('room:join', { code, userId: user.id, username: user.username })
    }
  }, [user, connected, code, roomCode, view, emit, router])

  // Watch for errors or room leaving — redirect to lobby
  useEffect(() => {
    if (roomCode === null && joinedRef.current) {
      // We were in a room but left or got an error
      router.push('/')
    }
  }, [roomCode, router])

  // Redirect to lobby if no user
  if (!user) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header connected={connected} />
      <main className="flex-1">
        {!connected || (!joinedRef.current && roomCode !== code) ? (
          <div className="grid min-h-[60vh] place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-sm text-muted-foreground">Conectando à sala {code}...</p>
            </div>
          </div>
        ) : view === 'draft' ? (
          <DraftScreen emit={emit} />
        ) : view === 'championship' ? (
          <ChampionshipScreen emit={emit} />
        ) : (
          <RoomScreen emit={emit} />
        )}
      </main>
      <Footer />
    </div>
  )
}
