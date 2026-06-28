// Match simulation engine — pure TypeScript, no React / DB.
import type {
  Position,
  MatchEvent,
  MatchResult,
  MatchStats,
} from "./types";

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

/**
 * Maps a formation string (e.g. "4-3-3") to the list of required starting-XI
 * positions (always 11 entries, in a rough left-to-right / back-to-front order
 * — order is only cosmetic; matching is done by position counts).
 */
export const FORMATION_ROLES: Record<string, Position[]> = {
  "4-3-3": [
    "Goleiro",
    "Lateral Direito",
    "Zagueiro",
    "Zagueiro",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Meia Ofensivo",
    "Ponta Direita",
    "Centroavante",
    "Ponta Esquerda",
  ],
  "4-4-2": [
    "Goleiro",
    "Lateral Direito",
    "Zagueiro",
    "Zagueiro",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Ponta Direita",
    "Ponta Esquerda",
    "Centroavante",
    "Centroavante",
  ],
  "3-5-2": [
    "Goleiro",
    "Zagueiro",
    "Zagueiro",
    "Zagueiro",
    "Lateral Direito",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Meia Ofensivo",
    "Centroavante",
    "Centroavante",
  ],
  "4-2-3-1": [
    "Goleiro",
    "Lateral Direito",
    "Zagueiro",
    "Zagueiro",
    "Lateral Esquerdo",
    "Volante",
    "Volante",
    "Ponta Direita",
    "Meia Ofensivo",
    "Ponta Esquerda",
    "Centroavante",
  ],
  "5-3-2": [
    "Goleiro",
    "Lateral Direito",
    "Zagueiro",
    "Zagueiro",
    "Zagueiro",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Meia Ofensivo",
    "Centroavante",
    "Centroavante",
  ],
  "4-5-1": [
    "Goleiro",
    "Lateral Direito",
    "Zagueiro",
    "Zagueiro",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Meia Ofensivo",
    "Ponta Direita",
    "Ponta Esquerda",
    "Centroavante",
  ],
  "3-4-3": [
    "Goleiro",
    "Zagueiro",
    "Zagueiro",
    "Zagueiro",
    "Lateral Direito",
    "Lateral Esquerdo",
    "Volante",
    "Meio Campo",
    "Ponta Direita",
    "Centroavante",
    "Ponta Esquerda",
  ],
};

const DEFAULT_FORMATION: Position[] = FORMATION_ROLES["4-4-2"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamForSim {
  name: string;
  ovr: number;
  formation: string;
  players: { name: string; position: Position; overall: number }[];
  isHome?: boolean;
  chemistry?: number; // 0-100; if omitted, computed from squad
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knuth's Poisson sampler, capped to avoid pathological loops. */
function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 25);
  return k - 1;
}

function pickIndexByWeight(weights: number[], rng: () => number): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ---------------------------------------------------------------------------
// OVR & chemistry
// ---------------------------------------------------------------------------

/**
 * Position compatibility map — used to give partial chemistry credit when a
 * player covers an adjacent role (e.g. an "Atacante" filling a "Centroavante"
 * slot, or a "Meio Campo" deputising at "Volante").
 */
const POSITION_COMPAT: Partial<Record<Position, Position[]>> = {
  Goleiro: [],
  "Lateral Direito": ["Lateral Esquerdo", "Zagueiro"],
  "Lateral Esquerdo": ["Lateral Direito", "Zagueiro"],
  Zagueiro: ["Volante", "Lateral Direito", "Lateral Esquerdo"],
  Volante: ["Meio Campo", "Zagueiro"],
  "Meio Campo": ["Volante", "Meia Ofensivo"],
  "Meia Ofensivo": ["Ponta Direita", "Ponta Esquerda", "Meio Campo", "Atacante"],
  "Ponta Direita": ["Ponta Esquerda", "Meia Ofensivo", "Atacante"],
  "Ponta Esquerda": ["Ponta Direita", "Meia Ofensivo", "Atacante"],
  Atacante: ["Centroavante", "Ponta Direita", "Ponta Esquerda", "Meia Ofensivo"],
  Centroavante: ["Atacante"],
};

function covers(playerPos: Position, neededPos: Position): boolean {
  if (playerPos === neededPos) return true;
  return (POSITION_COMPAT[playerPos] ?? []).includes(neededPos);
}

/**
 * Computes the squad's overall (average of players' overall) and a chemistry
 * score 0-100 that reflects how well the players' positions cover the
 * formation's required starting-XI roles.
 *
 * Chemistry is computed in two passes:
 *   1. Exact matches consume a player at the exact required position
 *      (full credit, 1.0 per slot).
 *   2. Remaining slots are then matched against compatible adjacent
 *      positions (half credit, 0.5 per slot).
 *
 * The final score is `(exact + 0.5 * compat) / 11 * 100`, rounded to 0-100.
 */
