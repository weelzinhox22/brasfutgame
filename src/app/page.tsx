'use client'

import { useEffect } from 'react'
import { useUserStore } from '@/store/user-store'
import { useGameStore } from '@/store/game-store'
import { useSocket } from '@/lib/socket-context'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/game/header'
import { Footer } from '@/components/game/footer'
import { LoginScreen } from '@/components/game/login-screen'
import { LobbyScreen } from '@/components/game/lobby-screen'
import { RankingScreen } from '@/components/game/ranking-screen'

export default function Home() {
  const user = useUserStore((s) => s.user)
  const view = useGameStore((s) => s.view)
  const setView = useGameStore((s) => s.setView)
  const roomCode = useGameStore((s) => s.roomCode)
  const { connected, emit } = useSocket()
  const router = useRouter()

  // When the user enters a room, navigate to the room page
  useEffect(() => {
    if (roomCode && (view === 'room' || view === 'draft' || view === 'championship')) {
      router.push(`/room/${roomCode}`)
    }
  }, [roomCode, view, router])

  // On mount, if URL has a code segment, redirect to room page
  useEffect(() => {
    const path = window.location.pathname.replace(/^\//, '')
    if (path && path !== '' && !path.startsWith('room') && user) {
      const code = path.toUpperCase()
      if (code.length >= 4 && code.length <= 8) {
        router.replace(`/room/${code}`)
      }
    }
  }, [user, router])

  const effectiveView = !user ? 'login' : view === 'login' ? 'lobby' : view === 'room' || view === 'draft' || view === 'championship' ? 'lobby' : view

  return (
    <div className="flex min-h-screen flex-col">
      <Header connected={connected} />
      <main className="flex-1">
        {effectiveView === 'login' ? (
          <LoginScreen />
        ) : effectiveView === 'lobby' ? (
          <LobbyScreen emit={emit} />
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
