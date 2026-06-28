// Draft-phase bot AI — pure TypeScript, no React / DB.
import type { BotMode, HistoricalPlayer, Position } from "./types";
import { FORMATION_ROLES } from "./simulation";

// ---------------------------------------------------------------------------
// PRNG (mulberry32 — deterministic per seed)
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

function defaultSeed(): number {
  return (Math.floor(Math.random() * 0x7fffffff) >>> 0);
}

// ---------------------------------------------------------------------------
// Bot name generator
// ---------------------------------------------------------------------------

const BOT_MANAGER_NAMES: string[] = [
  "Tite",
  "Pep",
  "Cruyff",
  "Bielsa",
  "Mourinho",
  "Guardiola",
  "Ferguson",
  "Ancelotti",
  "Klopp",
  "Lippi",
  "Capello",
  "Simeone",
  "Wenger",
  "Hiddink",
  "Scolari",
  "Zagallo",
  "Parreira",
  "Luxemburgo",
  "Ranieri",
  "Conte",
  "Spalletti",
  "Tuchel",
  "Emery",
  "Nagelsmann",
  "De_Zerbi",
  "Xabi",
  "Maresca",
  "Flick",
  "Lobotka",
  "Cubero",
];

/**
 * Returns a fun bot username like "Bot_Tite" or "Bot_Pep". Deterministic for a
 * given seed.
 */
export function generateBotName(seed?: number): string {
  const rng = mulberry32((seed ?? defaultSeed()) >>> 0);
  const idx = Math.floor(rng() * BOT_MANAGER_NAMES.length);
  const safe = Math.max(0, Math.min(BOT_MANAGER_NAMES.length - 1, idx));
  return `Bot_${BOT_MANAGER_NAMES[safe]}`;
}

// ---------------------------------------------------------------------------
// Position-compatibility (kept in sync with simulation.ts)
// ---------------------------------------------------------------------------

const POSITION_COMPAT: Partial<Record<Position, Position[]>> = {
  Goleiro: [],
  "Lateral Direito": ["Lateral Esquerdo", "Zagueiro"],
  "Lateral Esquerdo": ["Lateral Direito", "Zagueiro"],
  Zagueiro: ["Volante", "Lateral Direito", "Lateral Esquerdo"],
  Volante: ["Meio Campo", "Zagueiro"],
  "Meio Campo": ["Volante", "Meia Ofensivo"],
  "Meia Ofensivo": [
    "Ponta Direita",
    "Ponta Esquerda",
    "Meio Campo",
    "Atacante",
  ],
  "Ponta Direita": ["Ponta Esquerda", "Meia Ofensivo", "Atacante"],
  "Ponta Esquerda": ["Ponta Direita", "Meia Ofensivo", "Atacante"],
  Atacante: ["Centroavante", "Ponta Direita", "Ponta Esquerda", "Meia Ofensivo"],
  Centroavante: ["Atacante"],
};

function covers(playerPos: Position, neededPos: Position): boolean {
  if (playerPos === neededPos) return true;
  return (POSITION_COMPAT[playerPos] ?? []).includes(neededPos);
}

// ---------------------------------------------------------------------------
// Need computation
// ---------------------------------------------------------------------------

/**
 * Returns the list of formation slots still unfilled by the current squad.
 * Each entry is one missing required position (e.g. two "Centroavante"
 * entries if both striker slots are empty).
 */
function neededPositions(
  squad: HistoricalPlayer[],
  formation: string
): Position[] {
  const required = FORMATION_ROLES[formation] ?? FORMATION_ROLES["4-4-2"];
  const remaining: Record<string, number> = {};
  for (const role of required) {
    remaining[role] = (remaining[role] ?? 0) + 1;
  }
  for (const p of squad) {
    if ((remaining[p.position] ?? 0) > 0) {
      remaining[p.position]--;
    }
  }
  const needed: Position[] = [];
  for (const [pos, count] of Object.entries(remaining)) {
    for (let i = 0; i < count; i++) needed.push(pos as Position);
  }
  return needed;
}