export function computeTeamOVR(
  players: { overall: number; position: Position }[],
  formation: string
): { ovr: number; chemistry: number } {
  const required = FORMATION_ROLES[formation] ?? DEFAULT_FORMATION;
  const pool: Record<string, number> = {};
  for (const p of players) {
    pool[p.position] = (pool[p.position] ?? 0) + 1;
  }

  // Pass 1: exact matches.
  const openRoles: Position[] = [];
  for (const role of required) {
    if ((pool[role] ?? 0) > 0) {
      pool[role]--;
    } else {
      openRoles.push(role);
    }
  }

  // Pass 2: compatible positions for any unfilled role.
  let compatFilled = 0;
  for (const role of openRoles) {
    let filled = false;
    for (const posStr of Object.keys(pool)) {
      const pos = posStr as Position;
      if ((pool[pos] ?? 0) > 0 && covers(pos, role)) {
        pool[pos]--;
        filled = true;
        break;
      }
    }
    if (filled) compatFilled++;
  }

  const exactFilled = required.length - openRoles.length;
  const score = exactFilled + 0.5 * compatFilled;

  const ovr =
    players.length > 0
      ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length)
      : 0;
  const chemistry = Math.round((score / required.length) * 100);
  return { ovr, chemistry };
}

// ---------------------------------------------------------------------------
// Player-picking helpers (scorers, cards, subs, injuries)
// ---------------------------------------------------------------------------

function scorerWeight(pos: Position): number {
  switch (pos) {
    case "Centroavante":
    case "Atacante":
      return 10;
    case "Ponta Direita":
    case "Ponta Esquerda":
      return 7;
    case "Meia Ofensivo":
      return 5;
    case "Meio Campo":
      return 3;
    case "Volante":
      return 2;
    case "Zagueiro":
    case "Lateral Direito":
    case "Lateral Esquerdo":
      return 1.5;
    case "Goleiro":
      return 0.05;
    default:
      return 1;
  }
}

function cardWeight(pos: Position): number {
  // Defenders and defensive mids pick up more cards.
  switch (pos) {
    case "Goleiro":
      return 0.1;
    case "Volante":
      return 1.9;
    case "Zagueiro":
      return 1.7;
    case "Lateral Direito":
    case "Lateral Esquerdo":
      return 1.6;
    case "Meio Campo":
      return 1.5;
    case "Meia Ofensivo":
      return 1.3;
    case "Ponta Direita":
    case "Ponta Esquerda":
      return 1.1;
    case "Centroavante":
    case "Atacante":
      return 1.0;
    default:
      return 1;
  }
}

function pickScorer(
  players: { name: string; position: Position; overall: number }[],
  rng: () => number
): string {
  if (players.length === 0) return "Atacante Desconhecido";
  const weights = players.map(
    (p) => scorerWeight(p.position) * (0.5 + p.overall / 100)
  );
  return players[pickIndexByWeight(weights, rng)].name;
}

function pickCardedPlayer(
  players: { name: string; position: Position; overall: number }[],
  rng: () => number
): string {
  if (players.length === 0) return "Jogador Desconhecido";
  const weights = players.map((p) => cardWeight(p.position));
  return players[pickIndexByWeight(weights, rng)].name;
}

function pickSubPlayer(
  players: { name: string; position: Position; overall: number }[],
  rng: () => number
): string {
  if (players.length === 0) return "Substituto";
  // Bench players tend to be lower overall.
  const weights = players.map((p) => 100 / Math.max(50, p.overall));
  return players[pickIndexByWeight(weights, rng)].name;
}

function pickInjuredPlayer(
  players: { name: string; position: Position; overall: number }[],
  rng: () => number
): string {
  if (players.length === 0) return "Jogador";
  const weights = players.map((p) =>
    p.position === "Goleiro" ? 0.2 : 1
  );
  return players[pickIndexByWeight(weights, rng)].name;
}

function pickGoalkeeper(
  players: { name: string; position: Position; overall: number }[]
): string {
  const gk = players.find((p) => p.position === "Goleiro");
  return gk?.name ?? "Goleiro";
}

// ---------------------------------------------------------------------------
// Strength model
// ---------------------------------------------------------------------------

interface TeamStrength {
  attack: number;
  defense: number;
  chemistry: number;
  avgOvr: number;
  homeAdv: number;
}

