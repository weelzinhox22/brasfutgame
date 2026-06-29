import type * as Party from "partykit/server";
import { createClient } from "@supabase/supabase-js";

import {
  DEFAULT_SETTINGS,
  SIM_SPEEDS,
} from "../src/lib/types";
import type {
  Position,
  BotMode,
  RoomSettings,
  HistoricalPlayer,
  MatchEvent,
} from "../src/lib/types";
import {
  simulateMatch,
  computeTeamOVR,
  FORMATION_ROLES,
} from "../src/lib/simulation";
import type { TeamForSim } from "../src/lib/simulation";
import { botPickPlayers, generateBotName } from "../src/lib/bots";

// ============================================================
// Types & Interface definitions
// ============================================================

interface ParticipantState {
  id: string;
  userId: string | null;
  username: string;
  isBot: boolean;
  botMode: BotMode | null;
  isHost: boolean;
  joinedAt: number;
  connectionId: string | null;
  online: boolean;
  teamName: string | null;
  teamOvr: number;
  squad: HistoricalPlayer[];
  formation: string;
}

interface DraftState {
  order: string[]; // participant ids
  currentTurnIndex: number;
  currentRound: number; // 1-indexed
  totalRounds: number;
  picksPerTurn: number;
  picks: {
    participantId: string;
    playerId: string;
    playerName: string;
    position: Position;
    overall: number;
    round: number;
  }[];
  status: "rolling" | "choosing" | "bot-thinking" | "done";
  lastRoll: number | null;
  currentOptions: HistoricalPlayer[];
  availablePlayers: HistoricalPlayer[];
}

interface MatchSlot {
  round: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
}

interface ChampionshipState {
  schedule: MatchSlot[][];
  currentRound: number;
  currentMatchIndex: number;
  timer: { secondsLeft: number; total: number } | null;
  pendingResult: {
    homeId: string;
    awayId: string;
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
    events: MatchEvent[];
    streamedUpTo: number;
  } | null;
  finished: boolean;
}

interface ActiveRoom {
  code: string;
  roomId: string;
  hostId: string;
  settings: RoomSettings;
  status: "waiting" | "draft" | "playing" | "finished";
  participants: ParticipantState[];
  chat: {
    id: string;
    username: string;
    content: string;
    type: "user" | "system" | "bot";
    createdAt: string;
  }[];
  draft: DraftState | null;
  championship: ChampionshipState | null;
  champion: { id: string; name: string; points: number } | null;
}

// ============================================================
// Database & Supabase Helpers
// ============================================================

function getSupabase(room: Party.Room) {
  const url = room.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = room.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase credentials missing in PartyKit environment variables.");
  }
  return createClient(url, anonKey);
}

async function loadRoomFromSupabase(room: Party.Room, code: string): Promise<ActiveRoom | null> {
  const supabase = getSupabase(room);
  
  const { data: dbRoom, error: roomError } = await supabase
    .from("Room")
    .select("*, participants:RoomParticipant(*)")
    .eq("code", code.toUpperCase())
    .single();

  if (roomError || !dbRoom) return null;

  const dbParticipants = (dbRoom.participants || []).sort(
    (a: any, b: any) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  );

  const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(dbRoom.settings || "{}") };

  const participants: ParticipantState[] = dbParticipants.map((p: any) => ({
    id: p.id,
    userId: p.userId,
    username: p.username,
    isBot: p.isBot,
    botMode: (p.botMode as BotMode) || null,
    isHost: p.isHost,
    joinedAt: new Date(p.joinedAt).getTime(),
    connectionId: null,
    online: p.isBot, // bots are always online
    teamName: p.teamName,
    teamOvr: p.teamOvr,
    squad: [], // will load players during draft or from DB when needed
    formation: "4-3-3",
  }));

  return {
    code: dbRoom.code,
    roomId: dbRoom.id,
    hostId: dbRoom.hostId,
    settings,
    status: dbRoom.status as ActiveRoom["status"],
    participants,
    chat: [],
    draft: null,
    championship: null,
    champion: null,
  };
}

// ============================================================
// PartyKit Room Server
// ============================================================

