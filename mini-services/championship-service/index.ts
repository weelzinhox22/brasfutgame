/**
 * Championship Real-time Service (Socket.io)
 *
 * Handles: rooms, chat, host migration, draft (dice + picks + bot auto-pick),
 * championship simulation loop (timer, streaming events, standings, auto-advance).
 *
 * Port: 3003. Caddy forwards "?XTransformPort=3003" to this port.
 */
import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

import {
  POSITIONS,
  DEFAULT_SETTINGS,
  SIM_SPEEDS,
  BOT_MODES,
} from '../../src/lib/types'
import type {
  Position,
  BotMode,
  RoomSettings,
  HistoricalPlayer,
  MatchEvent,
} from '../../src/lib/types'
import {
  simulateMatch,
  computeTeamOVR,
  FORMATION_ROLES,
} from '../../src/lib/simulation'
import type { TeamForSim } from '../../src/lib/simulation'
import { botPickPlayers, generateBotName } from '../../src/lib/bots'

const db = new PrismaClient({ log: ['error', 'warn'] })

const PORT = 3003

// ============================================================
// In-memory state
// ============================================================

interface ParticipantState {
  id: string
  userId: string | null
  username: string
  isBot: boolean
  botMode: BotMode | null
  isHost: boolean
  joinedAt: number
  socketId: string | null
  online: boolean
  teamName: string | null
  teamOvr: number
  squad: HistoricalPlayer[]
  formation: string
}

interface DraftState {
  order: string[] // participant ids
  currentTurnIndex: number
  currentRound: number // 1-indexed
  totalRounds: number
  picksPerTurn: number
  picks: { participantId: string; playerId: string; playerName: string; position: Position; overall: number; round: number }[]
  status: 'rolling' | 'choosing' | 'bot-thinking' | 'done'
  lastRoll: number | null
  currentOptions: HistoricalPlayer[]
  availablePlayers: HistoricalPlayer[]
}

interface MatchSlot {
  round: number
  homeId: string
  awayId: string
  homeName: string
  awayName: string
}

interface ChampionshipState {
  schedule: MatchSlot[][]
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

interface ActiveRoom {
  code: string
  roomId: string
  hostId: string
  settings: RoomSettings
  status: 'waiting' | 'draft' | 'playing' | 'finished'
  participants: ParticipantState[]
  chat: { id: string; username: string; content: string; type: 'user' | 'system' | 'bot'; createdAt: string }[]
  draft: DraftState | null
  championship: ChampionshipState | null
}

const rooms = new Map<string, ActiveRoom>()

// ============================================================
// Helpers
// ============================================================

const genId = () => Math.random().toString(36).slice(2, 11)
const simSeconds = (speed: string) => SIM_SPEEDS.find((s) => s.value === speed)?.seconds ?? 15

function getRoomByParticipant(userId: string): ActiveRoom | undefined {
  for (const r of rooms.values()) {
    if (r.participants.some((p) => p.userId === userId && !p.isBot)) return r
  }
  return undefined
}

function getRoomBySocket(socketId: string): { room: ActiveRoom; participant: ParticipantState } | null {
  for (const r of rooms.values()) {
    const p = r.participants.find((pp) => pp.socketId === socketId)
    if (p) return { room: r, participant: p }
  }
  return null
}

function publicParticipant(p: ParticipantState) {
  return {
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
  }
}

function publicRoom(r: ActiveRoom) {
  return {
    code: r.code,
    roomId: r.roomId,
    hostId: r.hostId,
    settings: r.settings,
    status: r.status,
    participants: r.participants.map(publicParticipant),
    chat: r.chat.slice(-100),
  }
}

function broadcastRoomState(io: Server, room: ActiveRoom) {
  io.to(`room:${room.code}`).emit('room:state', publicRoom(room))
}

function systemMessage(room: ActiveRoom, content: string) {
  const msg = { id: genId(), username: 'Sistema', content, type: 'system' as const, createdAt: new Date().toISOString() }
  room.chat.push(msg)
  return msg
}

function pushChat(room: ActiveRoom, msg: ReturnType<typeof systemMessage> | { id: string; username: string; content: string; type: 'user' | 'system' | 'bot'; createdAt: string }) {
  room.chat.push(msg)
  // persist (fire and forget)
  db.chatMessage.create({
    data: { roomId: room.roomId, username: msg.username, content: msg.content, type: msg.type },
  }).catch(() => {})
}

// ============================================================
// Host migration
// ============================================================
function migrateHost(io: Server, room: ActiveRoom) {
  const humans = room.participants.filter((p) => !p.isBot)
  if (humans.length === 0) {
    // no humans left -> assign host to oldest bot (per spec, never to bot, but if no humans, keep room alive with bot as nominal host)
    const bots = [...room.participants].sort((a, b) => a.joinedAt - b.joinedAt)
    if (bots.length > 0) {
      bots.forEach((b) => (b.isHost = false))
      bots[0].isHost = true
      room.hostId = bots[0].userId || bots[0].id
    }
  } else {
    // priority: oldest human, then second oldest, etc.
    humans.sort((a, b) => a.joinedAt - b.joinedAt)
    room.participants.forEach((p) => (p.isHost = false))
    humans[0].isHost = true
    room.hostId = humans[0].userId || humans[0].id
  }
  const newHost = room.participants.find((p) => p.isHost)
  if (newHost) {
    const msg = systemMessage(room, `Host migrado para ${newHost.username} (jogador humano mais antigo).`)
    pushChat(room, msg)
    io.to(`room:${room.code}`).emit('room:host-changed', { newHostId: room.hostId, newHostName: newHost.username })
  }
}

// ============================================================
// Room loading from DB
// ============================================================
async function loadRoomFromDB(code: string): Promise<ActiveRoom | null> {
  const dbRoom = await db.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      participants: { orderBy: { joinedAt: 'asc' } },
    },
  })
  if (!dbRoom) return null

  const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(dbRoom.settings || '{}') }

  const participants: ParticipantState[] = dbRoom.participants.map((p) => ({
    id: p.id,
    userId: p.userId,
    username: p.username,
    isBot: p.isBot,
    botMode: (p.botMode as BotMode) || null,
    isHost: p.isHost,
    joinedAt: p.joinedAt.getTime(),
    socketId: null,
    online: p.isBot, // bots always "online"
    teamName: p.teamName,
    teamOvr: p.teamOvr,
    squad: [],
    formation: '4-3-3',
  }))

  return {
    code: dbRoom.code,
    roomId: dbRoom.id,
    hostId: dbRoom.hostId,
    settings,
    status: dbRoom.status as ActiveRoom['status'],
    participants,
    chat: [],
    draft: null,
    championship: null,
  }
}