function computeStrength(team: TeamForSim, rng: () => number): TeamStrength {
  const players = team.players ?? [];
  const avgOvr =
    players.length > 0
      ? players.reduce((s, p) => s + p.overall, 0) / players.length
      : team.ovr;

  const chemistry =
    team.chemistry ??
    computeTeamOVR(players, team.formation).chemistry;
  // Chemistry scales between 0.85 and 1.00 of nominal strength.
  const chemFactor = 0.85 + (chemistry / 100) * 0.15;

  // Historical "aura": tiny bonus for elite-rated sides.
  let aura = 1.0;
  if (avgOvr >= 88) aura = 1.04;
  else if (avgOvr >= 84) aura = 1.025;
  else if (avgOvr >= 80) aura = 1.015;

  // Home advantage: +5-8% to attack only (per spec).
  const homeAdv = team.isHome ? 1.05 + rng() * 0.03 : 1.0;

  const base = avgOvr * chemFactor * aura;
  return {
    attack: base * homeAdv,
    defense: base,
    chemistry,
    avgOvr,
    homeAdv,
  };
}

// ---------------------------------------------------------------------------
// simulateMatch
// ---------------------------------------------------------------------------

export function simulateMatch(
  home: TeamForSim,
  away: TeamForSim,
  seed?: number
): MatchResult {
  const actualSeed =
    seed ?? (Math.floor(Math.random() * 0x7fffffff) >>> 0);
  const rng = mulberry32(actualSeed);

  const homeTeam: TeamForSim = { ...home, isHome: home.isHome ?? true };
  const awayTeam: TeamForSim = { ...away, isHome: away.isHome ?? false };

  const H = computeStrength(homeTeam, rng);
  const A = computeStrength(awayTeam, rng);

  // Expected goals.
  const BASE_GOALS = 1.35;
  const ovrGap = Math.abs(H.avgOvr - A.avgOvr);
  // Big OVR gaps inflate the stronger side's xG (blowout potential).
  const gapBoost = ovrGap > 12 ? 1 + (ovrGap - 12) * 0.045 : 1;

  const ratioHome = H.attack / Math.max(1, A.defense);
  const ratioAway = A.attack / Math.max(1, H.defense);

  let lambdaHome = clamp(
    BASE_GOALS * ratioHome * (0.85 + rng() * 0.3),
    0.1,
    5.5
  );
  let lambdaAway = clamp(
    BASE_GOALS * ratioAway * (0.85 + rng() * 0.3),
    0.1,
    5.5
  );

  if (H.avgOvr > A.avgOvr) lambdaHome *= gapBoost;
  else if (A.avgOvr > H.avgOvr) lambdaAway *= gapBoost;

  lambdaHome = clamp(lambdaHome, 0.1, 5.5);
  lambdaAway = clamp(lambdaAway, 0.1, 5.5);

  const homeGoals = poisson(lambdaHome, rng);
  const awayGoals = poisson(lambdaAway, rng);

  // ----- Events -----
  const events: MatchEvent[] = [];

  function pickGoalMinute(): number {
    // Slight 2nd-half weighting (most goals come after the break).
    const r = rng();
    if (r < 0.45) return Math.floor(rng() * 45) + 1; // 1-45
    return Math.floor(rng() * 45) + 46; // 46-90
  }

  function pushGoal(team: "home" | "away", minute: number) {
    const players = team === "home" ? homeTeam.players : awayTeam.players;
    const scorer = pickScorer(players, rng);
    const useAssist = rng() < 0.6;
    const assist = useAssist ? pickScorer(players, rng) : null;
    const detail =
      assist && assist !== scorer
        ? `Gol de ${scorer}, assistência de ${assist}`
        : `Gol de ${scorer}`;
    events.push({ minute, type: "goal", team, player: scorer, detail });
  }

  for (let i = 0; i < homeGoals; i++) {
    pushGoal("home", pickGoalMinute());
  }
  for (let i = 0; i < awayGoals; i++) {
    pushGoal("away", pickGoalMinute());
  }

  // Yellow cards: 2-4 total, split roughly evenly between teams.
  const yellowCount = 2 + Math.floor(rng() * 3); // 2..4
  for (let i = 0; i < yellowCount; i++) {
    const team: "home" | "away" = rng() < 0.5 ? "home" : "away";
    const players = team === "home" ? homeTeam.players : awayTeam.players;
    const minute = Math.floor(rng() * 88) + 1;
    events.push({
      minute,
      type: "yellow",
      team,
      player: pickCardedPlayer(players, rng),
      detail: "Cartão amarelo",
    });
  }

  // Red card: ~5% chance per match.
  if (rng() < 0.05) {
    const team: "home" | "away" = rng() < 0.5 ? "home" : "away";
    const players = team === "home" ? homeTeam.players : awayTeam.players;
    const minute = Math.floor(rng() * 70) + 15; // 15-84
    events.push({
      minute,
      type: "red",
      team,
      player: pickCardedPlayer(players, rng),
      detail: "Cartão vermelho",
    });
  }

  // Injuries: ~8% chance per team.
  for (const team of ["home", "away"] as const) {
    if (rng() < 0.08) {
      const players = team === "home" ? homeTeam.players : awayTeam.players;
      const minute = Math.floor(rng() * 80) + 5; // 5-84
      events.push({
        minute,
        type: "injury",
        team,
        player: pickInjuredPlayer(players, rng),
        detail: "Lesão — substituição obrigatória",
      });
    }
  }

  // Subs: 2-3 per team after minute 60.
  for (const team of ["home", "away"] as const) {
    const subCount = 2 + Math.floor(rng() * 2); // 2..3
    const usedMinutes = new Set<number>();
    for (let i = 0; i < subCount; i++) {
      let minute = Math.floor(rng() * 30) + 60; // 60-89
      let guard = 0;
      while (usedMinutes.has(minute) && guard < 10) {
        minute = Math.floor(rng() * 30) + 60;
        guard++;
      }
      usedMinutes.add(minute);
      const players = team === "home" ? homeTeam.players : awayTeam.players;
      const out = pickCardedPlayer(players, rng);
      const inP = pickSubPlayer(players, rng);
      events.push({
        minute,
        type: "sub",
        team,
        player: out,
        detail: `Sai ${out}, entra ${inP}`,
      });
    }
  }

  // Chances and saves: scale with attack strength and total goals so the
  // event count correlates with the scoreline.
  const totalShotsBase = (H.attack + A.attack) / 2;
  const chanceCount = Math.floor(
    3 + rng() * 3 + (homeGoals + awayGoals) * 1.5 + totalShotsBase / 60
  );
  const homeAttackShare = H.attack / (H.attack + A.attack);
  for (let i = 0; i < chanceCount; i++) {
    const team: "home" | "away" =
      rng() < homeAttackShare ? "home" : "away";
    const players = team === "home" ? homeTeam.players : awayTeam.players;
    const minute = Math.floor(rng() * 90) + 1;
    if (rng() < 0.5) {
      // Save — credited to the opposing keeper.
      const keeperTeam: "home" | "away" = team === "home" ? "away" : "home";
      const keeperPlayers =
        keeperTeam === "home" ? homeTeam.players : awayTeam.players;
      events.push({
        minute,
        type: "save",
        team: keeperTeam,
        player: pickGoalkeeper(keeperPlayers),
        detail: "Grande defesa do goleiro",
      });
    } else {
      events.push({
        minute,
        type: "chance",
        team,
        player: pickScorer(players, rng),
        detail: "Chance perdida",
      });
    }
  }

  // Stable sort by minute (preserves insertion order for ties).
  events.sort((a, b) => a.minute - b.minute);

  // ----- Stats -----
  const possessionHome = clamp(
    Math.round(40 + homeAttackShare * 20 + (rng() - 0.5) * 6),
    35,
    65
  );
  const possessionAway = 100 - possessionHome;

  const shotsHome = clamp(
    Math.round(
      5 +
        (H.attack / 80) * 8 +
        (rng() - 0.3) * 5 +
        homeGoals * 1.2
    ),
    3,
    22
  );
  const shotsAway = clamp(
    Math.round(
      5 +
        (A.attack / 80) * 8 +
        (rng() - 0.3) * 5 +
        awayGoals * 1.2
    ),
    3,
    22
  );

  const sotRateHome = 0.4 + rng() * 0.15; // 40-55%
  const sotRateAway = 0.4 + rng() * 0.15;
  const shotsOnTargetHome = Math.max(
    homeGoals,
    Math.round(shotsHome * sotRateHome)
  );
  const shotsOnTargetAway = Math.max(
    awayGoals,
    Math.round(shotsAway * sotRateAway)
  );

  const cornersHome = clamp(
    Math.round(2 + (H.attack / 80) * 6 + (rng() - 0.3) * 3),
    0,
    12
  );
  const cornersAway = clamp(
    Math.round(2 + (A.attack / 80) * 6 + (rng() - 0.3) * 3),
    0,
    12
  );

  const stats: MatchStats = {
    possessionHome,
    possessionAway,
    shotsHome,
    shotsAway,
    shotsOnTargetHome,
    shotsOnTargetAway,
    cornersHome,
    cornersAway,
  };

  return {
    homeScore: homeGoals,
    awayScore: awayGoals,
    events,
    stats,
  };
}
