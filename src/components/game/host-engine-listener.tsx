'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient, subscribeToChannel } from '@/lib/supabase-client'
import { useGameStore } from '@/store/game-store'
import { useUserStore } from '@/store/user-store'
import { HostEngine, createEngineRoom, systemMessage } from '@/lib/host-engine'
import { useSocket } from '@/lib/socket-context'
import { computeTeamOVR, FORMATION_ROLES } from '@/lib/simulation'
import type { HistoricalPlayer, Position } from '@/lib/types'

/**
 * This component mounts in the layout and listens for host-command events
 * on the current Realtime channel. When the current client is the host,
 * it executes game logic (draft, championship, simulation) and broadcasts results.
 */
export function HostEngineListener() {
  const { currentChannel, broadcast } = useSocket()
  const engineRef = useRef<HostEngine | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const initializedRef = useRef(false)

  // Initialize the engine when entering a room channel
  useEffect(() => {
    if (!currentChannel || currentChannel === 'lobby') {
      if (engineRef.current) {
        if (engineRef.current.matchInterval) {
          clearInterval(engineRef.current.matchInterval)
        }
        engineRef.current = null
      }
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      initializedRef.current = false
      return
    }

    // Create engine
    const bFn = (event: string, payload: any) => broadcast(event, payload)
    const engine = new HostEngine(bFn)
    engineRef.current = engine

    // Initialize engine from DB
    initEngineForRoom(currentChannel, engineRef)

    // Define all handlers for the room channel
    const handlers: Record<string, (payload: any) => void> = {
      // === HOST COMMANDS ===
      'room:start-draft': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) await initEngineForRoom(currentChannel, engineRef)
        try { await engineRef.current?.startDraft() }
        catch (e) { console.error('[HostEngine] startDraft:', e) }
      },
      'room:start-auto-draft': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) await initEngineForRoom(currentChannel, engineRef)
        try { await engineRef.current?.startAutoDraft() }
        catch (e) { console.error('[HostEngine] startAutoDraft:', e) }
      },
      'championship:start': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) await initEngineForRoom(currentChannel, engineRef)
        try { await engineRef.current?.startChampionship() }
        catch (e) { console.error('[HostEngine] startChampionship:', e) }
      },
      'room:restart': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) return
        const eng = engineRef.current
        try {
          eng.state.status = 'waiting'
          eng.state.draft = null
          eng.state.championship = null
          eng.state.champion = null
          for (const p of eng.state.participants) {
            p.squad = []
            p.teamName = null
            p.teamOvr = 0
            p.formation = '4-3-3'
          }
          const supabase = getSupabaseClient()
          await supabase.from('Room').update({ status: 'waiting' }).eq('id', eng.state.roomId)
          broadcast('room:status-changed', { status: 'waiting' })
          broadcast('room:restarted', {})
          broadcast('room:state', eng.publicRoom())
        } catch (e) { console.error('[HostEngine] restart:', e) }
      },
      'room:add-bots': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) await initEngineForRoom(currentChannel, engineRef)
        try { await engineRef.current?.addBots(payload?.count || 1) }
        catch (e) { console.error('[HostEngine] addBots:', e) }
      },
      'room:remove-bot': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) await initEngineForRoom(currentChannel, engineRef)
        try { await engineRef.current?.removeBot(payload?.participantId) }
        catch (e) { console.error('[HostEngine] removeBot:', e) }
      },
      'room:update-settings': async (payload) => {
        if (!await isCurrentUserHost()) return
        if (!engineRef.current?.state) return
        const eng = engineRef.current
        if (eng.state) {
          eng.state.settings = { ...eng.state.settings, ...payload.settings }
          const supabase = getSupabaseClient()
          await supabase.from('Room').update({ settings: JSON.stringify(eng.state.settings) }).eq('id', eng.state.roomId)
          broadcast('room:settings-updated', { settings: eng.state.settings })
          broadcast('room:state', eng.publicRoom())
        }
      },
      'room:set-formation': async (payload) => {
        if (!engineRef.current?.state) return
        const p = engineRef.current.state.participants.find((pp) => pp.id === payload.participantId)
        if (p && FORMATION_ROLES[payload.formation]) {
          p.formation = payload.formation
          broadcast('room:state', engineRef.current.publicRoom())
        }
      },

      // === DRAFT EVENTS ===
      'draft:roll': async (payload) => {
        if (!engineRef.current?.state || !engineRef.current?.state.draft) return
        const eng = engineRef.current
        const d = eng.state.draft
        if (d.status !== 'rolling') return

        // Generate roll (1-6)
        const roll = Math.floor(Math.random() * 6) + 1
        d.lastRoll = roll
        d.status = 'choosing'

        // Broadcast roll result
        broadcast('draft:roll-result', { participantId: payload?.participantId, roll })

        // Generate player options
        const participant = eng.state.participants.find((p) => p.id === payload?.participantId)
        if (!participant) return

        const options = generateOptions(
          d.availablePlayers,
          participant.squad,
          participant.formation,
          roll
        )
        d.currentOptions = options

        broadcast('draft:options', {
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

        eng.emitDraftState()
      },
      'draft:pick': async (payload) => {
        if (!engineRef.current?.state || !engineRef.current?.state.draft) return
        const eng = engineRef.current
        const d = eng.state.draft
        if (d.status !== 'choosing') return

        const participant = eng.state.participants.find((p) => p.id === payload?.participantId)
        if (!participant) return

        const wanted = (payload?.playerIds || []).slice(0, d.picksPerTurn)
        const picks: HistoricalPlayer[] = []
        for (const id of wanted) {
          const p = d.currentOptions.find((pp) => pp.id === id)
          if (p && !participant.squad.find((s) => s.id === id)) picks.push(p)
        }
        if (picks.length === 0) return

        // Apply picks
        for (const pick of picks) {
          participant.squad.push(pick)
          d.picks.push({
            participantId: participant.id,
            playerId: pick.id,
            playerName: pick.name,
            position: pick.position,
            overall: pick.overall,
            round: d.currentRound,
          })
          d.availablePlayers = d.availablePlayers.filter((p) => p.id !== pick.id)
        }

        broadcast('draft:picks', {
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

        eng.emitDraftState()

        // Advance turn
        d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length
        if (d.currentTurnIndex === 0) d.currentRound++

        setTimeout(() => eng.advanceDraftTurn(), 600)
      },
      'chat:message': async (payload) => {
        if (!engineRef.current?.state) return
        const eng = engineRef.current
        const participant = eng.state.participants.find(
          (p) => p.userId === payload?.userId
        )
        if (!participant) return
        const content = (payload?.content || '').slice(0, 500)
        if (!content.trim()) return
        const msg = {
          id: generateId(),
          username: participant.username,
          content,
          type: 'user' as const,
          createdAt: new Date().toISOString(),
        }
        await eng.pushChat(msg)
      },
      'room:leave': async (payload) => {
        if (!engineRef.current?.state) return
        const participant = engineRef.current.state.participants.find(
          (p) => p.userId === payload?.userId
        )
        if (!participant || participant.isBot) return
        participant.online = false

        if (participant.isHost) {
          // Migrate host
          const humans = engineRef.current.state.participants.filter(
            (p) => !p.isBot && p.id !== participant.id
          )
          if (humans.length > 0) {
            engineRef.current.state.participants.forEach((p) => (p.isHost = false))
            humans[0].isHost = true
            engineRef.current.state.hostId = humans[0].userId || humans[0].id
            const msg = systemMessage(`Host migrado para ${humans[0].username}.`)
            await engPushChat(engineRef, msg)
            broadcast('room:host-changed', { newHostId: engineRef.current.state.hostId, newHostName: humans[0].username })
          }
        }

        const msg = systemMessage(`${participant.username} saiu da sala.`)
        await engPushChat(engineRef, msg)
        broadcast('room:state', engineRef.current.publicRoom())
      },
    }

    // Subscribe to the current channel with all handlers
    const cleanup = subscribeToChannel(currentChannel, handlers)
    cleanupRef.current = cleanup

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      if (engineRef.current?.matchInterval) {
        clearInterval(engineRef.current.matchInterval)
      }
      engineRef.current = null
      initializedRef.current = false
    }
  }, [currentChannel, broadcast])

  return null
}