// ============================================================
// Draft logic
// ============================================================

function filterPlayersForSettings(players: HistoricalPlayer[], settings: RoomSettings): HistoricalPlayer[] {
  return players.filter((p) => {
    if (settings.teamFilter === 'brazilian') return p.country === 'Brasil' || p.country === 'Brazil'
    if (settings.teamFilter === 'international') return p.country !== 'Brasil' && p.country !== 'Brazil'
    return true
  })
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

function generateOptions(available: HistoricalPlayer[], squad: HistoricalPlayer[], formation: string, roll: number): HistoricalPlayer[] {
  const needed = neededPositions(squad, formation)
  // roll 1-6: higher roll => access to higher-overall players
  const ceil = 60 + roll * 6 // roll1->66, roll6->96
  const floor = Math.max(50, ceil - 18)

  const pool = available.filter((p) => p.overall <= ceil && p.overall >= floor)

  // As needed positions get filled, progressively mix in OTHER positions.
  // ratio of needed vs other options depends on how many slots remain unfilled.
  const formationRoles = FORMATION_ROLES[formation] || FORMATION_ROLES['4-3-3']
  const totalSlots = formationRoles.length // 11
  const filledSlots = totalSlots - needed.length
  const fillRatio = filledSlots / totalSlots // 0 at start -> 1 when full

  // shuffle helper
  const sh = <T,>(arr: T[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const neededPool = pool.filter((p) => needed.includes(p.position))
  const otherPool = pool.filter((p) => !needed.includes(p.position))

  // 8 options total. Early on, mostly needed. As squad fills, more "other".
  // needed slots: max(2, round(6 * (1 - fillRatio)))  -> 6 at start, 2 near full, min 2
  // If no needed positions remain (squad full), all 8 are "other" (bench).
  let neededCount: number
  if (needed.length === 0) {
    neededCount = 0
  } else {
    neededCount = Math.max(2, Math.round(6 * (1 - fillRatio)))
    neededCount = Math.min(neededCount, neededPool.length, 8)
  }
  const otherCount = Math.min(8 - neededCount, otherPool.length)

  const neededPicked = sh(neededPool).slice(0, neededCount)
  const otherPicked = sh(otherPool).slice(0, otherCount)
  const options = sh([...neededPicked, ...otherPicked])
  return options.sort((a, b) => b.overall - a.overall)
}

async function startDraft(io: Server, room: ActiveRoom) {
  // load players
  const allPlayers = await db.historicalPlayer.findMany()
  const parsed: HistoricalPlayer[] = allPlayers.map((p) => ({
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
  const available = filterPlayersForSettings(parsed, room.settings)

  // draft order: shuffle participants
  const order = [...room.participants].sort(() => Math.random() - 0.5).map((p) => p.id)
  const totalRounds = 6 // 6 rounds * 2 picks = 12 players (11 starters + 1 sub)
  const picksPerTurn = 2

  room.draft = {
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

  room.status = 'draft'
  await db.room.update({ where: { id: room.roomId }, data: { status: 'draft' } })
  const msg = systemMessage(room, 'Draft iniciado! Ordem sorteada. Cada participante rola o dado e escolhe 2 jogadores por turno.')
  pushChat(room, msg)
  emitDraftState(io, room)
  io.to(`room:${room.code}`).emit('room:status-changed', { status: 'draft' })
  broadcastRoomState(io, room)

  // start first turn
  await advanceDraftTurn(io, room)
}

function publicDraftState(room: ActiveRoom, viewerParticipantId?: string) {
  const d = room.draft!
  const currentId = d.order[d.currentTurnIndex]
  // If privatePicks is on, only the current turn's participant sees the options
  const hideOptions = room.settings.privatePicks && viewerParticipantId !== currentId
  return {
    roomId: room.roomId,
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
      : d.currentOptions.map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, country: p.country, club: p.club, year: p.year, decade: p.decade, photoColor: p.photoColor, stats: p.stats })),
    squadCounts: room.participants.map((p) => ({ id: p.id, count: p.squad.length, positions: p.squad.map((s) => s.position) })),
    squads: room.participants.map((p) => ({
      id: p.id,
      username: p.username,
      formation: p.formation,
      squad: p.squad.map((s) => ({ id: s.id, name: s.name, position: s.position, overall: s.overall, country: s.country, club: s.club, year: s.year, decade: s.decade, photoColor: s.photoColor, stats: s.stats })),
    })),
    hideOvr: room.settings.hideOvr,
    privatePicks: room.settings.privatePicks,
  }
}

// Emit draft:state to each participant with their own view (handles privatePicks)
function emitDraftState(io: Server, room: ActiveRoom) {
  if (!room.settings.privatePicks) {
    io.to(`room:${room.code}`).emit('draft:state', publicDraftState(room))
    return
  }
  // Send personalized state to each connected participant
  for (const p of room.participants) {
    if (p.socketId) {
      io.to(p.socketId).emit('draft:state', publicDraftState(room, p.id))
    }
  }
}

async function advanceDraftTurn(io: Server, room: ActiveRoom) {
  const d = room.draft!
  // check completion
  const allDone = room.participants.every((p) => p.squad.length >= d.totalRounds * d.picksPerTurn)
  if (allDone || d.currentRound > d.totalRounds) {
    return finishDraft(io, room)
  }

  const currentId = d.order[d.currentTurnIndex]
  const participant = room.participants.find((p) => p.id === currentId)
  if (!participant) {
    // skip
    d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
    if (d.currentTurnIndex === 0) d.currentRound++
    return advanceDraftTurn(io, room)
  }

  d.status = participant.isBot ? 'bot-thinking' : 'rolling'
  d.lastRoll = null
  d.currentOptions = []
  io.to(`room:${room.code}`).emit('draft:turn', {
    participantId: currentId,
    round: d.currentRound,
    pickIndex: d.currentTurnIndex,
    isBot: participant.isBot,
  })
  emitDraftState(io, room)

  if (participant.isBot) {
    // bot auto-plays after a short delay (for animation)
    setTimeout(() => botDraftTurn(io, room, participant), 1800)
  }
}

async function botDraftTurn(io: Server, room: ActiveRoom, participant: ParticipantState) {
  const d = room.draft!
  // bot rolls
  const roll = Math.floor(Math.random() * 6) + 1
  d.lastRoll = roll
  io.to(`room:${room.code}`).emit('draft:roll-result', { participantId: participant.id, roll })
  await delay(900)

  // generate options
  const options = generateOptions(d.availablePlayers, participant.squad, participant.formation, roll)
  d.currentOptions = options
  io.to(`room:${room.code}`).emit('draft:options', { participantId: participant.id, options: options.map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, country: p.country, club: p.club, year: p.year, photoColor: p.photoColor })) })
  await delay(1200)

  // bot picks
  const picks = botPickPlayers(options, participant.squad, participant.botMode || 'balanced', participant.formation, d.picksPerTurn)
  applyPicks(room, participant, picks, d.currentRound)
  io.to(`room:${room.code}`).emit('draft:bot-pick', {
    participantId: participant.id,
    players: picks.map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, country: p.country, club: p.club, year: p.year, photoColor: p.photoColor })),
  })
  // emit updated state so all clients see the new squad
  emitDraftState(io, room)
  await delay(800)

  // advance
  d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
  if (d.currentTurnIndex === 0) d.currentRound++
  await advanceDraftTurn(io, room)
}

