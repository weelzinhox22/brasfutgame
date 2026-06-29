'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@/store/game-store'
import { useUserStore } from '@/store/user-store'
import { useSocket } from './socket-context'
import { HostEngine, createEngineRoom, systemMessage } from './host-engine'
import { getSupabaseClient } from './supabase-client'
import { toast } from 'sonner'

/**
 * Hook that runs game engine logic on the host client.
 * Listens for host-only events from the Realtime channel and executes them.
 */
export function useHostEngine() {
  const user = useUserStore((s) => s.user)
  const game = useGameStore()
  const { currentChannel, emit } = useSocket()
  const engineRef = useRef<HostEngine | null>(null)
  const initializedRef = useRef(false)

  // Initialize the host engine with a broadcast function
  useEffect(() => {
    if (!currentChannel) return
    if (engineRef.current && (engineRef.current.state?.code === game.roomCode || (!game.roomCode && !engineRef.current.state))) {
      return // Already initialized for this room
    }

    const broadcastFn = (event: string, payload: any) => {
      // Use the socket's internal broadcast via the channel
      emit(event, payload)
    }

    engineRef.current = new HostEngine(broadcastFn)
    initializedRef.current = true

    return () => {
      // Cleanup match interval
      if (engineRef.current?.matchInterval) {
        clearInterval(engineRef.current.matchInterval)
        engineRef.current.matchInterval = null
      }
    }
  }, [currentChannel, game.roomCode, emit])

  // Listen for host-only events from the Realtime channel
  // The host receives these and processes them via the engine
  useEffect(() => {
    if (!currentChannel || !engineRef.current) return
    if (!user) return

    // Check if this client is the host
    const isHost = game.participants.find((p) => p.userId === user.id)?.isHost
    // We also check via broadcast events

    // No need for manual subscription — the socket context handles all events
    // and updates the game store. The host engine receives commands via the
    // broadcast channel.

  }, [currentChannel, user, game.participants])

  /**
   * Called when we detect this client is the host and need to load/restore the room.
   */
  const initializeAsHost = useCallback(async (roomCode: string, roomId: string) => {
    if (!engineRef.current) return

    const supabase = getSupabaseClient()

    // Load room from DB
    const { data: dbRoom } = await supabase
      .from('Room')
      .select('*, participants:RoomParticipant(*)')
      .eq('code', roomCode.toUpperCase())
      .single()

    if (!dbRoom) {
      toast.error('Sala não encontrada ao inicializar host.')
      return
    }

    const room = createEngineRoom(dbRoom.code, dbRoom.id, dbRoom.hostId)
    room.status = dbRoom.status
    room.settings = { ...game.settings }

    // Restore participants
    const dbParticipants = (dbRoom.participants || []).sort(
      (a: any, b: any) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    )

    for (const p of dbParticipants) {
      let squad: any[] = []
      if (p.squad) {
        const squadIds: string[] = typeof p.squad === 'string' ? JSON.parse(p.squad) : p.squad
        if (squadIds.length > 0) {
          const { data: players } = await supabase
            .from('HistoricalPlayer')
            .select('*')
            .in('id', squadIds)
          if (players) {
            squad = players.map((pl: any) => ({
              id: pl.id,
              name: pl.name,
              position: pl.position,
              overall: pl.overall,
              country: pl.country,
              club: pl.club,
              year: pl.year,
              decade: pl.decade,
              photoColor: pl.photoColor,
              stats: JSON.parse(pl.stats || '{}'),
              teamId: pl.teamId,
            }))
          }
        }
      }

      room.participants.push({
        id: p.id,
        userId: p.userId,
        username: p.username,
        isBot: p.isBot,
        botMode: p.botMode,
        isHost: p.isHost,
        joinedAt: new Date(p.joinedAt).getTime(),
        online: true,
        teamName: p.teamName,
        teamOvr: p.teamOvr,
        squad,
        formation: p.formation || '4-3-3',
      })
    }

    engineRef.current.state = room
  }, [game.settings])

  return { engineRef, initializeAsHost }
}

/**
 * Get a function to check if the current user is the host.
 */
export function useIsHost(): boolean {
  const user = useUserStore((s) => s.user)
  const participants = useGameStore((s) => s.participants)
  if (!user) return false
  const me = participants.find((p) => p.userId === user.id)
  return me?.isHost || false
}
