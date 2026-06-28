'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useGameStore } from '@/store/game-store'
import { useUserStore } from '@/store/user-store'

/**
 * Hook that manages the socket.io connection to the championship service.
 * Call useSocket() once at the top of the app (in page.tsx).
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const user = useUserStore((s) => s.user)
  const game = useGameStore()

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      path: '/',
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Re-join the current room on (re)connection
      const st = useGameStore.getState()
      const u = useUserStore.getState().user
      if (st.roomCode && u) {
        socket.emit('room:join', { code: st.roomCode, userId: u.id, username: u.username })
      }
    })
    socket.on('disconnect', () => setConnected(false))

    // ----- Room events -----
    socket.on('room:state', (state: any) => {
      game.setRoomState({
        roomCode: state.code,
        hostId: state.hostId,
        settings: state.settings,
        status: state.status,
        participants: state.participants,
        chat: state.chat,
      })
    })

    socket.on('room:joined', (data: { code: string; participantId: string }) => {
      game.setRoomState({ roomCode: data.code, participantId: data.participantId })
    })

    socket.on('room:settings-updated', (data: { settings: any }) => {
      game.setSettings(data.settings)
    })

    socket.on('room:status-changed', (data: { status: any }) => {
      game.setRoomState({ status: data.status })
      if (data.status === 'draft') game.setView('draft')
      if (data.status === 'playing') {
        game.setView('championship')
        game.setRoomState({ matchEvents: [] })
      }
    })

    socket.on('room:host-changed', (data: { newHostId: string }) => {
      game.setRoomState({ hostId: data.newHostId })
    })

    socket.on('chat:message', (msg: any) => {
      game.addChat(msg)
    })

    socket.on('room:error', (data: { message: string }) => {
      console.warn('[room:error]', data.message)
    })

    // ----- Draft events -----
    socket.on('draft:state', (d: any) => {
      if (!d) return
      game.setDraft(d)
    })

    socket.on('draft:turn', (data: any) => {
      // could highlight whose turn
    })

    socket.on('draft:roll-result', (data: { participantId: string; roll: number }) => {
      // handled via draft:state / dice animation in component
    })

    socket.on('draft:options', (data: { participantId: string; options: any[] }) => {
      // options come through draft:state too
    })

    socket.on('draft:picks', (data: any) => {
      // picks reflected in draft:state
    })

    socket.on('draft:bot-pick', (data: any) => {
      // reflected in draft:state
    })

    socket.on('draft:complete', (data: { squads: any[] }) => {
      game.setSquads(data.squads)
      game.setView('championship')
    })

    // ----- Championship events -----
    socket.on('championship:state', (c: any) => {
      if (!c) return
      game.setChampionship(c)
    })

    socket.on('championship:match-start', (data: any) => {
      game.setRoomState({ matchEvents: [] })
      game.setCurrentMatch({
        homeName: data.homeName,
        awayName: data.awayName,
        homeOvr: data.homeOvr,
        awayOvr: data.awayOvr,
        homeScore: 0,
        awayScore: 0,
      })
      game.setMatchTimer({ secondsLeft: data.totalSeconds, simMinute: 0 })
    })

    socket.on('championship:match-tick', (data: { secondsLeft: number; simMinute: number }) => {
      game.setMatchTimer(data)
    })

    socket.on('championship:match-event', (e: any) => {
      game.addMatchEvent(e)
      if (e.type === 'goal') {
        // update current match score
        const cm = useGameStore.getState().currentMatch
        if (cm) {
          if (e.team === 'home') game.setCurrentMatch({ ...cm, homeScore: cm.homeScore + 1 })
          else game.setCurrentMatch({ ...cm, awayScore: cm.awayScore + 1 })
        }
      }
    })

    socket.on('championship:match-result', (data: any) => {
      const cm = useGameStore.getState().currentMatch
      if (cm) {
        game.setCurrentMatch({ ...cm, homeScore: data.homeScore, awayScore: data.awayScore })
      }
    })

    socket.on('championship:standings-updated', (standings: any[]) => {
      game.setStandings(standings)
    })

    socket.on('championship:round-complete', (data: any) => {
      // info
    })

    socket.on('championship:complete', (data: { standings: any[]; champion: any }) => {
      game.setStandings(data.standings)
      game.setChampion(data.champion)
      game.setMatchTimer(null)
      const ch = useGameStore.getState().championship
      if (ch) game.setChampionship({ ...ch, finished: true })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const emit = (event: string, data?: any) => {
    socketRef.current?.emit(event, data)
  }

  return { socket: socketRef, connected, emit }
}