function applyPicks(room: ActiveRoom, participant: ParticipantState, picks: HistoricalPlayer[], round: number) {
  const d = room.draft!
  for (const pick of picks) {
    participant.squad.push(pick)
    d.picks.push({ participantId: participant.id, playerId: pick.id, playerName: pick.name, position: pick.position, overall: pick.overall, round })
    // remove from available
    d.availablePlayers = d.availablePlayers.filter((p) => p.id !== pick.id)
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function finishDraft(io: Server, room: ActiveRoom) {
  const d = room.draft!
  d.status = 'done'
  // compute team OVR + persist squads
  for (const p of room.participants) {
    const { ovr } = computeTeamOVR(p.squad.map((s) => ({ overall: s.overall, position: s.position })), p.formation)
    p.teamOvr = ovr
    if (!p.teamName) p.teamName = `${p.username} FC`
    await db.roomParticipant.update({
      where: { id: p.id },
      data: {
        teamName: p.teamName,
        teamOvr: ovr,
        squad: JSON.stringify(p.squad.map((s) => s.id)),
      },
    })
  }
  const msg = systemMessage(room, 'Draft concluído! Times montados. O host pode iniciar o campeonato.')
  pushChat(room, msg)
  io.to(`room:${room.code}`).emit('draft:complete', {
    squads: room.participants.map((p) => ({ id: p.id, username: p.username, teamName: p.teamName, teamOvr: p.teamOvr, formation: p.formation, squad: p.squad })),
  })
  emitDraftState(io, room)
  broadcastRoomState(io, room)
}

// ============================================================
// Championship logic
// ============================================================

function generateRoundRobin(participants: ParticipantState[]): MatchSlot[][] {
  // circle method
  const teams = participants.filter((p) => p.squad.length >= 7) // need at least 7 players
  if (teams.length < 2) return []
  const n = teams.length
  const rounds: MatchSlot[][] = []
  const arr = teams.map((p) => p)
  const useGhost = n % 2 !== 0
  if (useGhost) arr.push(null as any)
  const N = arr.length
  const totalRounds = N - 1
  for (let r = 0; r < totalRounds; r++) {
    const matches: MatchSlot[] = []
    for (let i = 0; i < N / 2; i++) {
      const a = arr[i]
      const b = arr[N - 1 - i]
      if (a && b) {
        // alternate home/away for fairness
        const home = r % 2 === 0 ? a : b
        const away = r % 2 === 0 ? b : a
        matches.push({ round: r + 1, homeId: home.id, awayId: away.id, homeName: home.teamName || home.username, awayName: away.teamName || away.username })
      }
    }
    rounds.push(matches)
    // rotate (keep first fixed)
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop()!)
    arr.splice(0, arr.length, fixed, ...rest)
  }
  return rounds
}

async function startChampionship(io: Server, room: ActiveRoom) {
  const baseSchedule = generateRoundRobin(room.participants)
  if (baseSchedule.length === 0) {
    const msg = systemMessage(room, 'Não há participantes suficientes com elenco completo para iniciar o campeonato.')
    pushChat(room, msg)
    io.to(`room:${room.code}`).emit('chat:message', msg)
    return
  }

  // Build full schedule based on competition format
  let fullSchedule: MatchSlot[][] = []
  const format = room.settings.competitionFormat || 'custom'

  if (format === 'brasileirao') {
    // Full double round-robin: each team plays every other twice (home & away)
    // = (n-1)*2 rounds. baseSchedule is single round-robin; replicate with home/away swap.
    for (let i = 0; i < 2; i++) {
      for (const round of baseSchedule) {
        const r = round.map((m) => (i === 1 ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName } : m))
        fullSchedule.push(r)
      }
    }
  } else if (format === 'ucl-2026') {
    // UCL 2026 league phase: 36 teams, each plays 8 matches (4 home, 4 away) against a seeded draw.
    // We approximate: take baseSchedule, pick 8 rounds total (or all if fewer), swap home/away for second half.
    const totalRounds = Math.min(8, baseSchedule.length * 2)
    for (let r = 0; r < totalRounds; r++) {
      const baseRound = baseSchedule[r % baseSchedule.length]
      const swap = r >= baseSchedule.length
      const round = baseRound.map((m) => (swap ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName } : m))
      fullSchedule.push(round)
    }
  } else {
    // custom: respect settings.rounds (1 = single, 2 = double, 3 = triple)
    const rep = Math.max(1, Math.min(room.settings.rounds || 1, 3))
    for (let i = 0; i < rep; i++) {
      for (const round of baseSchedule) {
        const r = round.map((m) => (i % 2 === 1 ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName } : m))
        fullSchedule.push(r)
      }
    }
  }

  room.championship = {
    schedule: fullSchedule,
    currentRound: 0,
    currentMatchIndex: 0,
    timer: null,
    pendingResult: null,
    finished: false,
  }
  room.status = 'playing'
  await db.room.update({ where: { id: room.roomId }, data: { status: 'playing' } })

  // init standings in DB
  for (const p of room.participants) {
    if (p.squad.length >= 7) {
      await db.championshipStanding.upsert({
        where: { roomId_participantId: { roomId: room.roomId, participantId: p.id } },
        create: { roomId: room.roomId, participantId: p.id, name: p.teamName || p.username },
        update: {},
      })
    }
  }

  const msg = systemMessage(room, `Campeonato iniciado! ${fullSchedule.length} rodada(s), ${fullSchedule.reduce((a, r) => a + r.length, 0)} partidas.`)
  pushChat(room, msg)
  io.to(`room:${room.code}`).emit('room:status-changed', { status: 'playing' })
  io.to(`room:${room.code}`).emit('championship:state', publicChampionshipState(room))
  broadcastRoomState(io, room)

  // start first match
  await playNextMatch(io, room)
}

