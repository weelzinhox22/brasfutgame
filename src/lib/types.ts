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
}

export const DEFAULT_SETTINGS: RoomSettings = {
  teamFilter: "mixed",
  botCount: 4,
  simSpeed: "normal",
  rounds: 1,
  botMode: "balanced",
  maxPlayers: 12,
};

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

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "injury" | "sub" | "chance" | "save";
  team: "home" | "away";
  player: string;
  detail?: string;
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