export default class ChampionshipServer implements Party.Server {
  state: ActiveRoom | null = null;
  matchInterval: any = null;

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`[party] client connected: ${conn.id} in room: ${this.room.id}`);
  }

  onClose(conn: Party.Connection) {
    console.log(`[party] client disconnected: ${conn.id}`);
    this.handleDisconnect(conn);
  }

  async onMessage(message: string, sender: Party.Connection) {
    const event = JSON.parse(message);
    const type = event.type;
    const data = event.payload;

    const supabase = getSupabase(this.room);

    try {
      if (type === "room:join") {
        const code = this.room.id.toUpperCase();
        if (!this.state) {
          this.state = await loadRoomFromSupabase(this.room, code);
          if (!this.state) {
            sender.send(JSON.stringify({ type: "room:error", payload: { message: "Sala não encontrada." } }));
            return;
          }
        }

        // Verify password
        const { data: dbRoom } = await supabase
          .from("Room")
          .select("password")
          .eq("code", code)
          .single();

        if (dbRoom?.password && dbRoom.password !== data.password) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "Senha incorreta." } }));
          return;
        }

        let part = this.state.participants.find((p) => p.userId === data.userId && !p.isBot);
        if (part) {
          part.connectionId = sender.id;
          part.online = true;
        } else {
          const humans = this.state.participants.filter((p) => !p.isBot).length;
          if (humans >= this.state.settings.maxPlayers) {
            sender.send(JSON.stringify({ type: "room:error", payload: { message: "Sala cheia." } }));
            return;
          }

          // Ensure user exists in database
          if (data.userId) {
            const { data: userExist } = await supabase
              .from("User")
              .select("id")
              .eq("id", data.userId)
              .maybeSingle();

            if (!userExist) {
              await supabase.from("User").insert({
                id: data.userId,
                username: data.username,
                avatarColor: '#16a34a',
                country: 'Brasil'
              });
              await supabase.from("UserRanking").insert({
                id: crypto.randomUUID(),
                userId: data.userId,
                username: data.username,
                country: 'Brasil'
              });
            }
          }

          const id = crypto.randomUUID();
          const { data: created, error } = await supabase
            .from("RoomParticipant")
            .insert({
              id,
              roomId: this.state.roomId,
              userId: data.userId,
              username: data.username,
              isBot: false,
              isHost: false,
            })
            .select()
            .single();

          if (error) throw error;

          part = {
            id: created.id,
            userId: data.userId,
            username: data.username,
            isBot: false,
            botMode: null,
            isHost: false,
            joinedAt: new Date(created.joinedAt).getTime(),
            connectionId: sender.id,
            online: true,
            teamName: null,
            teamOvr: 0,
            squad: [],
            formation: "4-3-3",
          };
          this.state.participants.push(part);
          const msg = this.systemMessage(`${data.username} entrou na sala.`);
          this.pushChat(msg);
        }

        sender.send(JSON.stringify({ type: "room:joined", payload: { code, participantId: part.id } }));
        this.broadcastRoomState();

        if (this.state.draft) {
          sender.send(JSON.stringify({ type: "draft:state", payload: this.publicDraftState(part.id) }));
        }
        if (this.state.championship) {
          sender.send(JSON.stringify({ type: "championship:state", payload: this.publicChampionshipState() }));
          const standings = await this.fetchStandings();
          sender.send(JSON.stringify({ type: "championship:standings-updated", payload: standings }));
        }
      }

      if (!this.state) return;

      const participant = this.state.participants.find((p) => p.connectionId === sender.id);
      if (!participant) return;

      if (type === "chat:message") {
        const content = (data.content || "").slice(0, 500);
        if (!content.trim()) return;

        const msg = {
          id: crypto.randomUUID(),
          username: participant.username,
          content,
          type: "user" as const,
          createdAt: new Date().toISOString(),
        };
        this.pushChat(msg);
        this.room.broadcast(JSON.stringify({ type: "chat:message", payload: msg }));
      }

      if (type === "room:update-settings") {
        if (!participant.isHost) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "Apenas o host pode alterar configurações." } }));
          return;
        }
        this.state.settings = { ...this.state.settings, ...data.settings };
        await supabase
          .from("Room")
          .update({ settings: JSON.stringify(this.state.settings) })
          .eq("id", this.state.roomId);

        this.room.broadcast(JSON.stringify({ type: "room:settings-updated", payload: { settings: this.state.settings } }));
        this.broadcastRoomState();
      }

      if (type === "room:add-bots") {
        if (!participant.isHost) return;
        await this.addBots(data.count || 1);
      }

      if (type === "room:remove-bot") {
        if (!participant.isHost) return;
        await this.removeBot(data.participantId);
      }

      if (type === "room:set-formation") {
        if (!FORMATION_ROLES[data.formation]) return;
        participant.formation = data.formation;
        this.broadcastRoomState();
      }

      if (type === "room:start-draft") {
        if (!participant.isHost) return;
        if (this.state.participants.length < 2) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "É necessário pelo menos 2 participantes." } }));
          return;
        }
        await this.startDraft();
      }

      if (type === "room:start-auto-draft") {
        if (!participant.isHost) return;
        if (this.state.participants.length < 2) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "É necessário pelo menos 2 participantes." } }));
          return;
        }
        await this.startAutoDraft();
      }

      if (type === "draft:roll") {
        const d = this.state.draft;
        if (!d) return;
        const currentId = d.order[d.currentTurnIndex];
        if (currentId !== participant.id) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "Não é sua vez." } }));
          return;
        }
        if (d.status !== "rolling") return;

        const roll = Math.floor(Math.random() * 6) + 1;
        d.lastRoll = roll;
        d.status = "choosing";
        this.room.broadcast(JSON.stringify({ type: "draft:roll-result", payload: { participantId: participant.id, roll } }));

        const options = this.generateOptions(d.availablePlayers, participant.squad, participant.formation, roll);
        d.currentOptions = options;
        
        this.room.broadcast(
          JSON.stringify({
            type: "draft:options",
            payload: {
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
            },
          })
        );
        this.emitDraftState();
      }

      if (type === "draft:pick") {
        const d = this.state.draft;
        if (!d) return;
        const currentId = d.order[d.currentTurnIndex];
        if (currentId !== participant.id) return;
        if (d.status !== "choosing") return;

        const wanted = (data.playerIds || []).slice(0, d.picksPerTurn);
        const picks: HistoricalPlayer[] = [];
        for (const id of wanted) {
          const p = d.currentOptions.find((pp) => pp.id === id);
          if (p && !participant.squad.find((s) => s.id === id)) picks.push(p);
        }

        if (picks.length === 0) {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "Escolha pelo menos 1 jogador." } }));
          return;
        }

        await this.applyPicks(participant, picks, d.currentRound);
        this.room.broadcast(
          JSON.stringify({
            type: "draft:picks",
            payload: {
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
            },
          })
        );
        this.emitDraftState();

        d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length;
        if (d.currentTurnIndex === 0) d.currentRound++;

        setTimeout(() => this.advanceDraftTurn(), 600);
      }

      if (type === "championship:start") {
        if (!participant.isHost) return;
        if (this.state.status !== "draft") {
          sender.send(JSON.stringify({ type: "room:error", payload: { message: "Conclua o draft primeiro." } }));
          return;
        }
        await this.startChampionship();
      }

      if (type === "room:leave") {
        this.handleDisconnect(sender);
      }

      if (type === "room:restart") {
        if (!participant.isHost) return;
        this.state.status = "waiting";
        this.state.draft = null;
        this.state.championship = null;
        this.state.champion = null;
        
        // Reset squads, cards, and formations
        for (const p of this.state.participants) {
          p.squad = [];
          p.teamName = null;
          p.teamOvr = 0;
          p.formation = "4-3-3";
          (p as any).yellowCards = {};
          (p as any).suspendedPlayers = [];
        }
        
        // Save status in DB
        await supabase
          .from("Room")
          .update({ status: "waiting" })
          .eq("id", this.state.roomId);
          
        this.room.broadcast(JSON.stringify({ type: "room:status-changed", payload: { status: "waiting" } }));
        this.broadcastRoomState();
      }
    } catch (err: any) {
      console.error("[party error]", err);
      sender.send(JSON.stringify({ type: "room:error", payload: { message: "Ocorreu um erro no processamento da ação." } }));
    }
  }

  // ============================================================
  // Gameplay Logic Ported from Socket Server
  // ============================================================

  systemMessage(content: string) {
    return {
      id: crypto.randomUUID(),
      username: "Sistema",
      content,
      type: "system" as const,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChat(msg: any) {
    if (!this.state) return;
    this.state.chat.push(msg);
    
    // Save to DB
    const supabase = getSupabase(this.room);
    await supabase.from("ChatMessage").insert({
      id: msg.id,
      roomId: this.state.roomId,
      username: msg.username,
      content: msg.content,
      type: msg.type,
    });
  }

  broadcastRoomState() {
    if (!this.state) return;
    this.room.broadcast(JSON.stringify({ type: "room:state", payload: this.publicRoom() }));
  }

  publicRoom() {
    if (!this.state) return null;
    
    const squads = (this.state.status === "playing" || this.state.status === "finished") 
      ? this.state.participants.map((p) => ({
          id: p.id,
          username: p.username,
          teamName: p.teamName,
          teamOvr: p.teamOvr,
          formation: p.formation,
          squad: p.squad,
        }))
      : [];

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
    };
  }

  publicDraftState(viewerParticipantId?: string) {
    if (!this.state || !this.state.draft) return null;
    const d = this.state.draft;
    const currentId = d.order[d.currentTurnIndex];
    const hideOptions = this.state.settings.privatePicks && viewerParticipantId !== currentId;

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
    };
  }

  emitDraftState() {
    if (!this.state || !this.state.draft) return;
    if (!this.state.settings.privatePicks) {
      this.room.broadcast(JSON.stringify({ type: "draft:state", payload: this.publicDraftState() }));
      return;
    }
    // Send to each connection individually
    for (const p of this.state.participants) {
      if (p.connectionId) {
        const conn = this.room.getConnection(p.connectionId);
        if (conn) {
          conn.send(JSON.stringify({ type: "draft:state", payload: this.publicDraftState(p.id) }));
        }
      }
    }
  }

  async startDraft() {
    if (!this.state) return;
    const supabase = getSupabase(this.room);

    // If skipDraft is enabled, use auto-draft instead
    if (this.state.settings.skipDraft) {
      await this.startAutoDraft();
      return;
    }

    // Load players
    const { data: allPlayers, error } = await supabase.from("HistoricalPlayer").select("*");
    if (error) throw error;

    const parsed: HistoricalPlayer[] = allPlayers.map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position as Position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.parse(p.stats || "{}"),
      teamId: p.teamId,
    }));

    const available = this.filterPlayers(parsed, this.state.settings);
    const order = [...this.state.participants].sort(() => Math.random() - 0.5).map((p) => p.id);
    const totalRounds = 6;  // 6 rounds × 2 picks = 12, but draft stops per-participant at 11
    const picksPerTurn = 2;

    this.state.draft = {
      order,
      currentTurnIndex: 0,
      currentRound: 1,
      totalRounds,
      picksPerTurn,
      picks: [],
      status: "rolling",
      lastRoll: null,
      currentOptions: [],
      availablePlayers: available,
    };

    this.state.status = "draft";
    await supabase.from("Room").update({ status: "draft" }).eq("id", this.state.roomId);

    const msg = this.systemMessage("Draft iniciado! Ordem sorteada. Role o dado e escolha 2 jogadores por turno.");
    await this.pushChat(msg);
    
    this.emitDraftState();
    this.room.broadcast(JSON.stringify({ type: "room:status-changed", payload: { status: "draft" } }));
    this.broadcastRoomState();

    await this.advanceDraftTurn();
  }

  /**
   * Auto-draft: automatically assigns random players to all participants
   * based on their formations, skipping the manual draft process entirely.
   */
  async startAutoDraft() {
    if (!this.state) return;
    const supabase = getSupabase(this.room);

    // Load players
    const { data: allPlayers, error } = await supabase.from("HistoricalPlayer").select("*");
    if (error) throw error;

    const parsed: HistoricalPlayer[] = allPlayers.map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position as Position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.parse(p.stats || "{}"),
      teamId: p.teamId,
    }));

    const available = this.filterPlayers(parsed, this.state.settings);
    const usedIds = new Set<string>();

    this.state.status = "draft";
    this.state.draft = null; // No interactive draft needed

    await supabase.from("Room").update({ status: "draft" }).eq("id", this.state.roomId);

    const msg = this.systemMessage("⚡ Draft automático iniciado! Distribuindo jogadores aleatórios para todos os participantes...");
    await this.pushChat(msg);
    this.room.broadcast(JSON.stringify({ type: "chat:message", payload: msg }));

    // For each participant, assign a full 11-player squad matching their formation
    for (const participant of this.state.participants) {
      const formation = participant.formation || "4-3-3";
      const formationRoles = FORMATION_ROLES[formation] || FORMATION_ROLES["4-3-3"];
      
      // Get available players for this participant (filter out already used)
      const pool = available.filter((p) => !usedIds.has(p.id));
      
      // Build squad by picking the best fit for each formation slot
      const squad: HistoricalPlayer[] = [];
      const neededPositions = [...formationRoles];
      
      // Shuffle needed positions for variety
      for (let i = neededPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [neededPositions[i], neededPositions[j]] = [neededPositions[j], neededPositions[i]];
      }

      // Pick players for each needed position (up to 11 players)
      const maxPicks = Math.min(11, pool.length);
      let pickCount = 0;
      
      // First pass: try to match exactly needed positions
      for (const pos of formationRoles) {
        if (pickCount >= maxPicks) break;
        // Find a matching player in the pool
        const candidates = pool.filter((p) => !usedIds.has(p.id) && p.position === pos);
        if (candidates.length > 0) {
          // Pick randomly from top-tier candidates (sorted by OVR, favoring mid-range for variety)
          candidates.sort((a, b) => b.overall - a.overall);
          const pickIdx = Math.min(
            Math.floor(Math.random() * Math.min(candidates.length, 5)),
            candidates.length - 1
          );
          const pick = candidates[pickIdx];
          squad.push(pick);
          usedIds.add(pick.id);
          pickCount++;
        }
      }

      // Second pass: fill remaining slots with best available players (any position)
      if (pickCount < maxPicks) {
        const remaining = pool.filter((p) => !usedIds.has(p.id));
        remaining.sort((a, b) => b.overall - a.overall);
        for (let i = 0; i < remaining.length && pickCount < maxPicks; i++) {
          squad.push(remaining[i]);
          usedIds.add(remaining[i].id);
          pickCount++;
        }
      }

      // Assign squad to participant
      participant.squad = squad;
      
      // Compute team OVR
      const { ovr } = computeTeamOVR(
        squad.map((s) => ({ overall: s.overall, position: s.position })),
        formation
      );
      participant.teamOvr = ovr;
      if (!participant.teamName) {
        participant.teamName = `${participant.username} FC`;
      }

      // Save to database
      await supabase
        .from("RoomParticipant")
        .update({
          teamName: participant.teamName,
          teamOvr: ovr,
          squad: JSON.stringify(squad.map((s) => s.id)),
        })
        .eq("id", participant.id);
    }

    this.state.status = "playing";
    await supabase.from("Room").update({ status: "playing" }).eq("id", this.state.roomId);

    const doneMsg = this.systemMessage("✅ Draft automático concluído! As escalações foram definidas. Iniciando campeonato...");
    await this.pushChat(doneMsg);
    this.room.broadcast(JSON.stringify({ type: "chat:message", payload: doneMsg }));

    // Broadcast draft completion with squads
    this.room.broadcast(
      JSON.stringify({
        type: "draft:complete",
        payload: {
          squads: this.state.participants.map((p) => ({
            id: p.id,
            username: p.username,
            teamName: p.teamName,
            teamOvr: p.teamOvr,
            formation: p.formation,
            squad: p.squad,
          })),
        },
      })
    );

    // Go directly to playing — skip draft UI entirely
    this.room.broadcast(JSON.stringify({ type: "room:status-changed", payload: { status: "playing" } }));
    
    // Wait a moment then start championship
    await new Promise((r) => setTimeout(r, 2000));
    
    await this.startChampionship();
  }

  async advanceDraftTurn() {
    if (!this.state || !this.state.draft) return;
    const d = this.state.draft;

    // End draft when every participant has a full 11-player squad
    const allDone = this.state.participants.every((p) => p.squad.length >= 11);
    if (allDone || d.currentRound > d.totalRounds) {
      await this.finishDraft();
      return;
    }

    const currentId = d.order[d.currentTurnIndex];
    const participant = this.state.participants.find((p) => p.id === currentId);
    if (!participant) {
      d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length;
      if (d.currentTurnIndex === 0) d.currentRound++;
      await this.advanceDraftTurn();
      return;
    }

    // Skip participant if they already have a complete 11-player squad
    if (participant.squad.length >= 11) {
      d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length;
      if (d.currentTurnIndex === 0) d.currentRound++;
      await this.advanceDraftTurn();
      return;
    }


    d.status = participant.isBot ? "bot-thinking" : "rolling";
    d.lastRoll = null;
    d.currentOptions = [];

    this.room.broadcast(
      JSON.stringify({
        type: "draft:turn",
        payload: {
          participantId: currentId,
          round: d.currentRound,
          pickIndex: d.currentTurnIndex,
          isBot: participant.isBot,
        },
      })
    );
    this.emitDraftState();

    if (participant.isBot) {
      setTimeout(() => this.botDraftTurn(participant), 1800);
    }
  }

  async botDraftTurn(participant: ParticipantState) {
    if (!this.state || !this.state.draft) return;
    const d = this.state.draft;

    const roll = Math.floor(Math.random() * 6) + 1;
    d.lastRoll = roll;
    this.room.broadcast(JSON.stringify({ type: "draft:roll-result", payload: { participantId: participant.id, roll } }));
    await new Promise((r) => setTimeout(r, 900));

    const options = this.generateOptions(d.availablePlayers, participant.squad, participant.formation, roll);
    d.currentOptions = options;

    this.room.broadcast(
      JSON.stringify({
        type: "draft:options",
        payload: {
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
        },
      })
    );
    await new Promise((r) => setTimeout(r, 1200));

    const picks = botPickPlayers(options, participant.squad, participant.botMode || "balanced", participant.formation, d.picksPerTurn);
    await this.applyPicks(participant, picks, d.currentRound);

    this.room.broadcast(
      JSON.stringify({
        type: "draft:bot-pick",
        payload: {
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
        },
      })
    );

    this.emitDraftState();
    await new Promise((r) => setTimeout(r, 800));

    d.currentTurnIndex = (d.currentTurnIndex + 1) % d.order.length;
    if (d.currentTurnIndex === 0) d.currentRound++;
    await this.advanceDraftTurn();
  }

  async applyPicks(participant: ParticipantState, picks: HistoricalPlayer[], round: number) {
    if (!this.state || !this.state.draft) return;
    const d = this.state.draft;

    for (const pick of picks) {
      participant.squad.push(pick);
      d.picks.push({
        participantId: participant.id,
        playerId: pick.id,
        playerName: pick.name,
        position: pick.position,
        overall: pick.overall,
        round,
      });
      d.availablePlayers = d.availablePlayers.filter((p) => p.id !== pick.id);
    }
  }

  async finishDraft() {
    if (!this.state || !this.state.draft) return;
    const d = this.state.draft;
    d.status = "done";

    const supabase = getSupabase(this.room);

    for (const p of this.state.participants) {
      const { ovr } = computeTeamOVR(
        p.squad.map((s) => ({ overall: s.overall, position: s.position })),
        p.formation
      );
      p.teamOvr = ovr;
      if (!p.teamName) p.teamName = `${p.username} FC`;

      await supabase
        .from("RoomParticipant")
        .update({
          teamName: p.teamName,
          teamOvr: ovr,
          squad: JSON.stringify(p.squad.map((s) => s.id)),
        })
        .eq("id", p.id);
    }

    const msg = this.systemMessage("Draft concluído! O host já pode iniciar o campeonato.");
    await this.pushChat(msg);

    this.room.broadcast(
      JSON.stringify({
        type: "draft:complete",
        payload: {
          squads: this.state.participants.map((p) => ({
            id: p.id,
            username: p.username,
            teamName: p.teamName,
            teamOvr: p.teamOvr,
            formation: p.formation,
            squad: p.squad,
          })),
        },
      })
    );

    this.emitDraftState();
    this.broadcastRoomState();
  }

  // ============================================================
  // Championship / Simulator Logic
  // ============================================================

  async startChampionship() {
    if (!this.state) return;
    const baseSchedule = this.generateRoundRobin(this.state.participants);

    if (baseSchedule.length === 0) {
      const msg = this.systemMessage("Não há participantes suficientes para iniciar o campeonato.");
      await this.pushChat(msg);
      return;
    }

    let fullSchedule: MatchSlot[][] = [];
    const format = this.state.settings.competitionFormat || "custom";

    if (format === "brasileirao") {
      for (let i = 0; i < 2; i++) {
        for (const round of baseSchedule) {
          const r = round.map((m) =>
            i === 1
              ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName }
              : m
          );
          fullSchedule.push(r);
        }
      }
    } else if (format === "ucl-2026") {
      const totalRounds = Math.min(8, baseSchedule.length * 2);
      for (let r = 0; r < totalRounds; r++) {
        const baseRound = baseSchedule[r % baseSchedule.length];
        const swap = r >= baseSchedule.length;
        const round = baseRound.map((m) =>
          swap ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName } : m
        );
        fullSchedule.push(round);
      }
    } else {
      const rep = Math.max(1, Math.min(this.state.settings.rounds || 1, 3));
      for (let i = 0; i < rep; i++) {
        for (const round of baseSchedule) {
          const r = round.map((m) =>
            i % 2 === 1
              ? { ...m, homeId: m.awayId, awayId: m.homeId, homeName: m.awayName, awayName: m.homeName }
              : m
          );
          fullSchedule.push(r);
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
    };
    this.state.status = "playing";

    const supabase = getSupabase(this.room);
    await supabase.from("Room").update({ status: "playing" }).eq("id", this.state.roomId);

    // Initial Standings in Supabase
    for (const p of this.state.participants) {
      if (p.squad.length >= 7) {
        // check first
        const { data: existing } = await supabase
          .from("ChampionshipStanding")
          .select("id")
          .eq("roomId", this.state.roomId)
          .eq("participantId", p.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("ChampionshipStanding").insert({
            id: crypto.randomUUID(),
            roomId: this.state.roomId,
            participantId: p.id,
            name: p.teamName || p.username,
          });
        }
      }
    }

    const msg = this.systemMessage(`Campeonato iniciado! ${fullSchedule.length} rodada(s) programadas.`);
    await this.pushChat(msg);

    this.room.broadcast(JSON.stringify({ type: "room:status-changed", payload: { status: "playing" } }));
    this.room.broadcast(JSON.stringify({ type: "championship:state", payload: this.publicChampionshipState() }));
    this.broadcastRoomState();

    await this.playNextMatch();
  }

  publicChampionshipState() {
    if (!this.state || !this.state.championship) return null;
    const c = this.state.championship;
    const currentRoundMatches = c.schedule[c.currentRound] || [];
    return {
      schedule: c.schedule.map((round) => round.map((m) => ({ homeName: m.homeName, awayName: m.awayName, round: m.round }))),
      currentRound: c.currentRound,
      currentMatchIndex: c.currentMatchIndex,
      currentRoundMatches,
      timer: c.timer,
      finished: c.finished,
      standings: this.state.participants.map((p) => ({ id: p.id, name: p.teamName || p.username, ovr: p.teamOvr })),
      topScorers: (c as any).topScorers || [],
    };
  }

  async playNextMatch() {
    if (!this.state || !this.state.championship) return;
    const c = this.state.championship;

    if (c.currentRound >= c.schedule.length) {
      await this.finishChampionship();
      return;
    }

    const round = c.schedule[c.currentRound];
    if (c.currentMatchIndex >= round.length) {
      this.room.broadcast(JSON.stringify({ type: "championship:round-complete", payload: { round: c.currentRound + 1 } }));
      c.currentRound++;
      c.currentMatchIndex = 0;
      await this.playNextMatch();
      return;
    }

    const slot = round[c.currentMatchIndex];
    const home = this.state.participants.find((p) => p.id === slot.homeId);
    const away = this.state.participants.find((p) => p.id === slot.awayId);

    if (!home || !away) {
      c.currentMatchIndex++;
      await this.playNextMatch();
      return;
    }

    // Filter out suspended players from starting XI
    const activeHomeSquad = home.squad.filter((p) => !(home as any).suspendedPlayers?.includes(p.id));
    const activeAwaySquad = away.squad.filter((p) => !(away as any).suspendedPlayers?.includes(p.id));

    const homeTeam: TeamForSim = {
      name: home.teamName || home.username,
      ovr: home.teamOvr,
      formation: home.formation,
      players: activeHomeSquad.slice(0, 11).map((s) => ({ name: s.name, position: s.position, overall: s.overall })),
      isHome: true,
    };
    const awayTeam: TeamForSim = {
      name: away.teamName || away.username,
      ovr: away.teamOvr,
      formation: away.formation,
      players: activeAwaySquad.slice(0, 11).map((s) => ({ name: s.name, position: s.position, overall: s.overall })),
      isHome: false,
    };

    const result = simulateMatch(homeTeam, awayTeam, Date.now() + c.currentRound * 1000 + c.currentMatchIndex);

    // Events already have ball positions embedded from the simulation engine.
    // All clients receive the EXACT same events for synchronized rendering.
    c.pendingResult = {
      homeId: home.id,
      awayId: away.id,
      homeName: home.teamName || home.username,
      awayName: away.teamName || away.username,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      events: enrichedEvents,
      streamedUpTo: 0,
    };

    const total = SIM_SPEEDS.find((s) => s.value === this.state!.settings.simSpeed)?.seconds ?? 15;
    c.timer = { secondsLeft: total, total };

    this.room.broadcast(
      JSON.stringify({
        type: "championship:match-start",
        payload: {
          homeName: home.teamName || home.username,
          awayName: away.teamName || away.username,
          homeOvr: home.teamOvr,
          awayOvr: away.teamOvr,
          round: c.currentRound + 1,
          totalSeconds: total,
        },
      })
    );

    const msg = this.systemMessage(`Rodada ${c.currentRound + 1}: ${homeTeam.name} x ${awayTeam.name}`);
    await this.pushChat(msg);

    // Setup match ticking interval
    if (this.matchInterval) clearInterval(this.matchInterval);
    this.matchInterval = setInterval(() => this.onMatchTick(), 1000);
  }

  async onMatchTick() {
    if (!this.state || !this.state.championship) {
      if (this.matchInterval) clearInterval(this.matchInterval);
      return;
    }
    const c = this.state.championship;
    if (!c.timer || !c.pendingResult) {
      if (this.matchInterval) clearInterval(this.matchInterval);
      return;
    }

    c.timer.secondsLeft--;
    const elapsed = c.timer.total - c.timer.secondsLeft;
    const simMinute = Math.min(90, Math.round((elapsed / c.timer.total) * 90));

    const pending = c.pendingResult;
    for (let i = pending.streamedUpTo; i < pending.events.length; i++) {
      if (pending.events[i].minute <= simMinute) {
        this.room.broadcast(JSON.stringify({ type: "championship:match-event", payload: pending.events[i] }));
        pending.streamedUpTo = i + 1;
      } else {
        break;
      }
    }

    this.room.broadcast(JSON.stringify({ type: "championship:match-tick", payload: { secondsLeft: c.timer.secondsLeft, simMinute } }));

    if (c.timer.secondsLeft <= 0) {
      if (this.matchInterval) clearInterval(this.matchInterval);
      await this.finishMatch();
    }
  }

  async finishMatch() {
    if (!this.state || !this.state.championship || !this.state.championship.pendingResult) return;
    const c = this.state.championship;
    const r = c.pendingResult!;

    const home = this.state.participants.find((p) => p.id === r.homeId)!;
    const away = this.state.participants.find((p) => p.id === r.awayId)!;

    // Track card accumulations and suspensions
    const h = home as any;
    const a = away as any;
    if (!h.yellowCards) h.yellowCards = {};
    if (!h.suspendedPlayers) h.suspendedPlayers = [];
    if (!a.yellowCards) a.yellowCards = {};
    if (!a.suspendedPlayers) a.suspendedPlayers = [];

    // Clear previously served suspensions
    h.suspendedPlayers = [];
    a.suspendedPlayers = [];

    // Track top scorers (artilharia)
    if (!(c as any).topScorers) (c as any).topScorers = [];
    const topScorers = (c as any).topScorers;

    for (const e of r.events) {
      if (e.type === "goal") {
        const teamName = e.team === "home" ? r.homeName : r.awayName;
        const existing = topScorers.find((t: any) => t.player === e.player && t.team === teamName);
        if (existing) {
          existing.goals++;
        } else {
          topScorers.push({ player: e.player, team: teamName, goals: 1 });
        }
      }

      // Check cards
      if (e.type === "yellow") {
        const participant = e.team === "home" ? h : a;
        const player = participant.squad.find((p: any) => p.name === e.player);
        if (player) {
          participant.yellowCards[player.id] = (participant.yellowCards[player.id] || 0) + 1;
          if (participant.yellowCards[player.id] % 3 === 0) {
            participant.suspendedPlayers.push(player.id);
            await this.pushChat(this.systemMessage(`Suspensão: ${player.name} (${participant.teamName || participant.username}) acumulou 3 cartões amarelos e está suspenso do próximo jogo!`));
          }
        }
      }

      if (e.type === "red") {
        const participant = e.team === "home" ? h : a;
        const player = participant.squad.find((p: any) => p.name === e.player);
        if (player) {
          participant.suspendedPlayers.push(player.id);
          const reason = e.detail || "Cartão vermelho";
          await this.pushChat(this.systemMessage(`Suspensão: ${player.name} (${participant.teamName || participant.username}) foi expulso (${reason}) e está suspenso do próximo jogo!`));
        }
      }
    }

    // Sort top scorers list by goals descending
    topScorers.sort((x: any, y: any) => y.goals - x.goals);

    this.room.broadcast(
      JSON.stringify({
        type: "championship:match-result",
        payload: {
          homeName: r.homeName,
          awayName: r.awayName,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
        },
      })
    );

    // Save standings update in Supabase
    await this.updateStanding(home.id, r.homeScore, r.awayScore);
    await this.updateStanding(away.id, r.awayScore, r.homeScore);

    // Save Match to Supabase
    const supabase = getSupabase(this.room);
    await supabase.from("Match").insert({
      id: crypto.randomUUID(),
      roomId: this.state.roomId,
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
      stats: "{}",
      played: true,
      playedAt: new Date().toISOString(),
    });

    const standings = await this.fetchStandings();
    this.room.broadcast(JSON.stringify({ type: "championship:standings-updated", payload: standings }));
    // Broadcast updated championship state so clients get fresh topScorers
    this.room.broadcast(JSON.stringify({ type: "championship:state", payload: this.publicChampionshipState() }));

    c.timer = null;
    c.pendingResult = null;
    c.currentMatchIndex++;

    setTimeout(() => this.playNextMatch(), 2500);
  }

  async updateStanding(participantId: string, gf: number, ga: number) {
    if (!this.state) return;
    const supabase = getSupabase(this.room);

    const { data: standing } = await supabase
      .from("ChampionshipStanding")
      .select("*")
      .eq("roomId", this.state.roomId)
      .eq("participantId", participantId)
      .single();

    if (!standing) return;

    const won = gf > ga ? 1 : 0;
    const drawn = gf === ga ? 1 : 0;
    const lost = gf < ga ? 1 : 0;

    await supabase
      .from("ChampionshipStanding")
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
      .eq("id", standing.id);
  }

  async fetchStandings() {
    if (!this.state) return [];
    const supabase = getSupabase(this.room);

    const { data: standings } = await supabase
      .from("ChampionshipStanding")
      .select("*")
      .eq("roomId", this.state.roomId);

    if (!standings) return [];

    return standings.sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return b.won - a.won;
    });
  }

  async finishChampionship() {
    if (!this.state || !this.state.championship) return;
    const c = this.state.championship;
    c.finished = true;
    this.state.status = "finished";

    const supabase = getSupabase(this.room);
    await supabase.from("Room").update({ status: "finished" }).eq("id", this.state.roomId);

    const standings = await this.fetchStandings();
    const champion = standings[0];

    if (champion) {
      const msg = this.systemMessage(`🏆 CAMPEÃO: ${champion.name} com ${champion.points} pontos! Parabéns!`);
      await this.pushChat(msg);

      if (champion.participantId) {
        const part = this.state.participants.find((p) => p.id === champion.participantId);
        if (part && part.userId && !part.isBot) {
          // Update ranking in Supabase
          const { data: ranking } = await supabase
            .from("UserRanking")
            .select("*")
            .eq("userId", part.userId)
            .maybeSingle();

          if (!ranking) {
            await supabase.from("UserRanking").insert({
              id: crypto.randomUUID(),
              userId: part.userId,
              username: part.username,
              country: "Brasil",
              championships: 1,
              points: 100,
            });
          } else {
            await supabase
              .from("UserRanking")
              .update({
                championships: (ranking.championships || 0) + 1,
                points: (ranking.points || 0) + 100,
              })
              .eq("id", ranking.id);
          }
        }
      }
    }

    this.room.broadcast(
      JSON.stringify({
        type: "championship:complete",
        payload: {
          standings,
          champion: champion ? { id: champion.participantId, name: champion.name, points: champion.points } : null,
        },
      })
    );
    this.room.broadcast(JSON.stringify({ type: "room:status-changed", payload: { status: "finished" } }));
    this.broadcastRoomState();
  }