function publicChampionshipState(room: ActiveRoom) {
  const c = room.championship
  if (!c) return null
  const currentRoundMatches = c.schedule[c.currentRound] || []
  return {
    schedule: c.schedule.map((round) => round.map((m) => ({ homeName: m.homeName, awayName: m.awayName, round: m.round }))),
    currentRound: c.currentRound,
    currentMatchIndex: c.currentMatchIndex,
    currentRoundMatches,
    timer: c.timer,
    finished: c.finished,
    standings: room.participants.map((p) => ({ id: p.id, name: p.teamName || p.username, ovr: p.teamOvr })),
  }
}

async function playNextMatch(io: Server, room: ActiveRoom) {
  const c = room.championship!
  if (c.currentRound >= c.schedule.length) {
    return finishChampionship(io, room)
  }
  const round = c.schedule[c.currentRound]
  if (c.currentMatchIndex >= round.length) {
    // round complete
    io.to(`room:${room.code}`).emit('championship:round-complete', { round: c.currentRound + 1 })
    c.currentRound++
    c.currentMatchIndex = 0
    return playNextMatch(io, room)
  }

  const slot = round[c.currentMatchIndex]
  const home = room.participants.find((p) => p.id === slot.homeId)
  const away = room.participants.find((p) => p.id === slot.awayId)
  if (!home || !away) {
    c.currentMatchIndex++
    return playNextMatch(io, room)
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
    events: result.events.sort((a, b) => a.minute - b.minute),
    streamedUpTo: 0,
  }

  const total = simSeconds(room.settings.simSpeed)
  c.timer = { secondsLeft: total, total }

  io.to(`room:${room.code}`).emit('championship:match-start', {
    homeName: home.teamName || home.username,
    awayName: away.teamName || away.username,
    homeOvr: home.teamOvr,
    awayOvr: away.teamOvr,
    round: c.currentRound + 1,
    totalSeconds: total,
  })

  const msg = systemMessage(room, `Rodada ${c.currentRound + 1}: ${home.teamName || home.username} x ${away.teamName || away.username}`)
  pushChat(room, msg)

  // tick every second
  const tick = setInterval(() => onMatchTick(io, room, tick), 1000)
}

