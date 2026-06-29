// Match simulation engine — pure TypeScript, no React / DB.
// Generates a realistic play-by-play sequence of events with server-computed
// ball positions so ALL clients see the EXACT same match.
import type {
  Position,
  MatchEvent,
  MatchEventType,
  MatchResult,
  MatchStats,
  PlayerStats,
} from "./types";

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

export const FORMATION_ROLES: Record<string, Position[]> = {
  "4-3-3": [
    "Goleiro", "Lateral Direito", "Zagueiro", "Zagueiro", "Lateral Esquerdo",
    "Volante", "Meio Campo", "Meia Ofensivo",
    "Ponta Direita", "Centroavante", "Ponta Esquerda",
  ],
  "4-4-2": [
    "Goleiro", "Lateral Direito", "Zagueiro", "Zagueiro", "Lateral Esquerdo",
    "Volante", "Meio Campo", "Ponta Direita", "Ponta Esquerda",
    "Centroavante", "Centroavante",
  ],
  "3-5-2": [
    "Goleiro", "Zagueiro", "Zagueiro", "Zagueiro",
    "Lateral Direito", "Lateral Esquerdo", "Volante", "Meio Campo", "Meia Ofensivo",
    "Centroavante", "Centroavante",
  ],
  "4-2-3-1": [
    "Goleiro", "Lateral Direito", "Zagueiro", "Zagueiro", "Lateral Esquerdo",
    "Volante", "Volante",
    "Ponta Direita", "Meia Ofensivo", "Ponta Esquerda",
    "Centroavante",
  ],
  "5-3-2": [
    "Goleiro", "Lateral Direito", "Zagueiro", "Zagueiro", "Zagueiro", "Lateral Esquerdo",
    "Volante", "Meio Campo", "Meia Ofensivo",
    "Centroavante", "Centroavante",
  ],
  "4-5-1": [
    "Goleiro", "Lateral Direito", "Zagueiro", "Zagueiro", "Lateral Esquerdo",
    "Volante", "Meio Campo", "Meia Ofensivo", "Ponta Direita", "Ponta Esquerda",
    "Centroavante",
  ],
  "3-4-3": [
    "Goleiro", "Zagueiro", "Zagueiro", "Zagueiro",
    "Lateral Direito", "Lateral Esquerdo", "Volante", "Meio Campo",
    "Ponta Direita", "Centroavante", "Ponta Esquerda",
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
  players: { name: string; position: Position; overall: number; stats?: PlayerStats }[];
  isHome?: boolean;
  chemistry?: number;
}

interface SimPlayer {
  name: string;
  position: Position;
  overall: number;
  stats: PlayerStats;
  index: number; // position in the formation order
}

interface TeamState {
  name: string;
  formation: string;
  players: SimPlayer[];
  isHome: boolean;
}

// ---------------------------------------------------------------------------
// Position Helpers
// ---------------------------------------------------------------------------

/**
 * Returns ballY position for a given zone during possession.
 * Zone 0 = own goal, 5 = opponent goal.
 * For HOME attacking: zones go from 0 (defensive) to 5 (scoring).
 * For AWAY attacking: zones go from 5 (defensive) to 0 (scoring).
 * ballY is CSS %: 0 = top of screen, 100 = bottom of screen.
 */
function zoneToBallY(zone: number, isHome: boolean): number {
  // Home y-ranges: goal=92, defense=80-88, midfield=55-75, attack=30-55, scoring=5-25
  // Away is reversed
  const homeZones = [88, 78, 62, 42, 20, 5];
  const awayZones = [5, 15, 35, 55, 75, 92];
  const ranges = isHome ? homeZones : awayZones;
  const z = Math.max(0, Math.min(5, Math.round(zone)));
  return ranges[z];
}

/** Return a random-ish x offset for width variety */
function randomX(zone: number, rng: () => number, isWide?: boolean): number {
  if (isWide) return rng() < 0.5 ? 8 + rng() * 12 : 80 + rng() * 12;
  return 25 + rng() * 50;
}

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
// Player roles and weights
// ---------------------------------------------------------------------------

function buildTeamState(team: TeamForSim, rng: () => number): TeamState {
  const players: SimPlayer[] = team.players.map((p, i) => ({
    name: p.name,
    position: p.position,
    overall: p.overall,
    stats: p.stats ?? {
      pace: Math.round(p.overall * (0.7 + rng() * 0.6)),
      shooting: Math.round(p.overall * (0.7 + rng() * 0.6)),
      passing: Math.round(p.overall * (0.7 + rng() * 0.6)),
      dribbling: Math.round(p.overall * (0.7 + rng() * 0.6)),
      defending: Math.round(p.overall * (0.7 + rng() * 0.6)),
      physical: Math.round(p.overall * (0.7 + rng() * 0.6)),
    },
    index: i,
  }));
  return { name: team.name, formation: team.formation, players, isHome: team.isHome ?? true };
}

/** Get the best player in a team for a given action type */
function pickPlayer(
  team: TeamState,
  actionType: 'pass' | 'dribble' | 'shoot' | 'defend' | 'recover' | 'cross',
  rng: () => number,
  exclude?: Set<string>
): SimPlayer {
  const pool = exclude ? team.players.filter(p => !exclude.has(p.name)) : team.players;
  if (pool.length === 0) return team.players[0];

  let weights: number[];
  switch (actionType) {
    case 'pass':
      weights = pool.map(p => {
        const passing = p.stats?.passing ?? p.overall;
        return passing * rolePassWeight(p.position);
      });
      break;
    case 'dribble':
      weights = pool.map(p => {
        const dribbling = p.stats?.dribbling ?? p.overall;
        return dribbling * roleDribbleWeight(p.position);
      });
      break;
    case 'shoot':
    case 'cross':
      weights = pool.map(p => {
        const shooting = p.stats?.shooting ?? p.overall;
        return shooting * roleShootWeight(p.position);
      });
      break;
    case 'defend':
      weights = pool.map(p => {
        const defending = p.stats?.defending ?? p.overall;
        return defending * roleDefendWeight(p.position);
      });
      break;
    case 'recover':
      weights = pool.map(p => {
        const defending = p.stats?.defending ?? p.overall;
        return (defending + (p.stats?.physical ?? p.overall)) * roleDefendWeight(p.position);
      });
      break;
    default:
      weights = pool.map(p => p.overall);
  }
  return pool[pickIndexByWeight(weights, rng)];
}

function rolePassWeight(pos: Position): number {
  switch (pos) {
    case "Meio Campo": case "Meia Ofensivo": return 1.8;
    case "Volante": return 1.4;
    case "Lateral Direito": case "Lateral Esquerdo": return 1.2;
    case "Ponta Direita": case "Ponta Esquerda": return 1.0;
    case "Centroavante": case "Atacante": return 0.7;
    case "Zagueiro": return 1.0;
    default: return 0.5;
  }
}

function roleDribbleWeight(pos: Position): number {
  switch (pos) {
    case "Ponta Direita": case "Ponta Esquerda": return 2.0;
    case "Meia Ofensivo": case "Centroavante": case "Atacante": return 1.5;
    case "Meio Campo": return 1.0;
    case "Lateral Direito": case "Lateral Esquerdo": return 1.3;
    default: return 0.3;
  }
}

function roleShootWeight(pos: Position): number {
  switch (pos) {
    case "Centroavante": case "Atacante": return 3.0;
    case "Meia Ofensivo": return 2.0;
    case "Ponta Direita": case "Ponta Esquerda": return 1.5;
    case "Meio Campo": return 0.8;
    default: return 0.2;
  }
}

function roleDefendWeight(pos: Position): number {
  switch (pos) {
    case "Zagueiro": return 2.5;
    case "Volante": return 2.0;
    case "Lateral Direito": case "Lateral Esquerdo": return 1.5;
    case "Meio Campo": return 1.0;
    default: return 0.3;
  }
}

// ---------------------------------------------------------------------------
// THE NEW PLAY-BY-PLAY ENGINE
// ---------------------------------------------------------------------------

export function simulateMatch(
  home: TeamForSim,
  away: TeamForSim,
  seed?: number
): MatchResult {
  const actualSeed = seed ?? (Math.floor(Math.random() * 0x7fffffff) >>> 0);
  const rng = mulberry32(actualSeed);

  const homeTeam = buildTeamState(home, rng);
  const awayTeam = buildTeamState(away, rng);

  const homeStrength = homeTeam.players.reduce((s, p) => s + p.overall, 0) / homeTeam.players.length;
  const awayStrength = awayTeam.players.reduce((s, p) => s + p.overall, 0) / awayTeam.players.length;
  const totalStrength = homeStrength + awayStrength;
  const homePossessionChance = homeStrength / totalStrength;

  // ---- Generate phases ----
  const allEvents: MatchEvent[] = [];

  // Utility: build a play event
  function makeEvent(
    minute: number,
    type: MatchEventType,
    team: 'home' | 'away',
    player: string,
    ballX: number,
    ballY: number,
    detail?: string,
    fromX?: number,
    fromY?: number,
    action?: MatchEvent['action']
  ): MatchEvent {
    return { minute, type, team, player, detail, ballX: clamp(ballX, 0, 100), ballY: clamp(ballY, 0, 100), fromX, fromY, action };
  }

  // Determine if a player exists (not sent off)
  const sentOffHome = new Set<string>();
  const sentOffAway = new Set<string>();
  function isActive(team: TeamState): SimPlayer[] {
    const sentOff = team.isHome ? sentOffHome : sentOffAway;
    return team.players.filter(p => !sentOff.has(p.name));
  }

  // Team stats tracking
  let homeShots = 0, awayShots = 0;
  let homeShotsOnTarget = 0, awayShotsOnTarget = 0;
  let homeCorners = 0, awayCorners = 0;
  let homeGoals = 0, awayGoals = 0;
  const yellowCards = new Map<string, number>();
  const allScorers: { player: string; team: 'home' | 'away'; minute: number }[] = [];

  // Kickoff at minute 0
  allEvents.push(makeEvent(0, 'kickoff', 'home', '—', 50, 50, 'Primeira etapa'));

  // ---- Generate possession phases ----
  // We generate ~15-35 possession phases distributed across 90 minutes
  const totalPhases = 18 + Math.floor(rng() * 14);
  const phaseMinutes: number[] = [];
  for (let i = 0; i < totalPhases; i++) {
    phaseMinutes.push(Math.floor(rng() * 88) + 1);
  }
  phaseMinutes.sort((a, b) => a - b);

  // Deduplicate minutes
  const uniqueMinutes = [...new Set(phaseMinutes)];

  // Track which minutes we used for possessions to avoid too many in same minute
  const usedMinutes = new Set<number>();

  for (const minute of uniqueMinutes) {
    if (usedMinutes.has(minute)) continue;
    usedMinutes.add(minute);

    // Determine which team has possession
    const homePossession = rng() < homePossessionChance;
    const attackingTeam = homePossession ? homeTeam : awayTeam;
    const defendingTeam = homePossession ? awayTeam : homeTeam;
    const isHomeAttacking = homePossession;
    const activeAttackers = isActive(attackingTeam);
    const activeDefenders = isActive(defendingTeam);
    if (activeAttackers.length < 7 || activeDefenders.length < 7) continue;

    // ---- PHASE: Build a possession play ----
    // Zone starts in defensive/midfield (0-2) and progresses (2-5)
    const startZone = 0.5 + rng() * 1.5;
    const maxZone = 4 + rng() * 1.0;

    // ---- 1. RECOVERY ----
    const recoverer = pickPlayer(attackingTeam, 'recover', rng);
    const recoveryZone = startZone;
    const recoveryY = zoneToBallY(recoveryZone, isHomeAttacking);
    const recoveryX = randomX(recoveryZone, rng);
    const usedPlayers = new Set<string>();
    usedPlayers.add(recoverer.name);

    allEvents.push(makeEvent(
      minute, 'tackle', isHomeAttacking ? 'home' : 'away', recoverer.name,
      recoveryX, recoveryY,
      `${recoverer.name} recupera a posse`,
      undefined, undefined
    ));

    // ---- 2. POSITIONING ADJUSTMENT (players reposition) ----
    // Show a brief player movement before the pass sequence
    if (rng() < 0.4) {
      const mover = recoverer;
      const posX = currentX + (rng() - 0.5) * 8;
      const posY = currentY + (rng() - 0.5) * 6;
      allEvents.push(makeEvent(minute, 'dribble', isHomeAttacking ? 'home' : 'away', mover.name,
        posX, posY, `${mover.name} se posiciona`,
        currentX, currentY
      ));
      currentX = posX;
      currentY = posY;
    }

    // ---- 2. BUILD-UP structured like Brasfoot (short passes, triangulations) ----
    let currentZone = startZone + 0.3;
    let currentX = recoveryX;
    let currentY = recoveryY;
    let currentPlayer = recoverer;
    let passCount = 0;
    // Build-up: 2-4 short passes max — always short, no long balls in buildup
    const maxBuildUpPasses = 2 + Math.floor(rng() * 2);

    for (let p = 0; p < maxBuildUpPasses && currentZone < maxZone - 0.8; p++) {
      const passer = currentPlayer;
      // Prefer nearby players (midfielders first, then fullbacks, then forwards)
      const receiver = pickPlayer(attackingTeam, 'pass', rng, usedPlayers);
      usedPlayers.add(receiver.name);
      passCount++;

      // Progress zone slowly — 0.2 to 0.5 per pass (gradual buildup)
      currentZone += 0.2 + rng() * 0.4;
      // Always short pass during buildup
      const newY = zoneToBallY(currentZone, isHomeAttacking);
      const newX = randomX(currentZone, rng,
        receiver.position === 'Ponta Direita' || receiver.position === 'Ponta Esquerda');

      const fromX = currentX;
      const fromY = currentY;

      // Short, quick passes
      allEvents.push(makeEvent(
        minute, 'pass',
        isHomeAttacking ? 'home' : 'away', passer.name,
        newX, newY,
        `${passer.name} → ${receiver.name}`,
        fromX, fromY
      ));

      currentX = newX;
      currentY = newY;
      currentPlayer = receiver;

      // Sometimes add a small player movement after the pass (repositioning)
      if (rng() < 0.35 && passCount < maxBuildUpPasses - 1) {
        const repositionX = newX + (rng() - 0.5) * 5;
        const repositionY = newY + (rng() - 0.5) * 4;
        allEvents.push(makeEvent(minute, 'dribble', isHomeAttacking ? 'home' : 'away', receiver.name,
          repositionX, repositionY,
          `${receiver.name} ajeita o corpo`,
          newX, newY
        ));
        currentX = repositionX;
        currentY = repositionY;
      }
    }

    // ---- 3. PROGRESSION (1-2 attacking passes or a dribble forward) ----
    let playStopped = false;
    const hasProgression = passCount >= 1 && currentZone < maxZone - 0.5;
    if (hasProgression) {
      const progressCount = 1 + Math.floor(rng() * 1);
      for (let p = 0; p < progressCount && currentZone < maxZone - 0.3 && !playStopped; p++) {
        const useDribble = rng() < 0.25 && roleDribbleWeight(currentPlayer.position) > 0.8;
        if (useDribble) {
          currentZone += 0.4 + rng() * 0.4;
          const newY = zoneToBallY(currentZone, isHomeAttacking);
          const newX = currentX + (rng() - 0.5) * 12;
          allEvents.push(makeEvent(
            minute, 'dribble',
            isHomeAttacking ? 'home' : 'away', currentPlayer.name,
            newX, newY,
            `${currentPlayer.name} avança conduzindo`,
            currentX, currentY
          ));
          currentX = newX;
          currentY = newY;
        } else {
          // Progressive pass (to a more advanced position - through ball or short pass)
          const receiver = pickPlayer(attackingTeam, 'pass', rng, usedPlayers);
          usedPlayers.add(receiver.name);
          currentZone += 0.5 + rng() * 0.4;
          const Dist = currentZone * 10;
          const isLongBall = rng() < 0.15; // 15% chance of through ball
          const newY = zoneToBallY(currentZone, isHomeAttacking);
          const newX = randomX(currentZone, rng,
            receiver.position === 'Ponta Direita' || receiver.position === 'Ponta Esquerda');
          const fromX = currentX;
          const fromY = currentY;

          // Check for offside on through balls
          if (isLongBall && currentZone > 3.5 && rng() < 0.08) {
            allEvents.push(makeEvent(
              minute, 'offside',
              isHomeAttacking ? 'home' : 'away', receiver.name,
              newX, zoneToBallY(currentZone - 0.3, isHomeAttacking),
              `Impedimento! ${receiver.name} está impedido`,
              fromX, fromY, 'offside_flag'
            ));
            const defGK = defendingTeam.players.find(p => p.position === 'Goleiro')!;
            const gkY = isHomeAttacking ? 88 : 5;
            allEvents.push(makeEvent(
              minute, 'free_kick',
              isHomeAttacking ? 'away' : 'home', defGK?.name || 'Goleiro',
              currentX, gkY,
              `Tiro livre indireto para ${defendingTeam.name}`,
              currentX, zoneToBallY(currentZone - 0.3, isHomeAttacking)
            ));
            playStopped = true;
            break;
          }

          const passType = isLongBall ? 'through_ball' : 'pass';
          allEvents.push(makeEvent(
            minute, passType as MatchEventType,
            isHomeAttacking ? 'home' : 'away', currentPlayer.name,
            newX, newY,
            isLongBall ? `${currentPlayer.name} enfia para ${receiver.name}` : `${currentPlayer.name} toca para ${receiver.name}`,
            fromX, fromY
          ));
          currentX = newX;
          currentY = newY;
          currentPlayer = receiver;
        }
      }
    }

    // ---- 4. FINALIZATION ----
    // Skip if play was stopped (offside, etc.)
    if (!playStopped && currentZone > 2.8) {
      const shooter = currentPlayer;
      const isWinger = currentPlayer.position === 'Ponta Direita' || currentPlayer.position === 'Ponta Esquerda';
      const isCentral = currentPlayer.position === 'Centroavante' || currentPlayer.position === 'Atacante' || currentPlayer.position === 'Meia Ofensivo';
      const shotType: MatchEventType = isWinger && rng() < 0.55 
        ? 'cross' 
        : isCentral && rng() < 0.75
          ? 'shot'
          : rng() < 0.4 ? 'cross' : 'shot';
      
      if (shotType === 'cross') {
        // Cross into the box
        const crossX = isHomeAttacking ? 50 + (rng() - 0.5) * 20 : 50 + (rng() - 0.5) * 20;
        const crossY = zoneToBallY(currentZone + 0.5, isHomeAttacking);
        const fromX = currentX;
        const fromY = currentY;

        allEvents.push(makeEvent(
          minute, 'cross',
          isHomeAttacking ? 'home' : 'away', shooter.name,
          crossX, crossY,
          `${shooter.name} cruza na área`,
          fromX, fromY
        ));

        // Header attempt
        const header = pickPlayer(attackingTeam, 'shoot', rng);
        const headerX = 50 + (rng() - 0.5) * 15;
        const headerY = zoneToBallY(currentZone + 0.8, isHomeAttacking);

        allEvents.push(makeEvent(
          minute, 'header',
          isHomeAttacking ? 'home' : 'away', header.name,
          headerX, headerY,
          `${header.name} cabeceia!`,
          crossX, crossY
        ));

        currentX = headerX;
        currentY = headerY;
        currentPlayer = header;
        currentZone += 0.8;

        // Determine result of header
        const shootStat = shooter.stats?.shooting ?? shooter.overall;
        const defStat = defendingTeam.players.reduce((s, p) => s + (p.stats?.defending ?? p.overall), 0) / defendingTeam.players.length;
        const goalChance = (shootStat / 100) * (1 - defStat / 120) * 0.35;

        if (rng() < goalChance) {
          // GOAL!
          homeGoals += isHomeAttacking ? 1 : 0;
          awayGoals += isHomeAttacking ? 0 : 1;
          homeShotsOnTarget += isHomeAttacking ? 1 : 0;
          awayShotsOnTarget += isHomeAttacking ? 0 : 1;
          homeShots++;
          awayShots++;
          allScorers.push({ player: header.name, team: isHomeAttacking ? 'home' : 'away', minute });

          allEvents.push(makeEvent(
            minute, 'goal',
            isHomeAttacking ? 'home' : 'away', header.name,
            isHomeAttacking ? 50 : 50, isHomeAttacking ? 2 : 98,
            `GOL! ${header.name} marca de cabeça!${shooter.name !== header.name ? ` Assistência de ${shooter.name}` : ''}`,
            headerX, headerY, 'goal_scored'
          ));
        } else if (rng() < 0.2) {
          // Corner
          homeCorners += isHomeAttacking ? 1 : 0;
          awayCorners += isHomeAttacking ? 0 : 1;
          const cornerX = isHomeAttacking ? 92 : 8;
          const cornerY = isHomeAttacking ? 2 : 98;
          allEvents.push(makeEvent(
            minute, 'corner',
            isHomeAttacking ? 'home' : 'away', header.name,
            cornerX, cornerY,
            `Escanteio para ${attackingTeam.name}`,
            headerX, headerY, 'corner_kick'
          ));
        } else if (rng() < 0.3) {
          // Save
          const gk = defendingTeam.players.find(p => p.position === 'Goleiro')!;
          const gkY = isHomeAttacking ? 6 : 94;
          homeShotsOnTarget += isHomeAttacking ? 1 : 0;
          awayShotsOnTarget += isHomeAttacking ? 0 : 1;
          homeShots++;
          awayShots++;
          allEvents.push(makeEvent(
            minute, 'save',
            isHomeAttacking ? 'away' : 'home', gk?.name || 'Goleiro',
            50 + (rng() - 0.5) * 20, gkY,
            `Grande defesa de ${gk?.name || 'Goleiro'}!`,
            headerX, headerY, 'save'
          ));
        } else {
          // Misses
          homeShots++;
          awayShots++;
          const goalY = isHomeAttacking ? 2 : 98;
          allEvents.push(makeEvent(
            minute, 'shot',
            isHomeAttacking ? 'home' : 'away', header.name,
            isHomeAttacking ? 50 + (rng() - 0.5) * 15 : 50 + (rng() - 0.5) * 15,
            goalY,
            `${header.name} cabeceia para fora!`,
            headerX, headerY
          ));
        }
      } else {
        // Shot attempt
        const fromX = currentX;
        const fromY = currentY;
        const goalX = 50 + (rng() - 0.5) * 20;
        const goalY = isHomeAttacking ? 3 : 97;

        allEvents.push(makeEvent(
          minute, 'shot',
          isHomeAttacking ? 'home' : 'away', shooter.name,
          goalX, goalY,
          `${shooter.name} finaliza!`,
          fromX, fromY
        ));

        // Determine shot result
        const shootStat = shooter.stats?.shooting ?? shooter.overall;
        const gkStat = defendingTeam.players.find(p => p.position === 'Goleiro')?.stats?.shooting ?? 70;
        const shotOnTarget = rng() < (0.5 + (shootStat - 50) * 0.005);

        if (shotOnTarget) {
          homeShotsOnTarget += isHomeAttacking ? 1 : 0;
          awayShotsOnTarget += isHomeAttacking ? 0 : 1;
          homeShots++;
          awayShots++;
          const goalChance = (shootStat / 100) * 0.35 * (1 - (gkStat / 200));

          if (rng() < goalChance) {
            // GOAL!
            homeGoals += isHomeAttacking ? 1 : 0;
            awayGoals += isHomeAttacking ? 0 : 1;
            allScorers.push({ player: shooter.name, team: isHomeAttacking ? 'home' : 'away', minute });

            allEvents.push(makeEvent(
              minute, 'goal',
              isHomeAttacking ? 'home' : 'away', shooter.name,
              isHomeAttacking ? 50 : 50, isHomeAttacking ? 2 : 98,
              `⚽ GOL! ${shooter.name} marca!`,
              goalX, goalY, 'goal_scored'
            ));
          } else {
            // Save
            const gk = defendingTeam.players.find(p => p.position === 'Goleiro')!;
            const gkY = isHomeAttacking ? 6 : 94;
            allEvents.push(makeEvent(
              minute, 'save',
              isHomeAttacking ? 'away' : 'home', gk?.name || 'Goleiro',
              50 + (rng() - 0.5) * 15, gkY,
              `Defesa de ${gk?.name || 'Goleiro'}!`,
              goalX, goalY, 'save'
            ));
          }
        } else {
          homeShots++;
          awayShots++;
          const wide = rng() < 0.4;
          if (wide) {
            const gkY = isHomeAttacking ? 6 : 94;
            allEvents.push(makeEvent(
              minute, 'goal_kick',
              isHomeAttacking ? 'away' : 'home',
              defendingTeam.players.find(p => p.position === 'Goleiro')?.name || 'Goleiro',
              50 + (rng() - 0.5) * 10, gkY,
              `Tiro de meta`,
              goalX, goalY, 'goal_kick_taken'
            ));
          } else {
            // Corner
            homeCorners += isHomeAttacking ? 1 : 0;
            awayCorners += isHomeAttacking ? 0 : 1;
            const cornerX = isHomeAttacking ? 92 : 8;
            const cornerY = isHomeAttacking ? 2 : 98;
            allEvents.push(makeEvent(
              minute, 'corner',
              isHomeAttacking ? 'home' : 'away', shooter.name,
              cornerX, cornerY,
              `Escanteio para ${attackingTeam.name}`,
              goalX, goalY, 'corner_kick'
            ));
          }
        }
      }
    } else {
      // Didn't reach shooting zone — defensive action or foul
      if (rng() < 0.15) {
        // Foul!
        const fouler = pickPlayer(defendingTeam, 'defend', rng);
        const fouled = currentPlayer;
        allEvents.push(makeEvent(
          minute, 'foul',
          isHomeAttacking ? 'away' : 'home', fouler.name,
          currentX, currentY,
          `Falta de ${fouler.name} em ${fouled.name}`,
          currentX, currentY, 'foul'
        ));

        // Check for card
        const defStat = fouler.stats?.defending ?? fouler.overall;
        if (rng() < 0.35) {
          const teamKey = `${isHomeAttacking ? 'away' : 'home'}_${fouler.name}`;
          const currentYellows = yellowCards.get(teamKey) ?? 0;
          yellowCards.set(teamKey, currentYellows + 1);

          if (currentYellows >= 1) {
            // Second yellow -> red
            allEvents.push(makeEvent(
              minute, 'red',
              isHomeAttacking ? 'away' : 'home', fouler.name,
              currentX, currentY,
              `Cartão vermelho! ${fouler.name} é expulso!`,
              undefined, undefined
            ));
            if (isHomeAttacking) sentOffAway.add(fouler.name);
            else sentOffHome.add(fouler.name);
          } else {
            allEvents.push(makeEvent(
              minute, 'yellow',
              isHomeAttacking ? 'away' : 'home', fouler.name,
              currentX, currentY,
              `Cartão amarelo para ${fouler.name}`,
              undefined, undefined
            ));
          }
        }

        // Free kick
        const fkY = zoneToBallY(currentZone - 0.2, isHomeAttacking);
        allEvents.push(makeEvent(
          minute, 'free_kick',
          isHomeAttacking ? 'home' : 'away', fouled.name,
          currentX, fkY,
          `Tiro livre para ${attackingTeam.name}`,
          currentX, currentY, 'free_kick'
        ));
      }
    }
  }

  // ---- Generate cards (independent of phases for variety) ----
  const yellowCount = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < yellowCount; i++) {
    const minute = 10 + Math.floor(rng() * 75);
    const isHome = rng() < 0.5;
    const team = isHome ? homeTeam : awayTeam;
    const active = isActive(team);
    if (active.length === 0) continue;
    const player = pickPlayer(team, 'defend', rng);
    const teamKey = `${isHome}_${player.name}`;
    const currentYellows = yellowCards.get(teamKey) ?? 0;
    yellowCards.set(teamKey, currentYellows + 1);

    if (currentYellows >= 1) {
      allEvents.push(makeEvent(
        minute, 'red',
        isHome ? 'home' : 'away', player.name,
        50, zoneToBallY(rng() * 4, isHome),
        `Cartão vermelho! ${player.name} é expulso (segundo amarelo)`
      ));
      if (isHome) sentOffHome.add(player.name);
      else sentOffAway.add(player.name);
    } else {
      allEvents.push(makeEvent(
        minute, 'yellow',
        isHome ? 'home' : 'away', player.name,
        50, zoneToBallY(rng() * 4, isHome),
        `Cartão amarelo para ${player.name}`
      ));
    }
  }

  // ---- Generate injuries ----
  for (const isHome of [true, false]) {
    if (rng() < 0.1) {
      const team = isHome ? homeTeam : awayTeam;
      const active = isActive(team);
      if (active.length > 1) {
        const minute = 20 + Math.floor(rng() * 60);
        const injured = pickPlayer(team, 'defend', rng);
        allEvents.push(makeEvent(
          minute, 'injury',
          isHome ? 'home' : 'away', injured.name,
          50, zoneToBallY(2 + rng() * 2, isHome),
          `Lesão! ${injured.name} precisa ser substituído`
        ));
        if (isHome) sentOffHome.add(injured.name);
        else sentOffAway.add(injured.name);

        // Substitution
        const sub = team.players.find(p => !sentOffHome.has(p.name) && !sentOffAway.has(p.name) && p.name !== injured.name);
        if (sub) {
          allEvents.push(makeEvent(
            minute, 'sub',
            isHome ? 'home' : 'away', injured.name,
            50, zoneToBallY(2 + rng() * 2, isHome),
            `Sai ${injured.name}, entra ${sub.name}`
          ));
        }
      }
    }
  }

  // ---- Substitutions after minute 60 ----
  for (const isHome of [true, false]) {
    if (rng() < 0.5) {
      const team = isHome ? homeTeam : awayTeam;
      const active = isActive(team);
      if (active.length > 3) {
        const minute = 60 + Math.floor(rng() * 25);
        const out = pickPlayer(team, 'defend', rng);
        const inPlayer = team.players.find(p => p.name !== out.name && !sentOffHome.has(p.name) && !sentOffAway.has(p.name));
        if (inPlayer) {
          allEvents.push(makeEvent(
            minute, 'sub',
            isHome ? 'home' : 'away', out.name,
            50, zoneToBallY(3, isHome),
            `Substituição: sai ${out.name}, entra ${inPlayer.name}`
          ));
          if (isHome) sentOffHome.add(out.name);
          else sentOffAway.add(out.name);
        }
      }
    }
  }

  // ---- Sort events by minute ----
  allEvents.sort((a, b) => a.minute - b.minute || a.type.localeCompare(b.type));

  // ---- Compute stats ----
  // Count actual events by type for stats
  let actualHomeShots = allEvents.filter(e => e.team === 'home' && (e.type === 'shot' || e.type === 'header')).length;
  let actualAwayShots = allEvents.filter(e => e.team === 'away' && (e.type === 'shot' || e.type === 'header')).length;

  const actualHomeSOT = allEvents.filter(e => e.team === 'home' && (e.type === 'goal' || e.type === 'save')).length;
  const actualAwaySOT = allEvents.filter(e => e.team === 'away' && (e.type === 'goal' || e.type === 'save')).length;

  const actualHomeCorners = allEvents.filter(e => e.team === 'home' && e.type === 'corner').length;
  const actualAwayCorners = allEvents.filter(e => e.team === 'away' && e.type === 'corner').length;

  const possessionHome = Math.round(40 + (homePossessionChance - 0.5) * 40 + (rng() - 0.5) * 6);
  const possessionAway = 100 - possessionHome;

  const stats: MatchStats = {
    possessionHome: clamp(possessionHome, 30, 70),
    possessionAway: clamp(possessionAway, 30, 70),
    shotsHome: clamp(Math.max(homeShots, actualHomeShots), 2, 25),
    shotsAway: clamp(Math.max(awayShots, actualAwayShots), 2, 25),
    shotsOnTargetHome: clamp(Math.max(actualHomeSOT, homeShotsOnTarget), 0, 15),
    shotsOnTargetAway: clamp(Math.max(actualAwaySOT, awayShotsOnTarget), 0, 15),
    cornersHome: clamp(actualHomeCorners, 0, 12),
    cornersAway: clamp(actualAwayCorners, 0, 12),
  };

  return {
    homeScore: homeGoals,
    awayScore: awayGoals,
    events: allEvents,
    stats,
  };
}

// =====================================================================
// Team OVR & chemistry (kept from original for compatibility)
// =====================================================================

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

export function computeTeamOVR(
  players: { overall: number; position: Position }[],
  formation: string
): { ovr: number; chemistry: number } {
  const required = FORMATION_ROLES[formation] ?? DEFAULT_FORMATION;
  const pool: Record<string, number> = {};
  for (const p of players) {
    pool[p.position] = (pool[p.position] ?? 0) + 1;
  }
  const openRoles: Position[] = [];
  for (const role of required) {
    if ((pool[role] ?? 0) > 0) {
      pool[role]--;
    } else {
      openRoles.push(role);
    }
  }
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
  const ovr = players.length > 0
    ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length)
    : 0;
  const chemistry = Math.round((score / required.length) * 100);
  return { ovr, chemistry };
}