// ============================================================
// Helpers
// ============================================================

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

async function isCurrentUserHost(): Promise<boolean> {
  const user = useUserStore.getState().user
  if (!user) return false
  const game = useGameStore.getState()
  const me = game.participants.find((p) => p.userId === user.id)
  return me?.isHost || false
}

async function engPushChat(engineRef: React.MutableRefObject<HostEngine | null>, msg: any) {
  if (!engineRef.current?.state) return
  engineRef.current.state.chat.push(msg)
  engineRef.current.broadcast('chat:message', msg)
}

async function initEngineForRoom(
  channelName: string,
  engineRef: React.MutableRefObject<HostEngine | null>
) {
  const supabase = getSupabaseClient()
  const roomCode = channelName.replace('room-', '')

  const { data: dbRoom } = await supabase
    .from('Room')
    .select('*, participants:RoomParticipant(*)')
    .eq('code', roomCode.toUpperCase())
    .single()

  if (!dbRoom || !engineRef.current) return

  const room = createEngineRoom(dbRoom.code, dbRoom.id, dbRoom.hostId)
  room.status = dbRoom.status
  room.settings = JSON.parse(dbRoom.settings || '{}')

  const dbParticipants = (dbRoom.participants || []).sort(
    (a: any, b: any) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  )

  for (const p of dbParticipants) {
    let squad: any[] = []
    if (p.squad) {
      const squadIds: string[] = typeof p.squad === 'string' ? JSON.parse(p.squad) : (p.squad || [])
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