async function onMatchTick(io: Server, room: ActiveRoom, tick: NodeJS.Timeout) {
  const c = room.championship!
  if (!c.timer || !c.pendingResult) {
    clearInterval(tick)
    return
  }
  c.timer.secondsLeft--
  const elapsed = c.timer.total - c.timer.secondsLeft
  const simMinute = Math.min(90, Math.round((elapsed / c.timer.total) * 90))

  // stream events whose minute <= simMinute and not yet streamed
  const pending = c.pendingResult
  const newEvents = pending.events.filter((e) => e.minute <= simMinute && pending.events.indexOf(e) >= pending.streamedUpTo)
  // better: track by index
  for (let i = pending.streamedUpTo; i < pending.events.length; i++) {
    if (pending.events[i].minute <= simMinute) {
      io.to(`room:${room.code}`).emit('championship:match-event', pending.events[i])
      pending.streamedUpTo = i + 1
    } else {
      break
    }
  }

  io.to(`room:${room.code}`).emit('championship:match-tick', { secondsLeft: c.timer.secondsLeft, simMinute })

  if (c.timer.secondsLeft <= 0) {
    clearInterval(tick)
    await finishMatch(io, room)
  }
}

async function finishMatch(io: Server, room: ActiveRoom) {
  const c = room.championship!
  const r = c.pendingResult!
  const home = room.participants.find((p) => p.id === r.homeId)!
  const away = room.participants.find((p) => p.id === r.awayId)!

  io.to(`room:${room.code}`).emit('championship:match-result', {
    homeName: r.homeName,
    awayName: r.awayName,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  })

  // update standings
  const homeGoals = r.homeScore
  const awayGoals = r.awayScore
  await updateStanding(room, home.id, homeGoals, awayGoals)
  await updateStanding(room, away.id, awayGoals, homeGoals)

  // persist match
  await db.match.create({
    data: {
      roomId: room.roomId,
      round: c.currentRound + 1,
      homeParticipantId: home.id,
      awayParticipantId: away.id,
      homeName: r.homeName,
      awayName: r.awayName,
      homeOvr: home.teamOvr,
      awayOvr: away.teamOvr,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      events: JSON.stringify(r.events),
      stats: '{}',
      played: true,
      playedAt: new Date(),
    },
  })

  // broadcast updated standings
  const standings = await fetchStandings(room)
  io.to(`room:${room.code}`).emit('championship:standings-updated', standings)

  c.timer = null
  c.pendingResult = null
  c.currentMatchIndex++

  // auto-advance after delay
  setTimeout(() => playNextMatch(io, room), 2500)
}

