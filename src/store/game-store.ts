'use client'

import { create } from 'zustand'
import type {
  RoomSettings,
  RoomParticipant,
  ChatMessage,
  MatchEvent,
  ChampionshipStanding,
  HistoricalPlayer,
  Position,
  PlayerStats,
  AppView,
} from '@/lib/types'

export interface DraftOption {
  id: string
  name: string
  position: Position
  overall: number
  country: string
  club: string
  year: number
  decade: number
  photoColor: string
  stats: PlayerStats
}

export interface DraftSquad {
  id: string
  username: string
  formation: string
  squad: HistoricalPlayer[]
}

export interface DraftStateUI {
  order: string[]
  currentTurnIndex: number
  currentRound: number
  totalRounds: number
  picksPerTurn: number
  picks: { participantId: string; playerId: string; playerName: string; position: Position; overall: number; round: number }[]
  status: 'rolling' | 'choosing' | 'bot-thinking' | 'done'
  lastRoll: number | null
  currentOptions: DraftOption[]
  squadCounts: { id: string; count: number; positions: Position[] }[]
  squads: DraftSquad[]
  hideOvr?: boolean
  privatePicks?: boolean
}

export interface MatchSlotUI {
  homeName: string
  awayName: string
  round: number
}

export interface ChampionshipStateUI {
  schedule: MatchSlotUI[][]
  currentRound: number
  currentMatchIndex: number
  currentRoundMatches: { round: number; homeId: string; awayId: string; homeName: string; awayName: string }[]
  timer: { secondsLeft: number; total: number } | null
  finished: boolean
}

interface CurrentMatch {
  homeName: string
  awayName: string
  homeOvr: number
  awayOvr: number
  homeScore: number
  awayScore: number
}

interface Squad {
  id: string
  username: string
  teamName: string | null
  teamOvr: number
  formation: string
  squad: HistoricalPlayer[]
}

interface MatchTimer {
  secondsLeft: number
  total: number
  simMinute: number
}

interface GameStore {
  view: AppView
  setView: (v: AppView) => void

  roomCode: string | null
  roomName: string | null
  hostId: string | null
  settings: RoomSettings
  status: 'waiting' | 'draft' | 'playing' | 'finished'
  participants: RoomParticipant[]
  chat: ChatMessage[]
  participantId: string | null

  draft: DraftStateUI | null
  championship: ChampionshipStateUI | null
  standings: ChampionshipStanding[]
  matchEvents: MatchEvent[]
  matchTimer: MatchTimer | null
  currentMatch: CurrentMatch | null
  champion: { id: string; name: string; points: number } | null
  squads: Squad[]

  setRoomState: (s: Partial<GameStore>) => void
  setSettings: (s: RoomSettings) => void
  addChat: (m: ChatMessage) => void
  setDraft: (d: DraftStateUI | null) => void
  setChampionship: (c: ChampionshipStateUI | null) => void
  setStandings: (s: ChampionshipStanding[]) => void
  addMatchEvent: (e: MatchEvent) => void
  setMatchTimer: (t: { secondsLeft: number; simMinute: number } | null) => void
  setCurrentMatch: (m: CurrentMatch | null) => void
  setChampion: (c: GameStore['champion']) => void
  setSquads: (s: Squad[]) => void
  reset: () => void
}

const initialState = {
  view: 'login' as AppView,
  roomCode: null as string | null,
  roomName: null as string | null,
  hostId: null as string | null,
  settings: {
    teamFilter: 'mixed' as const,
    botCount: 4,
    simSpeed: 'normal' as const,
    rounds: 1,
    botMode: 'balanced' as const,
    maxPlayers: 20,
    competitionFormat: 'custom' as const,
    hideOvr: false,
    privatePicks: false,
  } as RoomSettings,
  status: 'waiting' as const,
  participants: [] as RoomParticipant[],
  chat: [] as ChatMessage[],
  participantId: null as string | null,
  draft: null as DraftStateUI | null,
  championship: null as ChampionshipStateUI | null,
  standings: [] as ChampionshipStanding[],
  matchEvents: [] as MatchEvent[],
  matchTimer: null as MatchTimer | null,
  currentMatch: null as CurrentMatch | null,
  champion: null as { id: string; name: string; points: number } | null,
  squads: [] as Squad[],
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  setView: (v) => set({ view: v }),
  setRoomState: (s) => set(s),
  setSettings: (s) => set({ settings: s }),
  addChat: (m) => set((st) => ({ chat: [...st.chat, m].slice(-200) })),
  setDraft: (d) => set({ draft: d }),
  setChampionship: (c) => set({ championship: c }),
  setStandings: (s) => set({ standings: s }),
  addMatchEvent: (e) => set((st) => ({ matchEvents: [...st.matchEvents, e].slice(-100) })),
  setMatchTimer: (t) =>
    set((st) => ({
      matchTimer: t
        ? { secondsLeft: t.secondsLeft, total: st.matchTimer?.total || 15, simMinute: t.simMinute }
        : null,
    })),
  setCurrentMatch: (m) => set({ currentMatch: m }),
  setChampion: (c) => set({ champion: c }),
  setSquads: (s) => set({ squads: s }),
  reset: () => set({ ...initialState }),
}))

// Debug helper (temporary)
if (typeof window !== 'undefined') {
  ;(window as any).__gameStore = useGameStore
}

// Debug helper (temporary)
if (typeof window !== 'undefined') {
  ;(window as any).__gameStore = useGameStore
}
