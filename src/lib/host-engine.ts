/**
 * Host Engine — game logic that runs on the host client.
 * Adapted from party/server.ts to work client-side.
 * The host executes this logic and broadcasts events via Supabase Realtime.
 */

import { createClient } from '@supabase/supabase-js'
import type {
  Position,
  BotMode,
  RoomSettings,
  HistoricalPlayer,
  MatchEvent,
  RoomParticipant,
  MatchResult,
} from './types'
import { DEFAULT_SETTINGS, SIM_SPEEDS } from './types'
import { simulateMatch, computeTeamOVR, FORMATION_ROLES } from './simulation'
import type { TeamForSim } from './simulation'
import { botPickPlayers, generateBotName } from './bots'

// ============================================================
// Types
// ============================================================

interface ParticipantState {
  id: string
  userId: string | null
  username: string
  isBot: boolean
  botMode: BotMode | null
  isHost: boolean
  joinedAt: number
  online: boolean
  teamName: string | null
  teamOvr: number
  squad: HistoricalPlayer[]
  formation: string
}

interface DraftInternalState {
  order: string[]
  currentTurnIndex: number
  currentRound: number
  totalRounds: number
  picksPerTurn: number
  picks: {
    participantId: string
    playerId: string
    playerName: string
    position: Position
    overall: number
    round: number
  }[]
  status: 'rolling' | 'choosing' | 'bot-thinking' | 'done'
  lastRoll: number | null
  currentOptions: HistoricalPlayer[]
  availablePlayers: HistoricalPlayer[]
}

interface ChampionshipInternalState {
  schedule: {
    round: number
    homeId: string
    awayId: string
    homeName: string
    awayName: string
  }[][]
  currentRound: number
  currentMatchIndex: number
  timer: { secondsLeft: number; total: number } | null
  pendingResult: {
    homeId: string
    awayId: string
    homeName: string
    awayName: string
    homeScore: number
    awayScore: number
    events: MatchEvent[]
    streamedUpTo: number
  } | null
  finished: boolean
}

export interface EngineRoom {
  code: string
  roomId: string
  hostId: string
  settings: RoomSettings
  status: 'waiting' | 'draft' | 'playing' | 'finished'
  participants: ParticipantState[]
  chat: {
    id: string
    username: string
    content: string
    type: 'user' | 'system' | 'bot'
    createdAt: string
  }[]
  draft: DraftInternalState | null
  championship: ChampionshipInternalState | null
  champion: { id: string; name: string; points: number } | null
  yellowCards: Record<string, number>
  suspendedPlayers: string[]
}

// ============================================================
// Supabase Helpers
// ============================================================

let _engineSupabase: ReturnType<typeof createClient> | null = null

