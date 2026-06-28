'use client'

import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { useSocket } from '@/hooks/use-socket'
import { Header } from '@/components/game/header'
import { Footer } from '@/components/game/footer'
import { LoginScreen } from '@/components/game/login-screen'
import { LobbyScreen } from '@/components/game/lobby-screen'
import { RoomScreen } from '@/components/game/room-screen'
import { DraftScreen } from '@/components/game/draft-screen'
import { ChampionshipScreen } from '@/components/game/championship-screen'
import { RankingScreen } from '@/components/game/ranking-screen'

export default function Home() {
  const user = useUserStore((s) => s.user)
  const view = useGameStore((s) => s.view)
  const { connected, emit } = useSocket()

  // Derive the effective view during render (no effects needed).
  // The socket hook switches the view when the room status changes.
  const effectiveView = !user ? 'login' : view === 'login' ? 'lobby' : view

  return (
    <div className="flex min-h-screen flex-col">
      <Header connected={connected} />
      <main className="flex-1">
        {effectiveView === 'login' ? (
          <LoginScreen />
        ) : effectiveView === 'lobby' ? (
          <LobbyScreen emit={emit} />
        ) : effectiveView === 'room' ? (
          <RoomScreen emit={emit} />
        ) : effectiveView === 'draft' ? (
          <DraftScreen emit={emit} />
        ) : effectiveView === 'championship' ? (
          <ChampionshipScreen emit={emit} />
        ) : effectiveView === 'ranking' ? (
          <RankingScreen />
        ) : (
          <LobbyScreen emit={emit} />
        )}
      </main>
      <Footer />
    </div>
  )
}
