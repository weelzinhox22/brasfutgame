'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { getSupabaseClient, subscribeToChannel } from './supabase-client'
import { useGameStore } from '@/store/game-store'
import { useUserStore } from '@/store/user-store'
import { toast } from 'sonner'

export interface SocketContextValue {
  connected: boolean
  broadcast: (event: string, payload: any) => void
  currentChannel: string | null
  subscribe: (channelName: string) => void
}

const SocketContext = createContext<SocketContextValue>({
  connected: false,
  broadcast: () => {},
  currentChannel: null,
  subscribe: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [currentChannel, setCurrentChannel] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const supabaseRef = useRef(getSupabaseClient())

  const subscribe = useCallback((channelName: string) => {
    // Cleanup previous subscription
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    setCurrentChannel(channelName)

    // Define event handlers
    const handlers: Record<string, (payload: any) => void> = {
      'room:state': (payload) => {
        const game = useGameStore.getState()
        game.setRoomState({
          roomCode: payload.code,
          hostId: payload.hostId,
          settings: payload.settings,
          status: payload.status,
          participants: payload.participants,
          chat: payload.chat,
        })
        if (payload.squads && payload.squads.length > 0) {
          game.setSquads(payload.squads)
        }
      },
      'room:settings-updated': (payload) => {
        useGameStore.getState().setSettings(payload.settings)
      },
      'room:status-changed': (payload) => {
        const game = useGameStore.getState()
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
      },
      'room:host-changed': (payload) => {
        useGameStore.getState().setRoomState({ hostId: payload.newHostId })
      },
      'chat:message': (payload) => {
        useGameStore.getState().addChat(payload)
      },
      'room:error': (payload) => {
        console.warn('[room:error]', payload.message)
        toast.error(payload.message)
      },
      'draft:state': (payload) => {
        if (payload) useGameStore.getState().setDraft(payload)
      },
      'draft:complete': (payload) => {
        useGameStore.getState().setSquads(payload.squads)
        useGameStore.getState().setView('championship')
      },
      'draft:roll-result': (payload) => {
        const game = useGameStore.getState()
        const draft = game.draft
        if (draft) {
          game.setDraft({ ...draft, lastRoll: payload.roll })
        }
      },
      'draft:options': (payload) => {
        const game = useGameStore.getState()
        const draft = game.draft
        if (draft) {
          game.setDraft({ ...draft, currentOptions: payload.options, status: 'choosing' })
        }
      },
      'draft:turn': (payload) => {
        // handled by draft:state
      },
      'draft:picks': () => {},
      'draft:bot-pick': () => {},
      'championship:state': (payload) => {
        if (payload) {
          const game = useGameStore.getState()
          const existingChamp = game.championship
          game.setChampionship({
            ...(existingChamp || {}),
            ...payload,
          })
          if (payload.standings) game.setStandings(payload.standings)
        }
      },
      'championship:match-start': (payload) => {
        const game = useGameStore.getState()
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
      },
      'championship:match-tick': (payload) => {
        useGameStore.getState().setMatchTimer(payload)
      },
      'championship:match-event': (payload) => {
        const game = useGameStore.getState()
        game.addMatchEvent(payload)
        if (payload.type === 'goal') {
          const cm = useGameStore.getState().currentMatch
          if (cm) {
            if (payload.team === 'home') game.setCurrentMatch({ ...cm, homeScore: cm.homeScore + 1 })
            else game.setCurrentMatch({ ...cm, awayScore: cm.awayScore + 1 })
          }
        }
      },
      'championship:match-result': (payload) => {
        const cm = useGameStore.getState().currentMatch
        if (cm) {
          useGameStore.getState().setCurrentMatch({
            ...cm,
            homeScore: payload.homeScore,
            awayScore: payload.awayScore,
          })
        }
      },
      'championship:standings-updated': (payload) => {
        useGameStore.getState().setStandings(payload)
      },
      'championship:complete': (payload) => {
        const game = useGameStore.getState()
        game.setStandings(payload.standings)
        game.setChampion(payload.champion)
        game.setMatchTimer(null)
        const ch = game.championship
        if (ch) game.setChampionship({ ...ch, finished: true })
      },
      'room:restarted': () => {
        const game = useGameStore.getState()
        game.setView('room')
        game.setCurrentMatch(null)
        game.setMatchTimer(null)
        game.setChampionship(null)
        game.setDraft(null)
        game.setStandings([])
        game.setChampion(null)
      },
      'room:participant-joined': (payload) => {
        // Another participant joined - refresh room state
        const game = useGameStore.getState()
        if (game.roomCode) {
          // Refresh room state from API
          fetchRoomState(game.roomCode)
        }
      },
      'room:participant-left': (payload) => {
        const game = useGameStore.getState()
        if (game.roomCode) {
          fetchRoomState(game.roomCode)
        }
      },
    }

    const cleanup = subscribeToChannel(
      channelName,
      handlers,
      (status) => {
        setConnected(status === 'SUBSCRIBED')
      }
    )
    cleanupRef.current = cleanup
  }, [])

  // Connect to lobby on mount
  useEffect(() => {
    subscribe('lobby')
    return () => {
      if (cleanupRef.current) cleanupRef.current()
    }
  }, [subscribe])

  const broadcast = useCallback((event: string, payload: any) => {
    const channel = currentChannel || 'lobby'
    const supabase = supabaseRef.current
    supabase.channel(channel).send({
      type: 'broadcast',
      event,
      payload,
    })
  }, [currentChannel])

  return (
    <SocketContext.Provider value={{ connected, broadcast, currentChannel, subscribe }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)

async function fetchRoomState(code: string) {
  try {
    const res = await fetch(`/api/rooms/${code.toUpperCase()}`)
    if (!res.ok) return
    const data = await res.json()
    const game = useGameStore.getState()
    game.setRoomState({
      roomCode: data.code,
      hostId: data.hostId,
      settings: data.settings,
      status: data.status,
      participants: data.participants,
    })
  } catch {}
}