function getEngineSupabase() {
  if (!_engineSupabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _engineSupabase = createClient(url, anonKey)
  }
  return _engineSupabase
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// ============================================================
// Engine Functions
// ============================================================

export function createEngineRoom(code: string, roomId: string, hostId: string): EngineRoom {
  return {
    code,
    roomId,
    hostId,
    settings: { ...DEFAULT_SETTINGS },
    status: 'waiting',
    participants: [],
    chat: [],
    draft: null,
    championship: null,
    champion: null,
    yellowCards: {},
    suspendedPlayers: [],
  }
}

export function systemMessage(content: string) {
  return {
    id: generateId(),
    username: 'Sistema',
    content,
    type: 'system' as const,
    createdAt: new Date().toISOString(),
  }
}

function neededPositions(squad: HistoricalPlayer[], formation: string): Position[] {
  const required = FORMATION_ROLES[formation] || FORMATION_ROLES['4-3-3']
  const needed: Position[] = []
  const have = [...squad.map((s) => s.position)]
  for (const req of required) {
    const idx = have.indexOf(req)
    if (idx >= 0) have.splice(idx, 1)
    else needed.push(req)
  }
  return needed
}

function generateOptions(
  available: HistoricalPlayer[],
  squad: HistoricalPlayer[],
  formation: string,
  roll: number
): HistoricalPlayer[] {
  const needed = neededPositions(squad, formation)
  if (needed.length === 0) return []

  const TARGET = 8
  const targetOvr = 60 + roll * 6

  const sh = <T>(arr: T[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const byPos: Record<string, HistoricalPlayer[]> = {}
  for (const pos of needed) {
    byPos[pos] = [...available.filter((p) => p.position === pos)].sort((a, b) => {
      const aDiff = Math.abs(a.overall - targetOvr)
      const bDiff = Math.abs(b.overall - targetOvr)
      return aDiff - bDiff
    })
  }

  const picked = new Set<string>()
  const result: HistoricalPlayer[] = []
  let round = 0
  const shuffledNeeded = sh([...needed])
  while (result.length < TARGET) {
    let addedThisRound = false
    for (const pos of shuffledNeeded) {
      if (result.length >= TARGET) break
      const candidates = byPos[pos]?.filter((p) => !picked.has(p.id)) ?? []
      if (candidates.length === 0) continue
      const candidate = candidates[Math.min(round, candidates.length - 1)]
      result.push(candidate)
      picked.add(candidate.id)
      addedThisRound = true
    }
    round++
    if (!addedThisRound) break
  }
  return result.sort((a, b) => b.overall - a.overall)
}

function generateRoundRobin(participants: ParticipantState[]) {
  const teams = participants.filter((p) => p.squad.length >= 7)
  if (teams.length < 2) return []
  const n = teams.length
  const rounds: {
    round: number
    homeId: string
    awayId: string
    homeName: string
    awayName: string
  }[][] = []
  const arr = teams.map((p) => p)
  const useGhost = n % 2 !== 0
  if (useGhost) arr.push(null as any)
  const N = arr.length
  const totalRounds = N - 1
  for (let r = 0; r < totalRounds; r++) {
    const matches: {
      round: number
      homeId: string
      awayId: string
      homeName: string
      awayName: string
    }[] = []
    for (let i = 0; i < N / 2; i++) {
      const a = arr[i]
      const b = arr[N - 1 - i]
      if (a && b) {
        const home = r % 2 === 0 ? a : b
        const away = r % 2 === 0 ? b : a
        matches.push({
          round: r + 1,
          homeId: home.id,
          awayId: away.id,
          homeName: home.teamName || home.username,
          awayName: away.teamName || away.username,
        })
      }
    }
    rounds.push(matches)
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop()!)
    arr.splice(0, arr.length, fixed, ...rest)
  }
  return rounds
}

function filterPlayers(players: HistoricalPlayer[], settings: RoomSettings): HistoricalPlayer[] {
  return players.filter((p) => {
    if (settings.teamFilter === 'brazilian') return p.country === 'Brasil' || p.country === 'Brazil'
    if (settings.teamFilter === 'international') return p.country !== 'Brasil' && p.country !== 'Brazil'
    return true
  })
}

// ============================================================
// Host Engine Class
// ============================================================

export type EngineBroadcast = (event: string, payload: any) => void

export class HostEngine {
  state: EngineRoom | null = null
  matchInterval: ReturnType<typeof setInterval> | null = null
  broadcast: EngineBroadcast

  constructor(broadcast: EngineBroadcast) {
    this.broadcast = broadcast
  }

  async addBots(count: number) {
    if (!this.state) return
    const supabase = getEngineSupabase()

    const humans = this.state.participants.filter((p) => !p.isBot).length
    const bots = this.state.participants.filter((p) => p.isBot).length
    const slots = Math.max(0, Math.min(count, this.state.settings.maxPlayers - humans - bots))

    for (let i = 0; i < slots; i++) {
      const name = generateBotName(Date.now() + i)
      const id = generateId()

      const { data: created, error } = await supabase
        .from('RoomParticipant')
        .insert({
          id,
          roomId: this.state.roomId,
          userId: null,
          username: name,
          isBot: true,
          botMode: this.state.settings.botMode,
          isHost: false,
        })
        .select()
        .single()

      if (error) {
        console.error('[HostEngine] addBot error:', error)
        continue
      }

      this.state.participants.push({
        id: created.id,
        userId: null,
        username: name,
        isBot: true,
        botMode: this.state.settings.botMode,
        isHost: false,
        joinedAt: new Date(created.joinedAt).getTime(),
        online: true,
        teamName: null,
        teamOvr: 0,
        squad: [],
        formation: '4-3-3',
      })

      const msg = systemMessage(`${name} (bot) entrou na sala.`)
      await this.pushChat(msg)
    }
    this.broadcastRoomState()
  }

  async removeBot(participantId: string) {
    if (!this.state) return
    const p = this.state.participants.find((pp) => pp.id === participantId)
    if (!p || !p.isBot) return

    this.state.participants = this.state.participants.filter((pp) => pp.id !== participantId)
    const supabase = getEngineSupabase()
    await supabase.from('RoomParticipant').delete().eq('id', participantId)

    const msg = systemMessage(`${p.username} (bot) removido.`)
    await this.pushChat(msg)
    this.broadcastRoomState()
  }

  async onParticipantLeave(participantId: string) {
    if (!this.state) return
    const participant = this.state.participants.find((p) => p.id === participantId)
    if (!participant) return
    if (participant.isBot) return

    participant.online = false

    if (participant.isHost) {
      // Migrate host to next human
      const humans = this.state.participants.filter((p) => !p.isBot && p.online)
      if (humans.length > 0) {
        this.state.participants.forEach((p) => (p.isHost = false))
        humans[0].isHost = true
        this.state.hostId = humans[0].userId || humans[0].id
        const msg = systemMessage(`Host migrado para ${humans[0].username}.`)
        await this.pushChat(msg)
        this.broadcast('room:host-changed', { newHostId: this.state.hostId, newHostName: humans[0].username })
      }
    }

    const msg = systemMessage(`${participant.username} desconectou.`)
    await this.pushChat(msg)
    this.broadcastRoomState()
  }

  async pushChat(msg: any) {
    if (!this.state) return
    this.state.chat.push(msg)
    this.broadcast('chat:message', msg)

    const supabase = getEngineSupabase()
    try {
      await supabase.from('ChatMessage').insert({
        id: msg.id,
        roomId: this.state.roomId,
        username: msg.username,
        content: msg.content,
        type: msg.type,
      })
    } catch (e) {
      console.error('[HostEngine] pushChat error:', e)
    }
  }

  broadcastRoomState() {
    if (!this.state) return
    this.broadcast('room:state', this.publicRoom())
  }

  publicRoom() {
    if (!this.state) return null

    const squads =
      this.state.status === 'playing' || this.state.status === 'finished'
        ? this.state.participants.map((p) => ({
            id: p.id,
            username: p.username,
            teamName: p.teamName,
            teamOvr: p.teamOvr,
            formation: p.formation,
            squad: p.squad,
          }))
        : []

    return {
      code: this.state.code,
      roomId: this.state.roomId,
      hostId: this.state.hostId,
      settings: this.state.settings,
      status: this.state.status,
      participants: this.state.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.username,
        isBot: p.isBot,
        botMode: p.botMode,
        isHost: p.isHost,
        online: p.online,
        joinedAt: new Date(p.joinedAt).toISOString(),
        teamName: p.teamName,
        teamOvr: p.teamOvr,
        squadSize: p.squad.length,
        formation: p.formation,
      })),
      squads,
      chat: this.state.chat.slice(-100),
    }
  }

  publicDraftState(viewerParticipantId?: string) {
    if (!this.state || !this.state.draft) return null
    const d = this.state.draft
    const currentId = d.order[d.currentTurnIndex]
    const hideOptions = this.state.settings.privatePicks && viewerParticipantId !== currentId

    return {
      roomId: this.state.roomId,
      order: d.order,
      currentTurnIndex: d.currentTurnIndex,
      currentRound: d.currentRound,
      totalRounds: d.totalRounds,
      picksPerTurn: d.picksPerTurn,
      picks: d.picks,
      status: d.status,
      lastRoll: d.lastRoll,
      currentOptions: hideOptions
        ? []
        : d.currentOptions.map((p) => ({
            id: p.id,
            name: p.name,
            position: p.position,
            overall: p.overall,
            country: p.country,
            club: p.club,
            year: p.year,
            decade: p.decade,
            photoColor: p.photoColor,
            stats: p.stats,
          })),
      squadCounts: this.state.participants.map((p) => ({
        id: p.id,
        count: p.squad.length,
        positions: p.squad.map((s) => s.position),
      })),
      squads: this.state.participants.map((p) => ({
        id: p.id,
        username: p.username,
        formation: p.formation,
        squad: p.squad.map((s) => ({
          id: s.id,
          name: s.name,
          position: s.position,
          overall: s.overall,
          country: s.country,
          club: s.club,
          year: s.year,
          decade: s.decade,
          photoColor: s.photoColor,
          stats: s.stats,
        })),
      })),
      hideOvr: this.state.settings.hideOvr,
      privatePicks: this.state.settings.privatePicks,
    }
  }

  emitDraftState() {
    if (!this.state || !this.state.draft) return
    if (!this.state.settings.privatePicks) {
      this.broadcast('draft:state', this.publicDraftState())
      return
    }
    // Broadcast publicly anyway - clients filter based on their own participantId
    this.broadcast('draft:state', this.publicDraftState())
  }

  async startDraft() {
    if (!this.state) return
    const supabase = getEngineSupabase()

    if (this.state.settings.skipDraft) {
      await this.startAutoDraft()
      return
    }

    const { data: allPlayers, error } = await supabase.from('HistoricalPlayer').select('*')
    if (error) throw error

    const parsed: HistoricalPlayer[] = (allPlayers || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position as Position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.parse(p.stats || '{}'),
      teamId: p.teamId,
    }))

    const available = filterPlayers(parsed, this.state.settings)
    const order = [...this.state.participants].sort(() => Math.random() - 0.5).map((p) => p.id)
    const totalRounds = 6
    const picksPerTurn = 2

    this.state.draft = {
      order,
      currentTurnIndex: 0,
      currentRound: 1,
      totalRounds,
      picksPerTurn,
      picks: [],
      status: 'rolling',
      lastRoll: null,
      currentOptions: [],
      availablePlayers: available,
    }

    this.state.status = 'draft'
    await supabase.from('Room').update({ status: 'draft' }).eq('id', this.state.roomId)

    const msg = systemMessage('Draft iniciado! Ordem sorteada. Role o dado e escolha 2 jogadores por turno.')
    await this.pushChat(msg)

    this.emitDraftState()
    this.broadcast('room:status-changed', { status: 'draft' })
    this.broadcastRoomState()

    await this.advanceDraftTurn()
  }

  async startAutoDraft() {
    if (!this.state) return
    const supabase = getEngineSupabase()

    const { data: allPlayers, error } = await supabase.from('HistoricalPlayer').select('*')
    if (error) throw error

    const parsed: HistoricalPlayer[] = (allPlayers || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position as Position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.parse(p.stats || '{}'),
      teamId: p.teamId,
    }))

    const available = filterPlayers(parsed, this.state.settings)
    const usedIds = new Set<string>()

    this.state.status = 'draft'
    this.state.draft = null

    await supabase.from('Room').update({ status: 'draft' }).eq('id', this.state.roomId)

    const msg = systemMessage('⚡ Draft automático iniciado! Distribuindo jogadores aleatórios...')
    await this.pushChat(msg)

    for (const participant of this.state.participants) {
      const formation = participant.formation || '4-3-3'
      const formationRoles = FORMATION_ROLES[formation] || FORMATION_ROLES['4-3-3']
      const pool = available.filter((p) => !usedIds.has(p.id))
      const squad: HistoricalPlayer[] = []
      const maxPicks = Math.min(11, pool.length)
      let pickCount = 0

      for (const pos of formationRoles) {
        if (pickCount >= maxPicks) break
        const candidates = pool.filter((p) => !usedIds.has(p.id) && p.position === pos)
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.overall - a.overall)
          const pickIdx = Math.min(Math.floor(Math.random() * Math.min(candidates.length, 5)), candidates.length - 1)
          const pick = candidates[pickIdx]
          squad.push(pick)
          usedIds.add(pick.id)
          pickCount++
        }
      }

      if (pickCount < maxPicks) {
        const remaining = pool.filter((p) => !usedIds.has(p.id))
        remaining.sort((a, b) => b.overall - a.overall)
        for (let i = 0; i < remaining.length && pickCount < maxPicks; i++) {
          squad.push(remaining[i])
          usedIds.add(remaining[i].id)
          pickCount++
        }
      }

      participant.squad = squad
      const { ovr } = computeTeamOVR(
        squad.map((s) => ({ overall: s.overall, position: s.position })),
        formation
      )
      participant.teamOvr = ovr
      if (!participant.teamName) {
        participant.teamName = `${participant.username} FC`
      }

      await supabase
        .from('RoomParticipant')
        .update({
          teamName: participant.teamName,
          teamOvr: ovr,
          squad: JSON.stringify(squad.map((s) => s.id)),
        })
        .eq('id', participant.id)
    }

    this.state.status = 'playing'
    await supabase.from('Room').update({ status: 'playing' }).eq('id', this.state.roomId)

    const doneMsg = systemMessage('✅ Draft automático concluído! As escalações foram definidas. Iniciando campeonato...')
    await this.pushChat(doneMsg)

    this.broadcast('draft:complete', {
      squads: this.state.participants.map((p) => ({
        id: p.id,
        username: p.username,
        teamName: p.teamName,
        teamOvr: p.teamOvr,
        formation: p.formation,
        squad: p.squad,
      })),
    })

    this.broadcast('room:status-changed', { status: 'playing' })

    await new Promise((r) => setTimeout(r, 2000))
    await this.startChampionship()
  }

  async advanceDraftTurn() {
    if (!this.state || !this.state.draft) return
    const d = this.state.draft

    const allDone = this.state.participants.every((p) => p.squad.length >= 11)
    if (allDone || d.currentRound > d.totalRounds) {
      await this.finishDraft()
      return
    }

    const currentId = d.order[d.currentTurnIndex]
    const participant = this.state.participants.find((p) => p.id === currentId)
    if (!participant || participant.squad.length >= 11) {
      d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
      if (d.currentTurnIndex === 0) d.currentRound++
      await this.advanceDraftTurn()
      return
    }

    d.status = participant.isBot ? 'bot-thinking' : 'rolling'
    d.lastRoll = null
    d.currentOptions = []

    this.broadcast('draft:turn', {
      participantId: currentId,
      round: d.currentRound,
      pickIndex: d.currentTurnIndex,
      isBot: participant.isBot,
    })
    this.emitDraftState()

    if (participant.isBot) {
      setTimeout(() => this.botDraftTurn(participant), 1800)
    }
  }

  async botDraftTurn(participant: ParticipantState) {
    if (!this.state || !this.state.draft) return
    const d = this.state.draft

    const roll = Math.floor(Math.random() * 6) + 1
    d.lastRoll = roll
    this.broadcast('draft:roll-result', { participantId: participant.id, roll })
    await new Promise((r) => setTimeout(r, 900))

    const options = generateOptions(d.availablePlayers, participant.squad, participant.formation, roll)
    d.currentOptions = options

    this.broadcast('draft:options', {
      participantId: participant.id,
      options: options.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        overall: p.overall,
        country: p.country,
        club: p.club,
        year: p.year,
        photoColor: p.photoColor,
      })),
    })
    await new Promise((r) => setTimeout(r, 1200))

    const picks = botPickPlayers(options, participant.squad, participant.botMode || 'balanced', participant.formation, d.picksPerTurn)
    await this.applyPicks(participant, picks, d.currentRound)

    this.broadcast('draft:bot-pick', {
      participantId: participant.id,
      players: picks.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        overall: p.overall,
        country: p.country,
        club: p.club,
        year: p.year,
        photoColor: p.photoColor,
      })),
    })

    this.emitDraftState()
    await new Promise((r) => setTimeout(r, 800))

    d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
    if (d.currentTurnIndex === 0) d.currentRound++
    await this.advanceDraftTurn()
  }

  async applyPicks(participant: ParticipantState, picks: HistoricalPlayer[], round: number) {
    if (!this.state || !this.state.draft) return
    const d = this.state.draft
    for (const pick of picks) {
      participant.squad.push(pick)
      d.picks.push({
        participantId: participant.id,
        playerId: pick.id,
        playerName: pick.name,
        position: pick.position,
        overall: pick.overall,
        round,
      })
      d.availablePlayers = d.availablePlayers.filter((p) => p.id !== pick.id)
    }
  }

  async finishDraft() {
    if (!this.state || !this.state.draft) return
    const d = this.state.draft
    d.status = 'done'

    const supabase = getEngineSupabase()
    for (const p of this.state.participants) {
      const { ovr } = computeTeamOVR(
        p.squad.map((s) => ({ overall: s.overall, position: s.position })),
        p.formation
      )
      p.teamOvr = ovr
      if (!p.teamName) p.teamName = `${p.username} FC`
      await supabase
        .from('RoomParticipant')
        .update({
          teamName: p.teamName,
          teamOvr: ovr,
          squad: JSON.stringify(p.squad.map((s) => s.id)),
        })
        .eq('id', p.id)
    }

    const msg = systemMessage('Draft concluído! O host já pode iniciar o campeonato.')
    await this.pushChat(msg)

    this.broadcast('draft:complete', {
      squads: this.state.participants.map((p) => ({
        id: p.id,
        username: p.username,
        teamName: p.teamName,
        teamOvr: p.teamOvr,
        formation: p.formation,
        squad: p.squad,
      })),
    })

    this.emitDraftState()
    this.broadcastRoomState()
  }

  async startChampionship() {
    if (!this.state) return
    const baseSchedule = generateRoundRobin(this.state.participants)

    if (baseSchedule.length === 0) {
      const msg = systemMessage('Não há participantes suficientes para iniciar o campeonato.')
      await this.pushChat(msg)
      return
    }

    let fullSchedule: typeof baseSchedule = []
    const format = this.state.settings.competitionFormat || 'custom'

    if (format === 'brasileirao') {
      for (let i = 0; i < 2; i++) {
        for (const round of baseSchedule) {
          const r = round.map((m) =>
            i === 1
              ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName }
              : m
          )
          fullSchedule.push(r)
        }
      }
    } else if (format === 'ucl-2026') {
      const totalRounds = Math.min(8, baseSchedule.length * 2)
      for (let r = 0; r < totalRounds; r++) {
        const baseRound = baseSchedule[r % baseSchedule.length]
        const swap = r >= baseSchedule.length
        const round = baseRound.map((m) =>
          swap ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName } : m
        )
        fullSchedule.push(round)
      }
    } else {
      const rep = Math.max(1, Math.min(this.state.settings.rounds || 1, 3))
      for (let i = 0; i < rep; i++) {
        for (const round of baseSchedule) {
          const r = round.map((m) =>
            i % 2 === 1
              ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName }
              : m
          )
          fullSchedule.push(r)
        }
      }
    }

    this.state.championship = {
      schedule: fullSchedule,
      currentRound: 0,
      currentMatchIndex: 0,
      timer: null,
      pendingResult: null,
      finished: false,
    }
    this.state.status = 'playing'

    const supabase = getEngineSupabase()
    await supabase.from('Room').update({ status: 'playing' }).eq('id', this.state.roomId)

    for (const p of this.state.participants) {
      if (p.squad.length >= 7) {
        const { data: existing } = await supabase
          .from('ChampionshipStanding')
          .select('id')
          .eq('roomId', this.state.roomId)
          .eq('participantId', p.id)
          .maybeSingle()
        if (!existing) {
          await supabase.from('ChampionshipStanding').insert({
            id: generateId(),
            roomId: this.state.roomId,
            participantId: p.id,
            name: p.teamName || p.username,
          })
        }
      }
    }

    const msg = systemMessage(`Campeonato iniciado! ${fullSchedule.length} rodada(s) programadas.`)
    await this.pushChat(msg)

    this.broadcast('room:status-changed', { status: 'playing' })
    this.broadcast('championship:state', this.publicChampionshipState())
    this.broadcastRoomState()

    await this.playNextMatch()
  }

  publicChampionshipState() {
    if (!this.state || !this.state.championship) return null
    const c = this.state.championship
    const currentRoundMatches = c.schedule[c.currentRound] || []
    return {
      schedule: c.schedule.map((round) => round.map((m) => ({ homeName: m.homeName, awayName: m.awayName, round: m.round }))),
      currentRound: c.currentRound,
      currentMatchIndex: c.currentMatchIndex,
      currentRoundMatches,
      timer: c.timer,
      finished: c.finished,
      standings: this.state.participants.map((p) => ({ id: p.id, name: p.teamName || p.username, ovr: p.teamOvr })),
      topScorers: (c as any).topScorers || [],
    }
  }

  async playNextMatch() {
    if (!this.state || !this.state.championship) return
    const c = this.state.championship

    if (c.currentRound >= c.schedule.length) {
      await this.finishChampionship()
      return
    }

    const round = c.schedule[c.currentRound]
    if (c.currentMatchIndex >= round.length) {
      this.broadcast('championship:round-complete', { round: c.currentRound + 1 })
      c.currentRound++
      c.currentMatchIndex = 0
      await this.playNextMatch()
      return
    }

    const slot = round[c.currentMatchIndex]
    const home = this.state.participants.find((p) => p.id === slot.homeId)
    const away = this.state.participants.find((p) => p.id === slot.awayId)
    if (!home || !away) {
      c.currentMatchIndex++
      await this.playNextMatch()
      return
    }

    const homeTeam: TeamForSim = {
      name: home.teamName || home.username,
      ovr: home.teamOvr,
      formation: home.formation,
      players: home.squad.slice(0, 11).map((s) => ({ name: s.name, position: s.position, overall: s.overall })),
      isHome: true,
    }
    const awayTeam: TeamForSim = {
      name: away.teamName || away.username,
      ovr: away.teamOvr,
      formation: away.formation,
      players: away.squad.slice(0, 11).map((s) => ({ name: s.name, position: s.position, overall: s.overall })),
      isHome: false,
    }

    const result = simulateMatch(homeTeam, awayTeam, Date.now() + c.currentRound * 1000 + c.currentMatchIndex)

    c.pendingResult = {
      homeId: home.id,
      awayId: away.id,
      homeName: home.teamName || home.username,
      awayName: away.teamName || away.username,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      events: result.events,
      streamedUpTo: 0,
    }

    const total = SIM_SPEEDS.find((s) => s.value === this.state!.settings.simSpeed)?.seconds ?? 15
    c.timer = { secondsLeft: total, total }

    this.broadcast('championship:match-start', {
      homeName: home.teamName || home.username,
      awayName: away.teamName || away.username,
      homeOvr: home.teamOvr,
      awayOvr: away.teamOvr,
      round: c.currentRound + 1,
      totalSeconds: total,
    })

    const msg = systemMessage(`Rodada ${c.currentRound + 1}: ${homeTeam.name} x ${awayTeam.name}`)
    await this.pushChat(msg)

    if (this.matchInterval) clearInterval(this.matchInterval)
    this.matchInterval = setInterval(() => this.onMatchTick(), 1000)
  }

  onMatchTick() {
    if (!this.state || !this.state.championship) {
      if (this.matchInterval) {
        clearInterval(this.matchInterval)
        this.matchInterval = null
      }
      return
    }
    const c = this.state.championship
    if (!c.timer || !c.pendingResult) {
      if (this.matchInterval) {
        clearInterval(this.matchInterval)
        this.matchInterval = null
      }
      return
    }

    c.timer.secondsLeft--
    const elapsed = c.timer.total - c.timer.secondsLeft
    const simMinute = Math.min(90, Math.round((elapsed / c.timer.total) * 90))

    const pending = c.pendingResult
    for (let i = pending.streamedUpTo; i < pending.events.length; i++) {
      if (pending.events[i].minute <= simMinute) {
        this.broadcast('championship:match-event', pending.events[i])
        pending.streamedUpTo = i + 1
      } else {
        break
      }
    }

    this.broadcast('championship:match-tick', { secondsLeft: c.timer.secondsLeft, simMinute })

    if (c.timer.secondsLeft <= 0) {
      if (this.matchInterval) {
        clearInterval(this.matchInterval)
        this.matchInterval = null
      }
      this.finishMatch()
    }
  }

  async finishMatch() {
    if (!this.state || !this.state.championship || !this.state.championship.pendingResult) return
    const c = this.state.championship
    const r = c.pendingResult!

    // Track top scorers
    if (!(c as any).topScorers) (c as any).topScorers = []
    const topScorers = (c as any).topScorers

    for (const e of r.events) {
      if (e.type === 'goal') {
        const teamName = e.team === 'home' ? r.homeName : r.awayName
        const existing = topScorers.find((t: any) => t.player === e.player && t.team === teamName)
        if (existing) existing.goals++
        else topScorers.push({ player: e.player, team: teamName, goals: 1 })
      }
    }

    topScorers.sort((x: any, y: any) => y.goals - x.goals)

    this.broadcast('championship:match-result', {
      homeName: r.homeName,
      awayName: r.awayName,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
    })

    // Update standings in DB
    const supabase = getEngineSupabase()
    await this.updateStanding(r.homeId, r.homeScore, r.awayScore)
    await this.updateStanding(r.awayId, r.awayScore, r.homeScore)

    await supabase.from('Match').insert({
      id: generateId(),
      roomId: this.state.roomId,
      round: c.currentRound + 1,
      homeParticipantId: r.homeId,
      awayParticipantId: r.awayId,
      homeName: r.homeName,
      awayName: r.awayName,
      homeOvr: this.state.participants.find((p) => p.id === r.homeId)?.teamOvr || 0,
      awayOvr: this.state.participants.find((p) => p.id === r.awayId)?.teamOvr || 0,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      events: JSON.stringify(r.events),
      stats: '{}',
      played: true,
      playedAt: new Date().toISOString(),
    })

    const standings = await this.fetchStandings()
    this.broadcast('championship:standings-updated', standings)
    this.broadcast('championship:state', this.publicChampionshipState())

    c.timer = null
    c.pendingResult = null
    c.currentMatchIndex++

    setTimeout(() => this.playNextMatch(), 2500)
  }

  async updateStanding(participantId: string, gf: number, ga: number) {
    if (!this.state) return
    const supabase = getEngineSupabase()

    const { data: standing } = await supabase
      .from('ChampionshipStanding')
      .select('*')
      .eq('roomId', this.state.roomId)
      .eq('participantId', participantId)
      .single()

    if (!standing) return

    const won = gf > ga ? 1 : 0
    const drawn = gf === ga ? 1 : 0
    const lost = gf < ga ? 1 : 0

    await supabase
      .from('ChampionshipStanding')
      .update({
        played: (standing.played || 0) + 1,
        won: (standing.won || 0) + won,
        drawn: (standing.drawn || 0) + drawn,
        lost: (standing.lost || 0) + lost,
        goalsFor: (standing.goalsFor || 0) + gf,
        goalsAgainst: (standing.goalsAgainst || 0) + ga,
        goalDifference: (standing.goalDifference || 0) + (gf - ga),
        points: (standing.points || 0) + (won * 3 + drawn),
      })
      .eq('id', standing.id)
  }

  async fetchStandings() {
    if (!this.state) return []
    const supabase = getEngineSupabase()
    const { data: standings } = await supabase
      .from('ChampionshipStanding')
      .select('*')
      .eq('roomId', this.state.roomId)

    if (!standings) return []

    return standings.sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
      return b.won - a.won
    })
  }

  async finishChampionship() {
    if (!this.state || !this.state.championship) return
    const c = this.state.championship
    c.finished = true
    this.state.status = 'finished'

    const supabase = getEngineSupabase()
    await supabase.from('Room').update({ status: 'finished' }).eq('id', this.state.roomId)

    const standings = await this.fetchStandings()
    const champion = standings[0]

    if (champion) {
      const msg = systemMessage(`🏆 CAMPEÃO: ${champion.name} com ${champion.points} pontos! Parabéns!`)
      await this.pushChat(msg)

      if (champion.participantId) {
        const part = this.state.participants.find((p) => p.id === champion.participantId)
        if (part && part.userId && !part.isBot) {
          const { data: ranking } = await supabase
            .from('UserRanking')
            .select('*')
            .eq('userId', part.userId)
            .maybeSingle()
          if (!ranking) {
            await supabase.from('UserRanking').insert({
              id: generateId(),
              userId: part.userId,
              username: part.username,
              country: 'Brasil',
              championships: 1,
              points: 100,
            })
          } else {
            await supabase
              .from('UserRanking')
              .update({
                championships: (ranking.championships || 0) + 1,
                points: (ranking.points || 0) + 100,
              })
              .eq('id', ranking.id)
          }
        }
      }
    }

    this.broadcast('championship:complete', {
      standings,
      champion: champion ? { id: champion.participantId, name: champion.name, points: champion.points } : null,
    })
    this.broadcast('room:status-changed', { status: 'finished' })
    this.broadcastRoomState()
  }

  restoreParticipantFromDB(p: any) {
    // Restore a participant from DB data into the engine state
    if (!this.state) return
    const existing = this.state.participants.find((pp) => pp.id === p.id)
    if (existing) {
      existing.online = true
      if (p.teamName) existing.teamName = p.teamName
      if (p.formation) existing.formation = p.formation
    }
  }
}