async function updateStanding(room: ActiveRoom, participantId: string, gf: number, ga: number) {
  const standing = await db.championshipStanding.findUnique({
    where: { roomId_participantId: { roomId: room.roomId, participantId } },
  })
  if (!standing) return
  const won = gf > ga ? 1 : 0
  const drawn = gf === ga ? 1 : 0
  const lost = gf < ga ? 1 : 0
  await db.championshipStanding.update({
    where: { id: standing.id },
    data: {
      played: { increment: 1 },
      won: { increment: won },
      drawn: { increment: drawn },
      lost: { increment: lost },
      goalsFor: { increment: gf },
      goalsAgainst: { increment: ga },
      goalDifference: { increment: gf - ga },
      points: { increment: won * 3 + drawn },
    },
  })
}

async function fetchStandings(room: ActiveRoom) {
  const rows = await db.championshipStanding.findMany({
    where: { roomId: room.roomId },
    orderBy: [{ points: 'desc' }, { goalDifference: 'desc' }, { goalsFor: 'desc' }, { won: 'desc' }],
  })
  return rows
}

async function finishChampionship(io: Server, room: ActiveRoom) {
  const c = room.championship!
  c.finished = true
  room.status = 'finished'
  await db.room.update({ where: { id: room.roomId }, data: { status: 'finished' } })

  const standings = await fetchStandings(room)
  const champion = standings[0]
  if (champion) {
    const msg = systemMessage(room, `🏆 CAMPEÃO: ${champion.name} com ${champion.points} pontos! Parabéns!`)
    pushChat(room, msg)
    // award ranking points to champion's user
    if (champion.participantId) {
      const part = room.participants.find((p) => p.id === champion.participantId)
      if (part && part.userId && !part.isBot) {
        await db.userRanking.upsert({
          where: { userId: part.userId },
          create: { userId: part.userId, username: part.username, country: 'Brasil', championships: 1, points: 100 },
          update: { championships: { increment: 1 }, points: { increment: 100 } },
        })
      }
    }
  }
  io.to(`room:${room.code}`).emit('championship:complete', { standings, champion: champion ? { id: champion.participantId, name: champion.name, points: champion.points } : null })
  io.to(`room:${room.code}`).emit('room:status-changed', { status: 'finished' })
  broadcastRoomState(io, room)
}

