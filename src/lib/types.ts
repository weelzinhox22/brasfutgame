// Shared types for the Football Historic Championship system

export const POSITIONS = [
  "Goleiro",
  "Lateral Direito",
  "Zagueiro",
  "Lateral Esquerdo",
  "Volante",
  "Meio Campo",
  "Meia Ofensivo",
  "Ponta Direita",
  "Ponta Esquerda",
  "Atacante",
  "Centroavante",
] as const;

export type Position = (typeof POSITIONS)[number];

export const BOT_MODES = [
  "weak",
  "balanced",
  "favorable",
  "competitive",
] as const;

export type BotMode = (typeof BOT_MODES)[number];

export const BOT_MODE_LABELS: Record<BotMode, string> = {
  weak: "Fraco",
  balanced: "Equilibrado",
  favorable: "Favorável aos Humanos",
  competitive: "Competitivo",
};

export const TEAM_FILTERS = ["brazilian", "international", "mixed"] as const;
export type TeamFilter = (typeof TEAM_FILTERS)[number];

export const SIM_SPEEDS = [
  { value: "slow", label: "Lenta", seconds: 25 },
  { value: "normal", label: "Normal", seconds: 15 },
  { value: "fast", label: "Rápida", seconds: 8 },
  { value: "turbo", label: "Turbo", seconds: 4 },
] as const;

export type SimSpeed = (typeof SIM_SPEEDS)[number]["value"];

// Competition formats
export const COMPETITION_FORMATS = [
  { value: "custom", label: "Personalizado", description: "N rodadas (turno e returno)" },
  { value: "brasileirao", label: "Brasileirão", description: "20 times · 38 rodadas (turno e returno)" },
  { value: "ucl-2026", label: "UCL 2026", description: "Fase de liga + mata-mata (modelo UEFA 2026)" },
] as const;

export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number]["value"];

export interface PlayerStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface HistoricalTeam {
  id: string;
  name: string;
  year: number;
  country: string;
  league: string;
  ovr: number;
  formation: string;
  decade: number;
  badgeColor: string;
  accentColor: string;
  description: string;
}

export interface HistoricalPlayer {
  id: string;
  name: string;
  position: Position;
  overall: number;
  country: string;
  club: string;
  year: number;
  decade: number;
  photoColor: string;
  stats: PlayerStats;
  teamId: string | null;
}

export interface RoomSettings {
  teamFilter: TeamFilter;
  botCount: number;
  simSpeed: SimSpeed;
  rounds: number;
  botMode: BotMode;
  maxPlayers: number;
  competitionFormat: CompetitionFormat;
  hideOvr: boolean; // hide OVR on draft cards, show only names
  privatePicks: boolean; // hide picked cards from other players
  skipDraft: boolean; // skip manual draft, auto-assign random players
}

export const DEFAULT_SETTINGS: RoomSettings = {
  teamFilter: "mixed",
  botCount: 4,
  simSpeed: "normal",
  rounds: 1,
  botMode: "balanced",
  maxPlayers: 20,
  competitionFormat: "custom",
  hideOvr: false,
  privatePicks: false,
  skipDraft: false,
};

// Compute number of rounds based on format + participant count
export function computeRounds(format: CompetitionFormat, participantCount: number): number {
  if (format === "brasileirao") return Math.max(2, (participantCount - 1) * 2); // double round-robin
  if (format === "ucl-2026") return 8; // league phase: 8 matches per team
  // custom: respect settings.rounds
  return Math.max(1, Math.min(participantCount - 1, 3));
}

export interface RoomParticipant {
  id: string;
  userId: string;
  username: string;
  isBot: boolean;
  botMode: BotMode | null;
  isHost: boolean;
  joinedAt: string;
  teamName: string | null;
  teamOvr: number;
  squad: string[];
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hasPassword: boolean;
  status: "waiting" | "draft" | "playing" | "finished";
  settings: RoomSettings;
  createdAt: string;
  participantCount: number;
}

export type ChatMessage = {
  id: string;
  roomId: string;
  username: string;
  content: string;
  type: "user" | "system" | "bot";
  createdAt: string;
};

export type MatchEventType =
  | "kickoff"
  | "pass"
  | "long_pass"
  | "through_ball"
  | "cross"
  | "dribble"
  | "tackle"
  | "interception"
  | "clearance"
  | "shot"
  | "header"
  | "save"
  | "goal"
  | "corner"
  | "goal_kick"
  | "free_kick"
  | "foul"
  | "yellow"
  | "red"
  | "offside"
  | "injury"
  | "sub"
  | "chance"
  | "throw_in"
  | "half_start"
  | "half_end"
  | "match_end";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "home" | "away";
  player: string;
  detail?: string;
  /** Position-related fields */
  pos?: Position;
  /** Where the ball should be positioned AFTER this event (0-100 % of pitch) */
  ballX: number;
  ballY: number;
  /** Where the ball was before this action (for pass trajectory animation) */
  fromX?: number;
  fromY?: number;
  /** Special animation hint for the client */
  action?: "goal_scored" | "goal_kickoff" | "corner_kick" | "save" | "foul" | "free_kick" | "offside_flag" | "goal_kick_taken";
}

export interface MatchStats {
  possessionHome: number;
  possessionAway: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  cornersHome: number;
  cornersAway: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  stats: MatchStats;
}

export interface ChampionshipStanding {
  id: string;
  participantId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface UserRanking {
  id: string;
  username: string;
  country: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  championships: number;
  points: number;
  matchesPlayed: number;
}

// Draft phase
export interface DraftState {
  roomId: string;
  order: string[]; // participant ids in draft order
  currentTurnIndex: number;
  currentRound: number; // which pass through the order
  totalRounds: number; // number of passes (e.g., 6 rounds * 2 picks = 12 players, but we need 11)
  picksPerTurn: number;
  picks: DraftPick[];
  status: "rolling" | "choosing" | "done";
  lastRoll: number | null;
}

export interface DraftPick {
  participantId: string;
  playerId: string;
  playerName: string;
  position: Position;
  overall: number;
  round: number;
  pickIndex: number;
}

// App view state (single page app)
export type AppView =
  | "login"
  | "lobby"
  | "room"
  | "draft"
  | "championship"
  | "history"
  | "ranking";
