'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import PartySocket from 'partysocket'
import { useGameStore } from '@/store/game-store'
import { useUserStore } from '@/store/user-store'
import { toast } from 'sonner'

export interface SocketContextValue {
  connected: boolean
  emit: (event: string, data?: any) => void
}

const SocketContext = createContext<SocketContextValue>({
  connected: false,
  emit: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<PartySocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null)
  const joinPayloadRef = useRef<any>(null)

  useEffect(() => {
    const room = activeRoomCode || 'lobby'
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || (isDev ? 'localhost:1999' : 'efootdoscria-realtime.wesley.partykit.dev')

    const socket = new PartySocket({ host, room })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnected(true)
      // Re-join the current room on connection
      if (joinPayloadRef.current && joinPayloadRef.current.code.toUpperCase() === room) {
        socket.send(JSON.stringify({ type: 'room:join', payload: joinPayloadRef.current }))
      } else {
        const st = useGameStore.getState()
        const u = useUserStore.getState().user
        if (st.roomCode && u && st.roomCode.toUpperCase() === room) {
          socket.send(
            JSON.stringify({
              type: 'room:join',
              payload: { code: st.roomCode, userId: u.id, username: u.username },
            })
          )
        }
      }
    })

    socket.addEventListener('close', () => setConnected(false))
    socket.addEventListener('error', () => setConnected(false))

    socket.addEventListener('message', (event) => {
      try {
        const { type, payload } = JSON.parse(event.data)
        const game = useGameStore.getState()

        // ----- Room events -----
        if (type === 'room:state') {
          game.setRoomState({
            roomCode: payload.code,
            hostId: payload.hostId,
            settings: payload.settings,
            status: payload.status,
            participants: payload.participants,
            chat: payload.chat,
          })
          // Restore squads on reconnect during playing/finished state
          if (payload.squads && payload.squads.length > 0) {
            game.setSquads(payload.squads)
          }
        }
        else if (type === 'room:joined') {
          setActiveRoomCode(payload.code.toUpperCase())
          game.setRoomState({ roomCode: payload.code, participantId: payload.participantId })
        }
        else if (type === 'room:settings-updated') {
          game.setSettings(payload.settings)
        }
        else if (type === 'room:status-changed') {
          game.setRoomState({ status: payload.status })
          if (payload.status === 'draft') game.setView('draft')
          if (payload.status === 'playing') {
            game.setView('championship')
            game.setRoomState({ matchEvents: [] })
          }
          if (payload.status === 'waiting') {
            game.setView('room')
            game.setCurrentMatch(null)
            game.setMatchTimer(null)
            game.setChampionship(null)
            game.setDraft(null)
          }
        }
        else if (type === 'room:host-changed') {
          game.setRoomState({ hostId: payload.newHostId })
        }
        else if (type === 'chat:message') {
          game.addChat(payload)
        }
        else if (type === 'room:error') {
          console.warn('[room:error]', payload.message)
          toast.error(payload.message)
          game.reset()
          game.setView('lobby')
          setActiveRoomCode(null)
        }

        // ----- Draft events -----
        else if (type === 'draft:state') {
          if (payload) game.setDraft(payload)
        }
        else if (type === 'draft:complete') {
          game.setSquads(payload.squads)
          game.setView('championship')
        }

        // ----- Championship events -----
        else if (type === 'championship:state') {
          if (payload) {
            const existingChamp = useGameStore.getState().championship
            game.setChampionship({
              ...(existingChamp || {}),
              ...payload,
            })
            if (payload.standings) game.setStandings(payload.standings)
          }
        }
        else if (type === 'championship:match-start') {
          game.setRoomState({ matchEvents: [] })
          game.setCurrentMatch({
            homeName: payload.homeName,
            awayName: payload.awayName,
            homeOvr: payload.homeOvr,
            awayOvr: payload.awayOvr,
            homeScore: 0,
            awayScore: 0,
          })
          game.setMatchTimer({ secondsLeft: payload.totalSeconds, simMinute: 0 })
        }
        else if (type === 'championship:match-tick') {
          game.setMatchTimer(payload)
        }
        else if (type === 'championship:match-event') {
          game.addMatchEvent(payload)
          if (payload.type === 'goal') {
            const cm = useGameStore.getState().currentMatch
            if (cm) {
              if (payload.team === 'home') game.setCurrentMatch({ ...cm, homeScore: cm.homeScore + 1 })
              else game.setCurrentMatch({ ...cm, awayScore: cm.awayScore + 1 })
            }
          }
          // Track last event index for pass trajectory animation
          game.setLastEventIndex(game.matchEvents.length)
        }
        else if (type === 'championship:match-result') {
          const cm = useGameStore.getState().currentMatch
          if (cm) {
            game.setCurrentMatch({ ...cm, homeScore: payload.homeScore, awayScore: payload.awayScore })
          }
        }
        else if (type === 'championship:standings-updated') {
          game.setStandings(payload)
        }
        else if (type === 'championship:complete') {
          game.setStandings(payload.standings)
          game.setChampion(payload.champion)
          game.setMatchTimer(null)
          const ch = useGameStore.getState().championship
          if (ch) game.setChampionship({ ...ch, finished: true })
        }
      } catch (err) {
        console.error('[party message error]', err)
      }
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [activeRoomCode])

  const emit = useCallback((event: string, data?: any) => {
    if (event === 'room:join' && data && data.code) {
      const code = data.code.toUpperCase()
      joinPayloadRef.current = data
      setActiveRoomCode(code)
    } else if (event === 'room:leave') {
      socketRef.current?.send(JSON.stringify({ type: 'room:leave', payload: data }))
      setActiveRoomCode(null)
      joinPayloadRef.current = null
    } else {
      socketRef.current?.send(JSON.stringify({ type: event, payload: data }))
    }
  }, [])

  return (
    <SocketContext.Provider value={{ connected, emit }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