// ============================================================
// Bots management
// ============================================================
async function addBots(io: Server, room: ActiveRoom, count: number) {
  const humans = room.participants.filter((p) => !p.isBot).length
  const bots = room.participants.filter((p) => p.isBot).length
  const slots = Math.max(0, Math.min(count, room.settings.maxPlayers - humans - bots))
  for (let i = 0; i < slots; i++) {
    const name = generateBotName(Date.now() + i)
    const created = await db.roomParticipant.create({
      data: {
        roomId: room.roomId,
        userId: null,
        username: name,
        isBot: true,
        botMode: room.settings.botMode,
        isHost: false,
      },
    })
    room.participants.push({
      id: created.id,
      userId: null,
      username: name,
      isBot: true,
      botMode: room.settings.botMode,
      isHost: false,
      joinedAt: created.joinedAt.getTime(),
      socketId: null,
      online: true,
      teamName: null,
      teamOvr: 0,
      squad: [],
      formation: '4-3-3',
    })
    const msg = systemMessage(room, `${name} (bot) entrou na sala.`)
    pushChat(room, msg)
  }
  broadcastRoomState(io, room)
}

async function removeBot(io: Server, room: ActiveRoom, participantId: string) {
  const p = room.participants.find((pp) => pp.id === participantId)
  if (!p || !p.isBot) return
  room.participants = room.participants.filter((pp) => pp.id !== participantId)
  await db.roomParticipant.delete({ where: { id: participantId } })
  const msg = systemMessage(room, `${p.username} (bot) removido.`)
  pushChat(room, msg)
  broadcastRoomState(io, room)
}