// ============================================================
// Bot Management & Helpers
// ============================================================

  async addBots(count: number) {
    if (!this.state) return;
    const supabase = getSupabase(this.room);

    const humans = this.state.participants.filter((p) => !p.isBot).length;
    const bots = this.state.participants.filter((p) => p.isBot).length;
    const slots = Math.max(0, Math.min(count, this.state.settings.maxPlayers - humans - bots));

    for (let i = 0; i < slots; i++) {
      const name = generateBotName(Date.now() + i);
      const id = crypto.randomUUID();

      const { data: created, error } = await supabase
        .from("RoomParticipant")
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
        .single();

      if (error) throw error;

      this.state.participants.push({
        id: created.id,
        userId: null,
        username: name,
        isBot: true,
        botMode: this.state.settings.botMode,
        isHost: false,
        joinedAt: new Date(created.joinedAt).getTime(),
        connectionId: null,
        online: true,
        teamName: null,
        teamOvr: 0,
        squad: [],
        formation: "4-3-3",
      });

      const msg = this.systemMessage(`${name} (bot) entrou na sala.`);
      await this.pushChat(msg);
    }
    this.broadcastRoomState();
  }

  async removeBot(participantId: string) {
    if (!this.state) return;
    const p = this.state.participants.find((pp) => pp.id === participantId);
    if (!p || !p.isBot) return;

    this.state.participants = this.state.participants.filter((pp) => pp.id !== participantId);
    
    const supabase = getSupabase(this.room);
    await supabase.from("RoomParticipant").delete().eq("id", participantId);

    const msg = this.systemMessage(`${p.username} (bot) removido.`);
    await this.pushChat(msg);
    this.broadcastRoomState();
  }

  handleDisconnect(socket: Party.Connection) {
    if (!this.state) return;
    const participant = this.state.participants.find((p) => p.connectionId === socket.id);
    if (!participant) return;

    participant.connectionId = null;
    participant.online = false;

    if (participant.isHost) {
      this.migrateHost();
    }

    if (!participant.isBot) {
      const msg = this.systemMessage(`${participant.username} desconectou.`);
      this.pushChat(msg).then(() => {
        this.room.broadcast(JSON.stringify({ type: "chat:message", payload: msg }));
      });
    }
    this.broadcastRoomState();
  }

  migrateHost() {
    if (!this.state) return;
    const humans = this.state.participants.filter((p) => !p.isBot);
    if (humans.length === 0) {
      const bots = [...this.state.participants].sort((a, b) => a.joinedAt - b.joinedAt);
      if (bots.length > 0) {
        bots.forEach((b) => (b.isHost = false));
        bots[0].isHost = true;
        this.state.hostId = bots[0].userId || bots[0].id;
      }
    } else {
      humans.sort((a, b) => a.joinedAt - b.joinedAt);
      this.state.participants.forEach((p) => (p.isHost = false));
      humans[0].isHost = true;
      this.state.hostId = humans[0].userId || humans[0].id;
    }
    const newHost = this.state.participants.find((p) => p.isHost);
    if (newHost) {
      const msg = this.systemMessage(`Host migrado para ${newHost.username} (humano mais antigo).`);
      this.pushChat(msg).then(() => {
        this.room.broadcast(JSON.stringify({ type: "room:host-changed", payload: { newHostId: this.state!.hostId, newHostName: newHost.username } }));
      });
    }
  }

  filterPlayers(players: HistoricalPlayer[], settings: RoomSettings): HistoricalPlayer[] {
    return players.filter((p) => {
      if (settings.teamFilter === "brazilian") return p.country === "Brasil" || p.country === "Brazil";
      if (settings.teamFilter === "international") return p.country !== "Brasil" && p.country !== "Brazil";
      return true;
    });
  }

  neededPositions(squad: HistoricalPlayer[], formation: string): Position[] {
    const required = FORMATION_ROLES[formation] || FORMATION_ROLES["4-3-3"];
    const needed: Position[] = [];
    const have = [...squad.map((s) => s.position)];
    for (const req of required) {
      const idx = have.indexOf(req);
      if (idx >= 0) have.splice(idx, 1);
      else needed.push(req);
    }
    return needed;
  }

  generateOptions(available: HistoricalPlayer[], squad: HistoricalPlayer[], formation: string, roll: number): HistoricalPlayer[] {
    const needed = this.neededPositions(squad, formation);
    // If squad is fully complete, return nothing
    if (needed.length === 0) return [];

    const TARGET = 8;
    const targetOvr = 60 + roll * 6; // OVR preference, not a hard cutoff

    const sh = <T>(arr: T[]) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Group ALL available players by the positions still needed
    const byPos: Record<string, HistoricalPlayer[]> = {};
    for (const pos of needed) {
      // Sort: players within ±15 OVR of target first, then rest by closeness
      byPos[pos] = [...available.filter((p) => p.position === pos)].sort((a, b) => {
        const aDiff = Math.abs(a.overall - targetOvr);
        const bDiff = Math.abs(b.overall - targetOvr);
        return aDiff - bDiff;
      });
    }

    const picked = new Set<string>();
    const result: HistoricalPlayer[] = [];

    // Round-robin across needed positions: pick 1 from each, repeat until TARGET reached
    let round = 0;
    const shuffledNeeded = sh([...needed]);
    while (result.length < TARGET) {
      let addedThisRound = false;
      for (const pos of shuffledNeeded) {
        if (result.length >= TARGET) break;
        const candidates = byPos[pos]?.filter((p) => !picked.has(p.id)) ?? [];
        if (candidates.length === 0) continue;
        // Pick the best-fit player for this round (already sorted by OVR proximity)
        const candidate = candidates[Math.min(round, candidates.length - 1)];
        result.push(candidate);
        picked.add(candidate.id);
        addedThisRound = true;
      }
      round++;
      if (!addedThisRound) break; // Exhausted all candidates for all needed positions
    }

    // Sort final list by OVR descending so best appear first in the UI
    return result.sort((a, b) => b.overall - a.overall);
  }

  generateRoundRobin(participants: ParticipantState[]): MatchSlot[][] {
    const teams = participants.filter((p) => p.squad.length >= 7);
    if (teams.length < 2) return [];
    const n = teams.length;
    const rounds: MatchSlot[][] = [];
    const arr = teams.map((p) => p);
    const useGhost = n % 2 !== 0;
    if (useGhost) arr.push(null as any);
    const N = arr.length;
    const totalRounds = N - 1;
    for (let r = 0; r < totalRounds; r++) {
      const matches: MatchSlot[] = [];
      for (let i = 0; i < N / 2; i++) {
        const a = arr[i];
        const b = arr[N - 1 - i];
        if (a && b) {
          const home = r % 2 === 0 ? a : b;
          const away = r % 2 === 0 ? b : a;
          matches.push({
            round: r + 1,
            homeId: home.id,
            awayId: away.id,
            homeName: home.teamName || home.username,
            awayName: away.teamName || away.username,
          });
        }
      }
      rounds.push(matches);
      const fixed = arr[0];
      const rest = arr.slice(1);
      rest.unshift(rest.pop()!);
      arr.splice(0, arr.length, fixed, ...rest);
    }
    return rounds;
  }
}