// ---------------------------------------------------------------------------
// Tier-based selection
// ---------------------------------------------------------------------------

/**
 * Pick a single player from `candidates` according to `botMode`.
 *
 * `candidates` is sorted best-first internally; the mode decides which slice
 * of the sorted list to sample from.
 *
 * - competitive: pick from the very top (slight variation so identical seeds
 *   don't always return the same player when filling different slots).
 * - balanced: sample from the upper-mid band (top 20-60%).
 * - favorable: avoid the elite — sample from the mid band (40-85%), leaving
 *   the best players in the pool for human drafters.
 * - weak: usually sample from the worst 30%, occasionally mid-tier.
 */
function pickByTier(
  candidates: HistoricalPlayer[],
  mode: BotMode,
  rng: () => number
): HistoricalPlayer | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.overall - a.overall);
  const n = sorted.length;
  let idx: number;

  switch (mode) {
    case "competitive": {
      // Usually the best; occasionally 2nd-best for variation.
      idx = rng() < 0.85 ? 0 : 1;
      break;
    }
    case "balanced": {
      const lo = Math.floor(n * 0.2);
      const hi = Math.max(lo + 1, Math.floor(n * 0.6));
      idx = lo + Math.floor(rng() * (hi - lo));
      break;
    }
    case "favorable": {
      const lo = Math.floor(n * 0.4);
      const hi = Math.max(lo + 1, Math.floor(n * 0.85));
      idx = lo + Math.floor(rng() * (hi - lo));
      break;
    }
    case "weak": {
      if (rng() < 0.7) {
        // Worst 30%.
        const lo = Math.max(0, n - Math.max(1, Math.floor(n * 0.3)));
        const hi = n;
        idx = lo + Math.floor(rng() * (hi - lo));
      } else {
        // Mid tier fallback.
        const lo = Math.floor(n * 0.4);
        const hi = Math.max(lo + 1, Math.floor(n * 0.7));
        idx = lo + Math.floor(rng() * (hi - lo));
      }
      break;
    }
    default: {
      idx = Math.floor(rng() * n);
    }
  }

  idx = Math.max(0, Math.min(n - 1, idx));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Choose `picksPerTurn` players for a bot given the current draft state.
 *
 * The bot first looks at which formation slots are still unfilled by its
 * squad and tries to fill them, falling back to compatible adjacent
 * positions, then to anyone. If the starting XI is already complete it
 * drafts bench players according to `botMode`.
 *
 * Behaviour per `botMode` is implemented in `pickByTier`.
 */
export function botPickPlayers(
  availablePlayers: HistoricalPlayer[],
  currentSquad: HistoricalPlayer[],
  botMode: BotMode,
  formation: string,
  picksPerTurn: number,
  seed?: number
): HistoricalPlayer[] {
  const rng = mulberry32((seed ?? defaultSeed()) >>> 0);
  const picks: HistoricalPlayer[] = [];
  const pickedIds = new Set<string>();
  for (const p of currentSquad) pickedIds.add(p.id);

  const available = availablePlayers.filter((p) => !pickedIds.has(p.id));
  let squad = [...currentSquad];

  for (let i = 0; i < picksPerTurn; i++) {
    if (available.length === 0) break;

    const needed = neededPositions(squad, formation);
    let candidates: HistoricalPlayer[];

    if (needed.length > 0) {
      // 1. Players at an exactly-needed position.
      candidates = available.filter((p) => needed.includes(p.position));
      // 2. Fall back to compatible positions.
      if (candidates.length === 0) {
        candidates = available.filter((p) =>
          needed.some((n) => covers(p.position, n))
        );
      }
      // 3. Last resort: anyone.
      if (candidates.length === 0) {
        candidates = available;
      }
    } else {
      // Starting XI complete — draft best bench by mode.
      candidates = available;
    }

    const pick = pickByTier(candidates, botMode, rng);
    if (!pick) break;

    picks.push(pick);
    pickedIds.add(pick.id);

    const idx = available.indexOf(pick);
    if (idx >= 0) available.splice(idx, 1);
    squad = [...squad, pick];
  }

  return picks;
}