// ============================================================
// Socket server
// ============================================================
const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)

  socket.on('room:join', async (data: { code: string; userId: string; username: string; password?: string }) => {
    try {
      const code = data.code.toUpperCase()
      let room = rooms.get(code)
      if (!room) {
        room = await loadRoomFromDB(code)
        if (!room) {
          socket.emit('room:error', { message: 'Sala não encontrada.' })
          return
        }
        rooms.set(code, room)
      }
      // password check
      const dbRoom = await db.room.findUnique({ where: { code } })
      if (dbRoom?.password && dbRoom.password !== data.password) {
        socket.emit('room:error', { message: 'Senha incorreta.' })
        return
      }

      // find existing participant (reconnect) or create
      let part = room.participants.find((p) => p.userId === data.userId && !p.isBot)
      if (part) {
        part.socketId = socket.id
        part.online = true
      } else {
        const humans = room.participants.filter((p) => !p.isBot).length
        if (humans >= room.settings.maxPlayers) {
          socket.emit('room:error', { message: 'Sala cheia.' })
          return
        }
        const created = await db.roomParticipant.create({
          data: {
            roomId: room.roomId,
            userId: data.userId,
            username: data.username,
            isBot: false,
            isHost: false,
          },
        })
        part = {
          id: created.id,
          userId: data.userId,
          username: data.username,
          isBot: false,
          botMode: null,
          isHost: false,
          joinedAt: created.joinedAt.getTime(),
          socketId: socket.id,
          online: true,
          teamName: null,
          teamOvr: 0,
          squad: [],
          formation: '4-3-3',
        }
        room.participants.push(part)
        const msg = systemMessage(room, `${data.username} entrou na sala.`)
        pushChat(room, msg)
      }

      socket.join(`room:${code}`)
      socket.data = { code, userId: data.userId, participantId: part.id }
      socket.emit('room:joined', { code, participantId: part.id })
      broadcastRoomState(io, room)

      // if in draft, send draft state (personalized for privatePicks)
      if (room.draft) socket.emit('draft:state', publicDraftState(room, part.id))
      if (room.championship) {
        socket.emit('championship:state', publicChampionshipState(room))
        const standings = await fetchStandings(room)
        socket.emit('championship:standings-updated', standings)
      }
    } catch (e) {
      console.error('[room:join] error', e)
      socket.emit('room:error', { message: 'Erro ao entrar na sala.' })
    }
  })

  socket.on('chat:message', (data: { content: string }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    const { room, participant } = ctx
    const content = (data.content || '').slice(0, 500)
    if (!content.trim()) return
    const msg = { id: genId(), username: participant.username, content, type: 'user' as const, createdAt: new Date().toISOString() }
    pushChat(room, msg)
    io.to(`room:${room.code}`).emit('chat:message', msg)
  })

  socket.on('room:update-settings', async (data: { settings: Partial<RoomSettings> }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    const { room, participant } = ctx
    if (!participant.isHost) {
      socket.emit('room:error', { message: 'Apenas o host pode alterar configurações.' })
      return
    }
    room.settings = { ...room.settings, ...data.settings }
    await db.room.update({ where: { id: room.roomId }, data: { settings: JSON.stringify(room.settings) } })
    io.to(`room:${room.code}`).emit('room:settings-updated', { settings: room.settings })
    broadcastRoomState(io, room)
  })

  socket.on('room:add-bots', async (data: { count: number }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    if (!ctx.participant.isHost) return
    await addBots(io, ctx.room, data.count || 1)
  })

  socket.on('room:remove-bot', async (data: { participantId: string }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    if (!ctx.participant.isHost) return
    await removeBot(io, ctx.room, data.participantId)
  })

  socket.on('room:set-formation', (data: { formation: string }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    if (!FORMATION_ROLES[data.formation]) return
    ctx.participant.formation = data.formation
    broadcastRoomState(io, ctx.room)
  })

  socket.on('room:start-draft', async () => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    if (!ctx.participant.isHost) return
    if (ctx.room.participants.length < 2) {
      socket.emit('room:error', { message: 'É necessário pelo menos 2 participantes.' })
      return
    }
    await startDraft(io, ctx.room)
  })

  socket.on('draft:roll', async () => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx || !ctx.room.draft) return
    const d = ctx.room.draft
    const currentId = d.order[d.currentTurnIndex]
    if (currentId !== ctx.participant.id) {
      socket.emit('room:error', { message: 'Não é sua vez.' })
      return
    }
    if (d.status !== 'rolling') return
    const roll = Math.floor(Math.random() * 6) + 1
    d.lastRoll = roll
    d.status = 'choosing'
    io.to(`room:${ctx.room.code}`).emit('draft:roll-result', { participantId: ctx.participant.id, roll })
    // generate options
    const options = generateOptions(d.availablePlayers, ctx.participant.squad, ctx.participant.formation, roll)
    d.currentOptions = options
    io.to(`room:${ctx.room.code}`).emit('draft:options', {
      participantId: ctx.participant.id,
      options: options.map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, country: p.country, club: p.club, year: p.year, photoColor: p.photoColor })),
    })
    emitDraftState(io, ctx.room)
  })

  socket.on('draft:pick', async (data: { playerIds: string[] }) => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx || !ctx.room.draft) return
    const d = ctx.room.draft
    const currentId = d.order[d.currentTurnIndex]
    if (currentId !== ctx.participant.id) return
    if (d.status !== 'choosing') return

    const wanted = (data.playerIds || []).slice(0, d.picksPerTurn)
    const picks: HistoricalPlayer[] = []
    for (const id of wanted) {
      const p = d.currentOptions.find((pp) => pp.id === id)
      if (p && !ctx.participant.squad.find((s) => s.id === id)) picks.push(p)
    }
    if (picks.length === 0) {
      socket.emit('room:error', { message: 'Escolha pelo menos 1 jogador.' })
      return
    }
    applyPicks(ctx.room, ctx.participant, picks, d.currentRound)
    io.to(`room:${ctx.room.code}`).emit('draft:picks', {
      participantId: ctx.participant.id,
      players: picks.map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, country: p.country, club: p.club, year: p.year, photoColor: p.photoColor })),
    })
    emitDraftState(io, ctx.room)

    // advance
    d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
    if (d.currentTurnIndex === 0) d.currentRound++
    await delay(600)
    await advanceDraftTurn(io, ctx.room)
  })

  socket.on('championship:start', async () => {
    const ctx = getRoomBySocket(socket.id)
    if (!ctx) return
    if (!ctx.participant.isHost) return
    if (ctx.room.status !== 'draft') {
      socket.emit('room:error', { message: 'Conclua o draft primeiro.' })
      return
    }
    await startChampionship(io, ctx.room)
  })

  socket.on('room:leave', () => {
    handleDisconnect(io, socket)
  })

  socket.on('disconnect', () => {
    handleDisconnect(io, socket)
  })

  socket.on('error', (err) => console.error('[socket error]', err))
})

function handleDisconnect(io: Server, socket: any) {
  const ctx = getRoomBySocket(socket.id)
  if (!ctx) return
  const { room, participant } = ctx
  participant.socketId = null
  participant.online = false
  if (participant.isHost) {
    migrateHost(io, room)
  }
  if (!participant.isBot) {
    const msg = systemMessage(room, `${participant.username} desconectou.`)
    pushChat(room, msg)
    io.to(`room:${room.code}`).emit('chat:message', msg)
  }
  broadcastRoomState(io, room)
}

httpServer.listen(PORT, () => {
  console.log(`[championship-service] Socket.io running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
