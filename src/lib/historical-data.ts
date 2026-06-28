// Historical teams & players dataset generator.
// Deterministic (seeded) generator producing ~500 teams and ~8000 players
// spanning decades 1950s-2010s across many countries.

import type { Position, PlayerStats } from './types';
import { POSITIONS } from './types';

// ============================================================
// Types
// ============================================================

export interface HistoricalTeamData {
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

export interface HistoricalPlayerData {
  name: string;
  position: Position;
  overall: number;
  country: string;
  club: string;
  year: number;
  decade: number;
  photoColor: string;
  stats: PlayerStats;
  teamId: string | null; // filled by the seed script after teams are inserted
}

interface Star {
  name: string;
  position: Position;
  overall?: number;
  country?: string;
}

interface CuratedTeam extends HistoricalTeamData {
  stars: Star[];
}

// ============================================================
// Seeded PRNG (mulberry32)
// ============================================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Formations (each maps to 11 starter positions)
// ============================================================

const FORMATIONS: Record<string, Position[]> = {
  '4-3-3': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Meio Campo',
    'Meio Campo',
    'Ponta Direita',
    'Centroavante',
    'Ponta Esquerda',
  ],
  '4-4-2': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Meio Campo',
    'Meio Campo',
    'Meia Ofensivo',
    'Centroavante',
    'Centroavante',
  ],
  '4-4-2 losango': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Meio Campo',
    'Meia Ofensivo',
    'Ponta Direita',
    'Ponta Esquerda',
    'Centroavante',
  ],
  '3-5-2': [
    'Goleiro',
    'Zagueiro',
    'Zagueiro',
    'Zagueiro',
    'Lateral Direito',
    'Volante',
    'Meio Campo',
    'Meio Campo',
    'Lateral Esquerdo',
    'Centroavante',
    'Centroavante',
  ],
  '4-2-3-1': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Volante',
    'Ponta Direita',
    'Meia Ofensivo',
    'Ponta Esquerda',
    'Centroavante',
  ],
  '5-3-2': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Meio Campo',
    'Meio Campo',
    'Centroavante',
    'Centroavante',
  ],
  '3-4-3': [
    'Goleiro',
    'Zagueiro',
    'Zagueiro',
    'Zagueiro',
    'Lateral Direito',
    'Volante',
    'Meio Campo',
    'Lateral Esquerdo',
    'Ponta Direita',
    'Centroavante',
    'Ponta Esquerda',
  ],
  '4-1-2-1-2': [
    'Goleiro',
    'Lateral Direito',
    'Zagueiro',
    'Zagueiro',
    'Lateral Esquerdo',
    'Volante',
    'Meio Campo',
    'Meio Campo',
    'Meia Ofensivo',
    'Centroavante',
    'Centroavante',
  ],
};

const FORMATION_KEYS = Object.keys(FORMATIONS);

const RESERVE_POSITIONS: Position[] = [
  'Goleiro',
  'Zagueiro',
  'Volante',
  'Meio Campo',
  'Centroavante',
  'Lateral Direito',
  'Ponta Esquerda',
];

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010];

const COLOR_PALETTE = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#0284c7',
  '#4f46e5',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#1e3a8a',
  '#15803d',
  '#9a3412',
  '#5b21b6',
  '#be123c',
  '#0f766e',
  '#7c2d12',
  '#1e40af',
];

// ============================================================
// Helpers
// ============================================================

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomColor(rng: () => number): string {
  return COLOR_PALETTE[Math.floor(rng() * COLOR_PALETTE.length)];
}

function jitter(rng: () => number, range = 8): number {
  return Math.floor(rng() * range) - Math.floor(range / 2);
}

// ============================================================
// Name pools per country
// ============================================================

interface NamePool {
  first: string[];
  last: string[];
}

const NAMES_BY_COUNTRY: Record<string, NamePool> = {
  Brasil: {
    first: [
      'Carlos', 'João', 'Pedro', 'Marcos', 'Paulo', 'José', 'Antonio', 'Ricardo',
      'Rafael', 'Gabriel', 'Lucas', 'Bruno', 'Felipe', 'Diego', 'Fernando', 'Luiz',
      'Marcelo', 'Thiago', 'Anderson', 'Eduardo', 'Roberto', 'Wesley', 'Rodrigo',
      'Vinicius', 'Matheus', 'Leonardo', 'Gustavo', 'Renato', 'Adriano', 'Claudio',
      'Edu', 'Vitor', 'Daniel', 'Alex', 'Mauro', 'Sergio', 'Júnior', 'Caio',
    ],
    last: [
      'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Costa', 'Pereira', 'Almeida',
      'Nascimento', 'Ferreira', 'Rodrigues', 'Alves', 'Ribeiro', 'Carvalho', 'Gomes',
      'Martins', 'Araújo', 'Barros', 'Cardoso', 'Teixeira', 'Moraes', 'Mendes',
      'Freitas', 'Cavalcante', 'Dias', 'Monteiro', 'Cardozo', 'Pinto', 'Ramos',
      'Farias', 'Machado', 'Andrade', 'Nunes', 'Moreira', 'Carneiro', 'Vieira',
    ],
  },
  Argentina: {
    first: [
      'Juan', 'Diego', 'Carlos', 'Hernán', 'Pablo', 'Sergio', 'Javier', 'Claudio',
      'Roberto', 'Norberto', 'Oscar', 'Martín', 'Gonzalo', 'Fernando', 'Marcelo',
      'Ángel', 'Ricardo', 'Lucas', 'Nicolás', 'Cristian', 'Ezequiel', 'Federico',
    ],
    last: [
      'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo',
      'Ricci', 'Marino', 'Greco', 'Bruno', 'Fernández', 'González', 'Rodríguez',
      'López', 'Martínez', 'Sánchez', 'Pérez', 'Acosta', 'Medina', 'Toledo',
      'Vega', 'Sosa', 'Aguirre', 'Molina', 'Ortiz', 'Suárez', 'Cabrera',
    ],
  },
  'Itália': {
    first: [
      'Paolo', 'Andrea', 'Francesco', 'Alessandro', 'Roberto', 'Gianluigi',
      'Gianluca', 'Fabio', 'Marco', 'Luca', 'Davide', 'Stefano', 'Simone',
      'Massimo', 'Claudio', 'Antonio', 'Giuseppe', 'Giovanni', 'Vincenzo',
      'Salvatore', 'Mauro', 'Pierluigi', 'Daniele', 'Christian',
    ],
    last: [
      'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo',
      'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa',
      'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro',
      'Marconi', 'Rinaldi', 'Ferro', 'Caruso', 'Pellegrini', 'Vitale',
    ],
  },
  Inglaterra: {
    first: [
      'John', 'David', 'Michael', 'Steven', 'Frank', 'Wayne', 'Paul', 'Gary',
      'Robert', 'James', 'Thomas', 'Richard', 'Christopher', 'Daniel', 'Andrew',
      'Brian', 'Kevin', 'Terry', 'Billy', 'Bobby', 'Geoff', 'Martin', 'Tony',
    ],
    last: [
      'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson',
      'Davies', 'Robinson', 'Wright', 'Walker', 'White', 'Edwards', 'Hughes',
      'Green', 'Hall', 'Wood', 'Harris', 'Clark', 'Lewis', 'Lee', 'Shaw',
      'Owen', 'Barnes', 'Pearce', 'Keegan', 'Charlton', 'Moore',
    ],
  },
  Espanha: {
    first: [
      'Juan', 'José', 'Carlos', 'Javier', 'Sergio', 'Andrés', 'Xavi', 'Raúl',
      'Iker', 'Fernando', 'Álvaro', 'Gerard', 'Cesc', 'David', 'Pedro', 'Diego',
      'Marcos', 'Pablo', 'Antonio', 'Manuel', 'Víctor', 'Miguel', 'Luis',
    ],
    last: [
      'García', 'Martínez', 'López', 'González', 'Rodríguez', 'Fernández',
      'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández',
      'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Gutiérrez', 'Torres',
      'Ramos', 'Navarro', 'Castro', 'Ortega', 'Gil', 'Iglesias', 'Vega',
    ],
  },
  Alemanha: {
    first: [
      'Hans', 'Jürgen', 'Michael', 'Thomas', 'Franz', 'Lothar', 'Karl',
      'Andreas', 'Stefan', 'Klaus', 'Wolfgang', 'Gerd', 'Uli', 'Paul',
      'Sepp', 'Bernd', 'Rainer', 'Matthias', 'Oliver', 'Bastian', 'Philipp',
      'Lukas', 'Toni', 'Mario', 'Mesut',
    ],
    last: [
      'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner',
      'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein',
      'Wolf', 'Schröder', 'Neuer', 'Lahm', 'Kroos', 'Schweinsteiger', 'Klose',
      'Ballack', 'Matthäus', 'Klinsmann', 'Sammer', 'Heynckes',
    ],
  },
  França: {
    first: [
      'Jean', 'Pierre', 'Michel', 'Alain', 'Patrick', 'Thierry', 'Zinedine',
      'Lilian', 'Marcel', 'Nicolas', 'Antoine', 'Franck', 'Kylian', 'Paul',
      'Olivier', 'Laurent', 'Eric', 'Didier', 'Emmanuel', 'Bixente', 'Robert',
      'Raymond', 'Christophe', 'David',
    ],
    last: [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit',
      'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia',
      'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard',
      'Blanc', 'Deschamps', 'Desailly', 'Lizarazu', 'Pirès', 'Henry',
    ],
  },
  Holanda: {
    first: [
      'Johan', 'Ruud', 'Marco', 'Dennis', 'Frank', 'Ronald', 'Patrick',
      'Edwin', 'Clarence', 'Wesley', 'Arjen', 'Robin', 'Dirk', 'Rafael',
      'Virgil', 'Memphis', 'Frenkie', 'Matthijs', 'Gini', 'Ronaldo', 'Pierre',
    ],
    last: [
      'de Jong', 'van der Berg', 'Jansen', 'Bakker', 'Visser', 'Smit', 'Meijer',
      'de Boer', 'van Dijk', 'Bergkamp', 'Cruyff', 'Neeskens', 'Rep', 'Krol',
      'Stam', 'Davids', 'Seedorf', 'van Basten', 'Gullit', 'Rijkaard', 'Robben',
      'Sneijder', 'van Persie', 'Kuyt', 'van Bommel',
    ],
  },
  Portugal: {
    first: [
      'João', 'José', 'Paulo', 'Rui', 'Fernando', 'Cristiano', 'Luís', 'Bruno',
      'Bernardo', 'Gonçalo', 'Diogo', 'Rúben', 'Pepe', 'Deco', 'Manuel',
      'António', 'Vítor', 'Sérgio', 'Ricardo', 'André', 'Pedro', 'Miguel',
    ],
    last: [
      'Silva', 'Santos', 'Pereira', 'Ferreira', 'Oliveira', 'Costa', 'Rodrigues',
      'Martins', 'Sousa', 'Fernandes', 'Gomes', 'Lopes', 'Marques', 'Carvalho',
      'Almeida', 'Ribeiro', 'Pinto', 'Tavares', 'Moreira', 'Antunes', 'Figo',
      'Rui Costa', 'Eusébio', 'Futre',
    ],
  },
  Uruguai: {
    first: [
      'Edinson', 'Luis', 'Diego', 'Enzo', 'Fernando', 'Sergio', 'Álvaro',
      'Martín', 'Carlos', 'Pablo', 'Nicolás', 'Jorge', 'Bruno', 'Matías',
      'Sebastián', 'Maxi', 'Cristian', 'Jonathan',
    ],
    last: [
      'Suárez', 'Cavani', 'Forlán', 'Godín', 'Muslera', 'Coates', 'Pereiro',
      'Vecino', 'Laxalt', 'Bentancur', 'Torreira', 'Nández', 'Arrascaeta',
      'Gomez', 'Stuani', 'Pérez', 'Rodríguez', 'Aguirre', 'Recoba', 'Francescoli',
    ],
  },
};

const COUNTRIES_WITH_NAMES = Object.keys(NAMES_BY_COUNTRY);

function randomName(country: string, rng: () => number): string {
  const pool = NAMES_BY_COUNTRY[country] ?? NAMES_BY_COUNTRY['Brasil'];
  const first = pick(rng, pool.first);
  const last = pick(rng, pool.last);
  return `${first} ${last}`;
}

// ============================================================
// Stats generator per position
// ============================================================

function statsForPosition(pos: Position, ovr: number, rng: () => number): PlayerStats {
  const c = (val: number) => clamp(val, 50, 99);
  const j = () => jitter(rng);
  switch (pos) {
    case 'Goleiro':
      return {
        pace: c(ovr - 25 + j()),
        shooting: c(ovr - 35 + j()),
        passing: c(ovr - 15 + j()),
        dribbling: c(ovr - 20 + j()),
        defending: c(ovr + 5 + j()),
        physical: c(ovr - 5 + j()),
      };
    case 'Lateral Direito':
    case 'Lateral Esquerdo':
      return {
        pace: c(ovr + 5 + j()),
        shooting: c(ovr - 10 + j()),
        passing: c(ovr + j()),
        dribbling: c(ovr + j()),
        defending: c(ovr - 3 + j()),
        physical: c(ovr - 5 + j()),
      };
    case 'Zagueiro':
      return {
        pace: c(ovr - 5 + j()),
        shooting: c(ovr - 25 + j()),
        passing: c(ovr - 10 + j()),
        dribbling: c(ovr - 15 + j()),
        defending: c(ovr + 6 + j()),
        physical: c(ovr + 5 + j()),
      };
    case 'Volante':
      return {
        pace: c(ovr - 5 + j()),
        shooting: c(ovr - 8 + j()),
        passing: c(ovr + 4 + j()),
        dribbling: c(ovr - 3 + j()),
        defending: c(ovr + 5 + j()),
        physical: c(ovr + 3 + j()),
      };
    case 'Meio Campo':
      return {
        pace: c(ovr + j()),
        shooting: c(ovr - 3 + j()),
        passing: c(ovr + 5 + j()),
        dribbling: c(ovr + 3 + j()),
        defending: c(ovr - 3 + j()),
        physical: c(ovr - 2 + j()),
      };
    case 'Meia Ofensivo':
      return {
        pace: c(ovr + j()),
        shooting: c(ovr + 3 + j()),
        passing: c(ovr + 6 + j()),
        dribbling: c(ovr + 6 + j()),
        defending: c(ovr - 15 + j()),
        physical: c(ovr - 5 + j()),
      };
    case 'Ponta Direita':
    case 'Ponta Esquerda':
      return {
        pace: c(ovr + 7 + j()),
        shooting: c(ovr + j()),
        passing: c(ovr + j()),
        dribbling: c(ovr + 6 + j()),
        defending: c(ovr - 18 + j()),
        physical: c(ovr - 8 + j()),
      };
    case 'Atacante':
      return {
        pace: c(ovr + 5 + j()),
        shooting: c(ovr + 5 + j()),
        passing: c(ovr - 5 + j()),
        dribbling: c(ovr + 5 + j()),
        defending: c(ovr - 20 + j()),
        physical: c(ovr - 3 + j()),
      };
    case 'Centroavante':
      return {
        pace: c(ovr - 2 + j()),
        shooting: c(ovr + 7 + j()),
        passing: c(ovr - 5 + j()),
        dribbling: c(ovr - 3 + j()),
        defending: c(ovr - 25 + j()),
        physical: c(ovr + 5 + j()),
      };
    default:
      return {
        pace: c(ovr + j()),
        shooting: c(ovr + j()),
        passing: c(ovr + j()),
        dribbling: c(ovr + j()),
        defending: c(ovr + j()),
        physical: c(ovr + j()),
      };
  }
}

// ============================================================
// Player factory
// ============================================================

function makePlayer(
  team: HistoricalTeamData,
  name: string,
  position: Position,
  overall: number,
  country: string,
  rng: () => number,
): HistoricalPlayerData {
  return {
    name,
    position,
    overall: clamp(overall, 50, 99),
    country,
    club: team.name,
    year: team.year,
    decade: team.decade,
    photoColor: randomColor(rng),
    stats: statsForPosition(position, overall, rng),
    teamId: null,
  };
}

// ============================================================
// Squad builder for curated teams (uses real stars + procedural fill)
// ============================================================

function buildSquad(
  team: CuratedTeam,
  rng: () => number,
): HistoricalPlayerData[] {
  const starters = FORMATIONS[team.formation];
  const usedSlots = new Array<boolean>(starters.length).fill(false);
  const result: HistoricalPlayerData[] = [];

  // 1) Place real stars at their position slots
  for (const star of team.stars) {
    const idx = starters.findIndex((p, i) => !usedSlots[i] && p === star.position);
    if (idx >= 0) {
      usedSlots[idx] = true;
      const overall = star.overall ?? clamp(team.ovr + 5 + Math.floor(rng() * 5), 70, 99);
      result.push(
        makePlayer(team, star.name, star.position, overall, star.country ?? team.country, rng),
      );
    } else {
      // Star doesn't fit a free slot - keep them anyway as a starter replacing a procedurally filled one.
      const overall = star.overall ?? clamp(team.ovr + 5, 70, 99);
      result.push(
        makePlayer(team, star.name, star.position, overall, star.country ?? team.country, rng),
      );
    }
  }

  // 2) Fill the remaining starter slots procedurally
  for (let i = 0; i < starters.length; i++) {
    if (usedSlots[i]) continue;
    const overall = clamp(team.ovr + jitter(rng, 8) - 1, 60, 95);
    const name = randomName(team.country, rng);
    result.push(makePlayer(team, name, starters[i], overall, team.country, rng));
  }

  // 3) Add 5 reserves
  for (let r = 0; r < 5; r++) {
    const pos = RESERVE_POSITIONS[r % RESERVE_POSITIONS.length];
    const overall = clamp(team.ovr - 4 + jitter(rng, 6), 55, 92);
    const name = randomName(team.country, rng);
    result.push(makePlayer(team, name, pos, overall, team.country, rng));
  }

  return result;
}

// ============================================================
// Curated real historical teams (60 entries)
// ============================================================

const CURATED: CuratedTeam[] = [
  {
    name: 'Cruzeiro',
    year: 1966,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 83,
    formation: '4-3-3',
    decade: 1960,
    badgeColor: '#1e3a8a',
    accentColor: '#f5f5f5',
    description: 'Cruzeiro de Tostão e Dirceu Lopes, bicampeão da Taça Brasil.',
    stars: [
      { name: 'Tostão', position: 'Centroavante', overall: 90, country: 'Brasil' },
      { name: 'Dirceu Lopes', position: 'Meia Ofensivo', overall: 89, country: 'Brasil' },
      { name: 'Piazza', position: 'Zagueiro', overall: 86, country: 'Brasil' },
      { name: 'Procópio', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Natal', position: 'Goleiro', overall: 82, country: 'Brasil' },
    ],
  },
  {
    name: 'Botafogo',
    year: 1962,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 90,
    formation: '4-4-2 losango',
    decade: 1960,
    badgeColor: '#000000',
    accentColor: '#f5f5f5',
    description: 'Botafogo de Garrincha e Nilton Santos, era de ouro do clube.',
    stars: [
      { name: 'Garrincha', position: 'Ponta Direita', overall: 94, country: 'Brasil' },
      { name: 'Didi', position: 'Meia Ofensivo', overall: 92, country: 'Brasil' },
      { name: 'Nilton Santos', position: 'Lateral Esquerdo', overall: 90, country: 'Brasil' },
      { name: 'Zagallo', position: 'Ponta Esquerda', overall: 88, country: 'Brasil' },
      { name: 'Amarildo', position: 'Centroavante', overall: 87, country: 'Brasil' },
      { name: 'Quarentinha', position: 'Centroavante', overall: 85, country: 'Brasil' },
    ],
  },
  {
    name: 'Santos',
    year: 1962,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 95,
    formation: '4-3-3',
    decade: 1960,
    badgeColor: '#ffffff',
    accentColor: '#000000',
    description: 'Santos de Pelé, pentacampeão paulista e bicampeão da Libertadores.',
    stars: [
      { name: 'Pelé', position: 'Centroavante', overall: 99, country: 'Brasil' },
      { name: 'Coutinho', position: 'Atacante', overall: 91, country: 'Brasil' },
      { name: 'Pepe', position: 'Ponta Esquerda', overall: 89, country: 'Brasil' },
      { name: 'Zito', position: 'Volante', overall: 88, country: 'Brasil' },
      { name: 'Mengálvio', position: 'Meio Campo', overall: 86, country: 'Brasil' },
      { name: 'Dorval', position: 'Ponta Direita', overall: 87, country: 'Brasil' },
      { name: 'Mauro', position: 'Zagueiro', overall: 86, country: 'Brasil' },
      { name: 'Gilmar', position: 'Goleiro', overall: 88, country: 'Brasil' },
    ],
  },
  {
    name: 'Real Madrid',
    year: 1959,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 96,
    formation: '4-4-2 losango',
    decade: 1950,
    badgeColor: '#ffffff',
    accentColor: '#fbbf24',
    description: 'Real Madrid de Di Stéfano e Puskás, hegemonia na Copa dos Campeões.',
    stars: [
      { name: 'Alfredo Di Stéfano', position: 'Centroavante', overall: 96, country: 'Argentina' },
      { name: 'Ferenc Puskás', position: 'Centroavante', overall: 95, country: 'Hungria' },
      { name: 'Francisco Gento', position: 'Ponta Esquerda', overall: 93, country: 'Espanha' },
      { name: 'Raymond Kopa', position: 'Meia Ofensivo', overall: 91, country: 'França' },
      { name: 'José Santamaría', position: 'Zagueiro', overall: 90, country: 'Uruguai' },
      { name: 'Hector Rial', position: 'Ponta Direita', overall: 88, country: 'Argentina' },
    ],
  },
  {
    name: 'Manchester United',
    year: 1999,
    country: 'Inglaterra',
    league: 'Premier League',
    ovr: 94,
    formation: '4-4-2',
    decade: 1990,
    badgeColor: '#dc2626',
    accentColor: '#fbbf24',
    description: 'Manchester United da histórica tríplice coroa comandada por Ferguson.',
    stars: [
      { name: 'Peter Schmeichel', position: 'Goleiro', overall: 92, country: 'Dinamarca' },
      { name: 'Roy Keane', position: 'Volante', overall: 92, country: 'Irlanda' },
      { name: 'David Beckham', position: 'Ponta Direita', overall: 90, country: 'Inglaterra' },
      { name: 'Paul Scholes', position: 'Meio Campo', overall: 90, country: 'Inglaterra' },
      { name: 'Ryan Giggs', position: 'Ponta Esquerda', overall: 91, country: 'Gales' },
      { name: 'Andy Cole', position: 'Centroavante', overall: 88, country: 'Inglaterra' },
      { name: 'Dwight Yorke', position: 'Atacante', overall: 88, country: 'Trinidad' },
      { name: 'Jaap Stam', position: 'Zagueiro', overall: 90, country: 'Holanda' },
    ],
  },
  {
    name: 'Brasil',
    year: 1970,
    country: 'Brasil',
    league: 'Seleções',
    ovr: 97,
    formation: '4-2-3-1',
    decade: 1970,
    badgeColor: '#facc15',
    accentColor: '#16a34a',
    description: 'A seleção mais bela de todos os tempos, tricampeã no México.',
    stars: [
      { name: 'Pelé', position: 'Centroavante', overall: 99, country: 'Brasil' },
      { name: 'Garrincha', position: 'Ponta Direita', overall: 93, country: 'Brasil' }, // not in 1970 squad actually but used in '62 — replacing with Jairzinho
      { name: 'Jairzinho', position: 'Ponta Direita', overall: 93, country: 'Brasil' },
      { name: 'Rivellino', position: 'Ponta Esquerda', overall: 92, country: 'Brasil' },
      { name: 'Tostão', position: 'Atacante', overall: 91, country: 'Brasil' },
      { name: 'Gérson', position: 'Meia Ofensivo', overall: 92, country: 'Brasil' },
      { name: 'Clodoaldo', position: 'Volante', overall: 89, country: 'Brasil' },
      { name: 'Carlos Alberto', position: 'Lateral Direito', overall: 92, country: 'Brasil' },
      { name: 'Britto', position: 'Zagueiro', overall: 88, country: 'Brasil' },
      { name: 'Piazza', position: 'Zagueiro', overall: 88, country: 'Brasil' },
      { name: 'Everaldo', position: 'Lateral Esquerdo', overall: 87, country: 'Brasil' },
      { name: 'Félix', position: 'Goleiro', overall: 86, country: 'Brasil' },
    ],
  },
  {
    name: 'AC Milan',
    year: 1989,
    country: 'Itália',
    league: 'Serie A',
    ovr: 96,
    formation: '4-4-2 losango',
    decade: 1980,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'Milan de Sacchi, os imortais holandeses e a defesa mais temida do mundo.',
    stars: [
      { name: 'Marco van Basten', position: 'Centroavante', overall: 95, country: 'Holanda' },
      { name: 'Ruud Gullit', position: 'Atacante', overall: 94, country: 'Holanda' },
      { name: 'Frank Rijkaard', position: 'Volante', overall: 92, country: 'Holanda' },
      { name: 'Franco Baresi', position: 'Zagueiro', overall: 94, country: 'Itália' },
      { name: 'Paolo Maldini', position: 'Lateral Esquerdo', overall: 93, country: 'Itália' },
      { name: 'Alessandro Costacurta', position: 'Zagueiro', overall: 90, country: 'Itália' },
      { name: 'Mauro Tassotti', position: 'Lateral Direito', overall: 88, country: 'Itália' },
      { name: 'Carlo Ancelotti', position: 'Meio Campo', overall: 89, country: 'Itália' },
      { name: 'Roberto Donadoni', position: 'Ponta Esquerda', overall: 88, country: 'Itália' },
    ],
  },
  {
    name: 'Barcelona',
    year: 2009,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 95,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#a50044',
    accentColor: '#004d98',
    description: 'Barça de Guardiola, o sextete histórico com Messi em ascensão.',
    stars: [
      { name: 'Lionel Messi', position: 'Ponta Direita', overall: 96, country: 'Argentina' },
      { name: 'Xavi', position: 'Meio Campo', overall: 93, country: 'Espanha' },
      { name: 'Andrés Iniesta', position: 'Meia Ofensivo', overall: 93, country: 'Espanha' },
      { name: 'Thierry Henry', position: 'Ponta Esquerda', overall: 92, country: 'França' },
      { name: 'Samuel Eto\'o', position: 'Centroavante', overall: 91, country: 'Camarões' },
      { name: 'Carles Puyol', position: 'Zagueiro', overall: 90, country: 'Espanha' },
      { name: 'Gerard Piqué', position: 'Zagueiro', overall: 89, country: 'Espanha' },
      { name: 'Dani Alves', position: 'Lateral Direito', overall: 89, country: 'Brasil' },
      { name: 'Sergio Busquets', position: 'Volante', overall: 88, country: 'Espanha' },
      { name: 'Eric Abidal', position: 'Lateral Esquerdo', overall: 86, country: 'França' },
      { name: 'Víctor Valdés', position: 'Goleiro', overall: 88, country: 'Espanha' },
    ],
  },
  {
    name: 'Ajax',
    year: 1972,
    country: 'Holanda',
    league: 'Eredivisie',
    ovr: 93,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Ajax de Cruyff e Michels, futebol total e tríplice coroa europeia.',
    stars: [
      { name: 'Johan Cruyff', position: 'Centroavante', overall: 96, country: 'Holanda' },
      { name: 'Johan Neeskens', position: 'Volante', overall: 92, country: 'Holanda' },
      { name: 'Ruud Krol', position: 'Lateral Esquerdo', overall: 90, country: 'Holanda' },
      { name: 'Johnny Rep', position: 'Ponta Direita', overall: 89, country: 'Holanda' },
      { name: 'Arie Haan', position: 'Meio Campo', overall: 87, country: 'Holanda' },
      { name: 'Barry Hulshoff', position: 'Zagueiro', overall: 87, country: 'Holanda' },
      { name: 'Piet Keizer', position: 'Ponta Esquerda', overall: 89, country: 'Holanda' },
      { name: 'Gerrie Mühren', position: 'Meio Campo', overall: 86, country: 'Holanda' },
    ],
  },
  {
    name: 'Inter de Milão',
    year: 1965,
    country: 'Itália',
    league: 'Serie A',
    ovr: 91,
    formation: '4-3-3',
    decade: 1960,
    badgeColor: '#1e3a8a',
    accentColor: '#000000',
    description: 'Grande Inter de Herrera, bicampeão europeu com catenaccio.',
    stars: [
      { name: 'Sandro Mazzola', position: 'Meia Ofensivo', overall: 92, country: 'Itália' },
      { name: 'Luis Suárez', position: 'Volante', overall: 92, country: 'Espanha' },
      { name: 'Giacinto Facchetti', position: 'Lateral Esquerdo', overall: 91, country: 'Itália' },
      { name: 'Tarcisio Burgnich', position: 'Zagueiro', overall: 89, country: 'Itália' },
      { name: 'Sandro Mazzola', position: 'Centroavante', overall: 91, country: 'Itália' },
      { name: 'Mario Corso', position: 'Ponta Esquerda', overall: 88, country: 'Itália' },
      { name: 'Jair da Costa', position: 'Ponta Direita', overall: 87, country: 'Brasil' },
    ],
  },
  {
    name: 'Liverpool',
    year: 1984,
    country: 'Inglaterra',
    league: 'First Division',
    ovr: 92,
    formation: '4-4-2',
    decade: 1980,
    badgeColor: '#dc2626',
    accentColor: '#fbbf24',
    description: 'Liverpool de Rush e Dalglish, tetra europeu em Roma.',
    stars: [
      { name: 'Ian Rush', position: 'Centroavante', overall: 91, country: 'Gales' },
      { name: 'Kenny Dalglish', position: 'Atacante', overall: 92, country: 'Escócia' },
      { name: 'Graeme Souness', position: 'Volante', overall: 90, country: 'Escócia' },
      { name: 'Alan Hansen', position: 'Zagueiro', overall: 89, country: 'Escócia' },
      { name: 'Bruce Grobbelaar', position: 'Goleiro', overall: 87, country: 'Zimbabue' },
      { name: 'Mark Lawrenson', position: 'Zagueiro', overall: 88, country: 'Irlanda' },
      { name: 'Craig Johnston', position: 'Ponta Direita', overall: 85, country: 'Austrália' },
    ],
  },
  {
    name: 'Juventus',
    year: 1996,
    country: 'Itália',
    league: 'Serie A',
    ovr: 93,
    formation: '4-4-2 losango',
    decade: 1990,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Juve de Lippi, campeão europeu com Del Piero e Zidane em ascensão.',
    stars: [
      { name: 'Alessandro Del Piero', position: 'Meia Ofensivo', overall: 92, country: 'Itália' },
      { name: 'Zinedine Zidane', position: 'Meio Campo', overall: 93, country: 'França' },
      { name: 'Fabrizio Ravanelli', position: 'Centroavante', overall: 87, country: 'Itália' },
      { name: 'Gianluca Vialli', position: 'Centroavante', overall: 89, country: 'Itália' },
      { name: 'Didier Deschamps', position: 'Volante', overall: 88, country: 'França' },
      { name: 'Ciro Ferrara', position: 'Zagueiro', overall: 88, country: 'Itália' },
      { name: 'Angelo Peruzzi', position: 'Goleiro', overall: 89, country: 'Itália' },
      { name: 'Antonio Conte', position: 'Meio Campo', overall: 86, country: 'Itália' },
    ],
  },
  {
    name: 'Bayern de Munique',
    year: 1974,
    country: 'Alemanha',
    league: 'Bundesliga',
    ovr: 94,
    formation: '4-4-2',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Bayern de Beckenbauer e Müller, início do tricampeonato europeu.',
    stars: [
      { name: 'Franz Beckenbauer', position: 'Zagueiro', overall: 95, country: 'Alemanha' },
      { name: 'Gerd Müller', position: 'Centroavante', overall: 95, country: 'Alemanha' },
      { name: 'Sepp Maier', position: 'Goleiro', overall: 92, country: 'Alemanha' },
      { name: 'Paul Breitner', position: 'Lateral Esquerdo', overall: 90, country: 'Alemanha' },
      { name: 'Georg Schwarzenbeck', position: 'Zagueiro', overall: 88, country: 'Alemanha' },
      { name: 'Uli Hoeness', position: 'Atacante', overall: 89, country: 'Alemanha' },
      { name: 'Bernd Dürnberger', position: 'Volante', overall: 86, country: 'Alemanha' },
      { name: 'Rainer Ohlhauser', position: 'Ponta Esquerda', overall: 85, country: 'Alemanha' },
    ],
  },
  {
    name: 'Argentina',
    year: 1986,
    country: 'Argentina',
    league: 'Seleções',
    ovr: 93,
    formation: '4-4-2 losango',
    decade: 1980,
    badgeColor: '#75aedb',
    accentColor: '#ffffff',
    description: 'Argentina de Maradona, campeã do mundo no México com gols antológicos.',
    stars: [
      { name: 'Diego Maradona', position: 'Meia Ofensivo', overall: 98, country: 'Argentina' },
      { name: 'Jorge Valdano', position: 'Centroavante', overall: 87, country: 'Argentina' },
      { name: 'Jorge Burruchaga', position: 'Ponta Direita', overall: 86, country: 'Argentina' },
      { name: 'Oscar Ruggeri', position: 'Zagueiro', overall: 88, country: 'Argentina' },
      { name: 'Nery Pumpido', position: 'Goleiro', overall: 86, country: 'Argentina' },
      { name: 'Ricardo Giusti', position: 'Volante', overall: 85, country: 'Argentina' },
      { name: 'Héctor Enrique', position: 'Meio Campo', overall: 84, country: 'Argentina' },
    ],
  },
  {
    name: 'Flamengo',
    year: 1981,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 90,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'Flamengo de Zico, campeão mundial sobre o Liverpool em Tóquio.',
    stars: [
      { name: 'Zico', position: 'Meia Ofensivo', overall: 95, country: 'Brasil' },
      { name: 'Júnior', position: 'Lateral Esquerdo', overall: 89, country: 'Brasil' },
      { name: 'Adílio', position: 'Meio Campo', overall: 86, country: 'Brasil' },
      { name: 'Andrade', position: 'Volante', overall: 86, country: 'Brasil' },
      { name: 'Nunes', position: 'Centroavante', overall: 86, country: 'Brasil' },
      { name: 'Tita', position: 'Ponta Direita', overall: 85, country: 'Brasil' },
      { name: 'Leandro', position: 'Lateral Direito', overall: 85, country: 'Brasil' },
      { name: 'Mozer', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Raul', position: 'Goleiro', overall: 84, country: 'Brasil' },
    ],
  },
  {
    name: 'Grêmio',
    year: 1983,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 88,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#1e3a8a',
    accentColor: '#000000',
    description: 'Grêmio bicampeão da Libertadores com Renato Portaluppi.',
    stars: [
      { name: 'Renato Portaluppi', position: 'Ponta Direita', overall: 89, country: 'Brasil' },
      { name: 'César', position: 'Goleiro', overall: 86, country: 'Brasil' },
      { name: 'De León', position: 'Zagueiro', overall: 88, country: 'Uruguai' },
      { name: 'Mário Sérgio', position: 'Ponta Esquerda', overall: 87, country: 'Brasil' },
      { name: 'Oscar', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Paulo Roberto', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Casemiro Mior', position: 'Meio Campo', overall: 83, country: 'Brasil' },
    ],
  },
  {
    name: 'São Paulo',
    year: 2005,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 91,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'São Paulo tricampeão da Libertadores e mundial no Japão.',
    stars: [
      { name: 'Rogério Ceni', position: 'Goleiro', overall: 89, country: 'Brasil' },
      { name: 'Luís Fabiano', position: 'Centroavante', overall: 88, country: 'Brasil' },
      { name: 'Amoroso', position: 'Atacante', overall: 87, country: 'Brasil' },
      { name: 'Mineiro', position: 'Volante', overall: 86, country: 'Brasil' },
      { name: 'Cicinho', position: 'Lateral Direito', overall: 87, country: 'Brasil' },
      { name: 'Josué', position: 'Meio Campo', overall: 84, country: 'Brasil' },
      { name: 'Alex Silva', position: 'Zagueiro', overall: 84, country: 'Brasil' },
      { name: 'Danilo', position: 'Meia Ofensivo', overall: 85, country: 'Brasil' },
    ],
  },
  {
    name: 'Corinthians',
    year: 2012,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 90,
    formation: '4-2-3-1',
    decade: 2010,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Corinthians de Tite, campeão da Libertadores invicto e mundial.',
    stars: [
      { name: 'Cássio', position: 'Goleiro', overall: 88, country: 'Brasil' },
      { name: 'Paolo Guerrero', position: 'Centroavante', overall: 87, country: 'Peru' },
      { name: 'Paulinho', position: 'Volante', overall: 87, country: 'Brasil' },
      { name: 'Danilo', position: 'Volante', overall: 85, country: 'Brasil' },
      { name: 'Alex', position: 'Meia Ofensivo', overall: 84, country: 'Brasil' },
      { name: 'Emerson', position: 'Ponta Direita', overall: 83, country: 'Brasil' },
      { name: 'Leandro Castán', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Chicao', position: 'Zagueiro', overall: 84, country: 'Brasil' },
    ],
  },
  {
    name: 'Atlético Mineiro',
    year: 2013,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 87,
    formation: '4-2-3-1',
    decade: 2010,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Galo de Ronaldinho Gaúcho, campeão brasileiro após 50 anos.',
    stars: [
      { name: 'Ronaldinho Gaúcho', position: 'Meia Ofensivo', overall: 90, country: 'Brasil' },
      { name: 'Diego Tardelli', position: 'Centroavante', overall: 85, country: 'Brasil' },
      { name: 'Bernard', position: 'Ponta Direita', overall: 84, country: 'Brasil' },
      { name: 'Jô', position: 'Centroavante', overall: 84, country: 'Brasil' },
      { name: 'Victor', position: 'Goleiro', overall: 85, country: 'Brasil' },
      { name: 'Réver', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Pierre', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Gilberto Silva', position: 'Volante', overall: 84, country: 'Brasil' },
    ],
  },
  {
    name: 'Brasil',
    year: 1958,
    country: 'Brasil',
    league: 'Seleções',
    ovr: 93,
    formation: '4-2-3-1',
    decade: 1950,
    badgeColor: '#facc15',
    accentColor: '#16a34a',
    description: 'Primeiro título mundial do Brasil, com Pelé garoto prodígio.',
    stars: [
      { name: 'Pelé', position: 'Centroavante', overall: 93, country: 'Brasil' },
      { name: 'Garrincha', position: 'Ponta Direita', overall: 92, country: 'Brasil' },
      { name: 'Didi', position: 'Meia Ofensivo', overall: 93, country: 'Brasil' },
      { name: 'Vavá', position: 'Atacante', overall: 89, country: 'Brasil' },
      { name: 'Nilton Santos', position: 'Lateral Esquerdo', overall: 90, country: 'Brasil' },
      { name: 'Djalma Santos', position: 'Lateral Direito', overall: 90, country: 'Brasil' },
      { name: 'Bellini', position: 'Zagueiro', overall: 87, country: 'Brasil' },
      { name: 'Zito', position: 'Volante', overall: 87, country: 'Brasil' },
      { name: 'Gilmar', position: 'Goleiro', overall: 87, country: 'Brasil' },
      { name: 'Zagallo', position: 'Ponta Esquerda', overall: 88, country: 'Brasil' },
    ],
  },
  {
    name: 'Brasil',
    year: 2002,
    country: 'Brasil',
    league: 'Seleções',
    ovr: 95,
    formation: '4-2-3-1',
    decade: 2000,
    badgeColor: '#facc15',
    accentColor: '#16a34a',
    description: 'Pentacampeão mundial no Japão, ataque mágico RRR.',
    stars: [
      { name: 'Ronaldo Fenômeno', position: 'Centroavante', overall: 96, country: 'Brasil' },
      { name: 'Rivaldo', position: 'Meia Ofensivo', overall: 93, country: 'Brasil' },
      { name: 'Ronaldinho Gaúcho', position: 'Ponta Esquerda', overall: 93, country: 'Brasil' },
      { name: 'Roberto Carlos', position: 'Lateral Esquerdo', overall: 92, country: 'Brasil' },
      { name: 'Cafu', position: 'Lateral Direito', overall: 91, country: 'Brasil' },
      { name: 'Lúcio', position: 'Zagueiro', overall: 91, country: 'Brasil' },
      { name: 'Gilberto Silva', position: 'Volante', overall: 87, country: 'Brasil' },
      { name: 'Kleberson', position: 'Volante', overall: 85, country: 'Brasil' },
      { name: 'Marcos', position: 'Goleiro', overall: 88, country: 'Brasil' },
      { name: 'Edmilson', position: 'Zagueiro', overall: 88, country: 'Brasil' },
    ],
  },
  {
    name: 'Holanda',
    year: 1974,
    country: 'Holanda',
    league: 'Seleções',
    ovr: 93,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#ea580c',
    accentColor: '#ffffff',
    description: 'Laranja Mecânica de Cruyff e Neeskens, futebol total.',
    stars: [
      { name: 'Johan Cruyff', position: 'Centroavante', overall: 96, country: 'Holanda' },
      { name: 'Johan Neeskens', position: 'Volante', overall: 92, country: 'Holanda' },
      { name: 'Johnny Rep', position: 'Ponta Direita', overall: 89, country: 'Holanda' },
      { name: 'Ruud Krol', position: 'Lateral Esquerdo', overall: 90, country: 'Holanda' },
      { name: 'Rob Rensenbrink', position: 'Ponta Esquerda', overall: 89, country: 'Holanda' },
      { name: 'Arie Haan', position: 'Meio Campo', overall: 87, country: 'Holanda' },
      { name: 'Wim Suurbier', position: 'Lateral Direito', overall: 85, country: 'Holanda' },
      { name: 'Jan Jongbloed', position: 'Goleiro', overall: 84, country: 'Holanda' },
    ],
  },
  {
    name: 'Alemanha',
    year: 1974,
    country: 'Alemanha',
    league: 'Seleções',
    ovr: 92,
    formation: '4-4-2',
    decade: 1970,
    badgeColor: '#000000',
    accentColor: '#dc2626',
    description: 'Alemanha de Beckenbauer, campeã do mundo em casa.',
    stars: [
      { name: 'Franz Beckenbauer', position: 'Zagueiro', overall: 95, country: 'Alemanha' },
      { name: 'Gerd Müller', position: 'Centroavante', overall: 95, country: 'Alemanha' },
      { name: 'Paul Breitner', position: 'Lateral Esquerdo', overall: 90, country: 'Alemanha' },
      { name: 'Sepp Maier', position: 'Goleiro', overall: 92, country: 'Alemanha' },
      { name: 'Wolfgang Overath', position: 'Meia Ofensivo', overall: 88, country: 'Alemanha' },
      { name: 'Bernd Hölzenbein', position: 'Ponta Direita', overall: 86, country: 'Alemanha' },
      { name: 'Georg Schwarzenbeck', position: 'Zagueiro', overall: 88, country: 'Alemanha' },
    ],
  },
  {
    name: 'Itália',
    year: 1982,
    country: 'Itália',
    league: 'Seleções',
    ovr: 90,
    formation: '4-4-2',
    decade: 1980,
    badgeColor: '#1e3a8a',
    accentColor: '#facc15',
    description: 'Azzurra de Paolo Rossi, tricampeã mundial na Espanha.',
    stars: [
      { name: 'Paolo Rossi', position: 'Centroavante', overall: 90, country: 'Itália' },
      { name: 'Dino Zoff', position: 'Goleiro', overall: 90, country: 'Itália' },
      { name: 'Gaetano Scirea', position: 'Zagueiro', overall: 90, country: 'Itália' },
      { name: 'Claudio Gentile', position: 'Zagueiro', overall: 88, country: 'Itália' },
      { name: 'Marco Tardelli', position: 'Volante', overall: 87, country: 'Itália' },
      { name: 'Giuseppe Bergomi', position: 'Lateral Direito', overall: 86, country: 'Itália' },
      { name: 'Antonio Cabrini', position: 'Lateral Esquerdo', overall: 87, country: 'Itália' },
      { name: 'Bruno Conti', position: 'Ponta Direita', overall: 86, country: 'Itália' },
    ],
  },
  {
    name: 'França',
    year: 1998,
    country: 'França',
    league: 'Seleções',
    ovr: 93,
    formation: '4-2-3-1',
    decade: 1990,
    badgeColor: '#1e3a8a',
    accentColor: '#dc2626',
    description: 'França campeã mundial em casa com Zidane e a defesa-mor.',
    stars: [
      { name: 'Zinedine Zidane', position: 'Meia Ofensivo', overall: 94, country: 'França' },
      { name: 'Didier Deschamps', position: 'Volante', overall: 88, country: 'França' },
      { name: 'Marcel Desailly', position: 'Zagueiro', overall: 91, country: 'França' },
      { name: 'Laurent Blanc', position: 'Zagueiro', overall: 89, country: 'França' },
      { name: 'Lilian Thuram', position: 'Lateral Direito', overall: 90, country: 'França' },
      { name: 'Bixente Lizarazu', position: 'Lateral Esquerdo', overall: 88, country: 'França' },
      { name: 'Emmanuel Petit', position: 'Volante', overall: 86, country: 'França' },
      { name: 'Thierry Henry', position: 'Ponta Esquerda', overall: 89, country: 'França' },
      { name: 'Fabien Barthez', position: 'Goleiro', overall: 87, country: 'França' },
    ],
  },
  {
    name: 'Argentina',
    year: 1978,
    country: 'Argentina',
    league: 'Seleções',
    ovr: 90,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#75aedb',
    accentColor: '#ffffff',
    description: 'Argentina de Kempes, primeira conquista mundial.',
    stars: [
      { name: 'Mario Kempes', position: 'Centroavante', overall: 92, country: 'Argentina' },
      { name: 'Leopoldo Luque', position: 'Atacante', overall: 86, country: 'Argentina' },
      { name: 'Daniel Passarella', position: 'Zagueiro', overall: 89, country: 'Argentina' },
      { name: 'Osvaldo Ardiles', position: 'Meio Campo', overall: 87, country: 'Argentina' },
      { name: 'Américo Gallego', position: 'Volante', overall: 85, country: 'Argentina' },
      { name: 'Ubaldo Fillol', position: 'Goleiro', overall: 88, country: 'Argentina' },
      { name: 'Alberto Tarantini', position: 'Lateral Esquerdo', overall: 84, country: 'Argentina' },
    ],
  },
  {
    name: 'Uruguai',
    year: 1950,
    country: 'Uruguai',
    league: 'Seleções',
    ovr: 89,
    formation: '4-3-3',
    decade: 1950,
    badgeColor: '#1e40af',
    accentColor: '#facc15',
    description: 'Uruguai do Maracanazo, bicampeão mundial em solo brasileiro.',
    stars: [
      { name: 'Obdulio Varela', position: 'Volante', overall: 90, country: 'Uruguai' },
      { name: 'Juan Alberto Schiaffino', position: 'Meia Ofensivo', overall: 91, country: 'Uruguai' },
      { name: 'Alcides Ghiggia', position: 'Ponta Direita', overall: 88, country: 'Uruguai' },
      { name: 'Roque Máspoli', position: 'Goleiro', overall: 87, country: 'Uruguai' },
      { name: 'Eusebio Tejera', position: 'Zagueiro', overall: 86, country: 'Uruguai' },
      { name: 'Washington Ortuño', position: 'Meio Campo', overall: 84, country: 'Uruguai' },
      { name: 'Oscar Míguez', position: 'Centroavante', overall: 86, country: 'Uruguai' },
    ],
  },
  {
    name: 'Inglaterra',
    year: 1966,
    country: 'Inglaterra',
    league: 'Seleções',
    ovr: 90,
    formation: '4-4-2',
    decade: 1960,
    badgeColor: '#ffffff',
    accentColor: '#1e3a8a',
    description: 'Inglaterra única campeã mundial, com Charlton e Banks.',
    stars: [
      { name: 'Bobby Charlton', position: 'Meia Ofensivo', overall: 92, country: 'Inglaterra' },
      { name: 'Bobby Moore', position: 'Zagueiro', overall: 91, country: 'Inglaterra' },
      { name: 'Gordon Banks', position: 'Goleiro', overall: 90, country: 'Inglaterra' },
      { name: 'Geoff Hurst', position: 'Centroavante', overall: 88, country: 'Inglaterra' },
      { name: 'Nobby Stiles', position: 'Volante', overall: 85, country: 'Inglaterra' },
      { name: 'Alan Ball', position: 'Ponta Direita', overall: 86, country: 'Inglaterra' },
      { name: 'Martin Peters', position: 'Meio Campo', overall: 86, country: 'Inglaterra' },
    ],
  },
  {
    name: 'Napoli',
    year: 1987,
    country: 'Itália',
    league: 'Serie A',
    ovr: 89,
    formation: '4-4-2 losango',
    decade: 1980,
    badgeColor: '#1e3a8a',
    accentColor: '#f5f5f5',
    description: 'Napoli de Maradona, primeiro scudetto da história do clube.',
    stars: [
      { name: 'Diego Maradona', position: 'Meia Ofensivo', overall: 97, country: 'Argentina' },
      { name: 'Careca', position: 'Centroavante', overall: 88, country: 'Brasil' },
      { name: 'Giordano', position: 'Ponta Esquerda', overall: 86, country: 'Itália' },
      { name: 'Salvatore Bagni', position: 'Volante', overall: 84, country: 'Itália' },
      { name: 'Ciro Ferrara', position: 'Zagueiro', overall: 85, country: 'Itália' },
      { name: 'Claudio Garella', position: 'Goleiro', overall: 85, country: 'Itália' },
    ],
  },
  {
    name: 'Benfica',
    year: 1962,
    country: 'Portugal',
    league: 'Liga Portuguesa',
    ovr: 90,
    formation: '4-3-3',
    decade: 1960,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Benfica bicampeão europeu com Eusébio e Mário Coluna.',
    stars: [
      { name: 'Eusébio', position: 'Centroavante', overall: 94, country: 'Moçambique' },
      { name: 'Mário Coluna', position: 'Meia Ofensivo', overall: 89, country: 'Moçambique' },
      { name: 'José Águas', position: 'Atacante', overall: 86, country: 'Portugal' },
      { name: 'Germano', position: 'Zagueiro', overall: 85, country: 'Portugal' },
      { name: 'Costa Pereira', position: 'Goleiro', overall: 85, country: 'Moçambique' },
      { name: 'Cavém', position: 'Ponta Esquerda', overall: 85, country: 'Portugal' },
    ],
  },
  {
    name: 'Porto',
    year: 1987,
    country: 'Portugal',
    league: 'Liga Portuguesa',
    ovr: 87,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#1e3a8a',
    accentColor: '#ffffff',
    description: 'Porto campeão europeu com Rabah Madjer e Futre.',
    stars: [
      { name: 'Rabah Madjer', position: 'Centroavante', overall: 88, country: 'Argélia' },
      { name: 'Paulo Futre', position: 'Ponta Esquerda', overall: 88, country: 'Portugal' },
      { name: 'Jaime Pacheco', position: 'Volante', overall: 84, country: 'Portugal' },
      { name: 'João Pinto', position: 'Meio Campo', overall: 85, country: 'Portugal' },
      { name: 'António Sousa', position: 'Meia Ofensivo', overall: 84, country: 'Portugal' },
      { name: 'Vítor Baía', position: 'Goleiro', overall: 85, country: 'Portugal' },
    ],
  },
  {
    name: 'Celtic',
    year: 1967,
    country: 'Escócia',
    league: 'Scottish League',
    ovr: 89,
    formation: '4-4-2',
    decade: 1960,
    badgeColor: '#16a34a',
    accentColor: '#ffffff',
    description: 'Lisbon Lions, primeiro clube britânico campeão europeu.',
    stars: [
      { name: 'Jimmy Johnstone', position: 'Ponta Direita', overall: 89, country: 'Escócia' },
      { name: 'Billy McNeill', position: 'Zagueiro', overall: 88, country: 'Escócia' },
      { name: 'Bobby Lennox', position: 'Centroavante', overall: 87, country: 'Escócia' },
      { name: 'Jimmy McGrory', position: 'Atacante', overall: 86, country: 'Escócia' },
      { name: 'Bertie Auld', position: 'Meio Campo', overall: 85, country: 'Escócia' },
      { name: 'Tommy Gemmell', position: 'Lateral Esquerdo', overall: 86, country: 'Escócia' },
    ],
  },
  {
    name: 'Nottingham Forest',
    year: 1979,
    country: 'Inglaterra',
    league: 'First Division',
    ovr: 87,
    formation: '4-4-2',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Forest de Brian Clough, bicampeão europeu surpresa.',
    stars: [
      { name: 'Peter Shilton', position: 'Goleiro', overall: 90, country: 'Inglaterra' },
      { name: 'Trevor Francis', position: 'Centroavante', overall: 87, country: 'Inglaterra' },
      { name: 'John Robertson', position: 'Ponta Esquerda', overall: 86, country: 'Escócia' },
      { name: 'Martin O\'Neill', position: 'Meio Campo', overall: 84, country: 'Irlanda' },
      { name: 'Viv Anderson', position: 'Lateral Direito', overall: 85, country: 'Inglaterra' },
      { name: 'Kenny Burns', position: 'Zagueiro', overall: 85, country: 'Escócia' },
    ],
  },
  {
    name: 'Aston Villa',
    year: 1982,
    country: 'Inglaterra',
    league: 'First Division',
    ovr: 85,
    formation: '4-4-2',
    decade: 1980,
    badgeColor: '#7c3aed',
    accentColor: '#facc15',
    description: 'Aston Villa campeão europeu sobre o Bayern em Rotterdam.',
    stars: [
      { name: 'Peter Withe', position: 'Centroavante', overall: 85, country: 'Inglaterra' },
      { name: 'Tony Morley', position: 'Ponta Esquerda', overall: 84, country: 'Inglaterra' },
      { name: 'Gordon Cowans', position: 'Meio Campo', overall: 85, country: 'Inglaterra' },
      { name: 'Des Bremner', position: 'Volante', overall: 83, country: 'Escócia' },
      { name: 'Nigel Spink', position: 'Goleiro', overall: 83, country: 'Inglaterra' },
      { name: 'Ken McNaught', position: 'Zagueiro', overall: 84, country: 'Escócia' },
    ],
  },
  {
    name: 'Chelsea',
    year: 2012,
    country: 'Inglaterra',
    league: 'Premier League',
    ovr: 88,
    formation: '4-2-3-1',
    decade: 2010,
    badgeColor: '#1e3a8a',
    accentColor: '#ffffff',
    description: 'Chelsea campeão europeu em Munique com Drogba decisivo.',
    stars: [
      { name: 'Didier Drogba', position: 'Centroavante', overall: 89, country: 'Costa do Marfim' },
      { name: 'Frank Lampard', position: 'Meia Ofensivo', overall: 88, country: 'Inglaterra' },
      { name: 'John Terry', position: 'Zagueiro', overall: 87, country: 'Inglaterra' },
      { name: 'Petr Cech', position: 'Goleiro', overall: 88, country: 'Tchéquia' },
      { name: 'Ashley Cole', position: 'Lateral Esquerdo', overall: 86, country: 'Inglaterra' },
      { name: 'Branislav Ivanovic', position: 'Lateral Direito', overall: 85, country: 'Sérvia' },
      { name: 'Juan Mata', position: 'Ponta Direita', overall: 86, country: 'Espanha' },
    ],
  },
  {
    name: 'Manchester City',
    year: 2019,
    country: 'Inglaterra',
    league: 'Premier League',
    ovr: 92,
    formation: '4-3-3',
    decade: 2010,
    badgeColor: '#6cabdd',
    accentColor: '#ffffff',
    description: 'City de Guardiola, domínio inglês com quadriplice nacional.',
    stars: [
      { name: 'Kevin De Bruyne', position: 'Meia Ofensivo', overall: 92, country: 'Bélgica' },
      { name: 'Sergio Agüero', position: 'Centroavante', overall: 91, country: 'Argentina' },
      { name: 'Raheem Sterling', position: 'Ponta Esquerda', overall: 89, country: 'Inglaterra' },
      { name: 'David Silva', position: 'Meio Campo', overall: 90, country: 'Espanha' },
      { name: 'Ederson', position: 'Goleiro', overall: 88, country: 'Brasil' },
      { name: 'Kyle Walker', position: 'Lateral Direito', overall: 86, country: 'Inglaterra' },
      { name: 'Aymeric Laporte', position: 'Zagueiro', overall: 87, country: 'França' },
      { name: 'Bernardo Silva', position: 'Ponta Direita', overall: 88, country: 'Portugal' },
    ],
  },
  {
    name: 'Real Madrid',
    year: 2002,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 94,
    formation: '4-2-3-1',
    decade: 2000,
    badgeColor: '#ffffff',
    accentColor: '#fbbf24',
    description: 'Real Madrid das Galácticos, bicampeão europeu com Zidane.',
    stars: [
      { name: 'Zinedine Zidane', position: 'Meia Ofensivo', overall: 94, country: 'França' },
      { name: 'Ronaldo Fenômeno', position: 'Centroavante', overall: 95, country: 'Brasil' },
      { name: 'Raúl', position: 'Atacante', overall: 91, country: 'Espanha' },
      { name: 'Luis Figo', position: 'Ponta Direita', overall: 92, country: 'Portugal' },
      { name: 'Roberto Carlos', position: 'Lateral Esquerdo', overall: 92, country: 'Brasil' },
      { name: 'Iker Casillas', position: 'Goleiro', overall: 90, country: 'Espanha' },
      { name: 'Fernando Hierro', position: 'Zagueiro', overall: 89, country: 'Espanha' },
      { name: 'Claude Makélélé', position: 'Volante', overall: 88, country: 'França' },
    ],
  },
  {
    name: 'Real Madrid',
    year: 2018,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 95,
    formation: '4-3-3',
    decade: 2010,
    badgeColor: '#ffffff',
    accentColor: '#fbbf24',
    description: 'Real de Zidane no banco, tricampeão europeu consecutivo.',
    stars: [
      { name: 'Cristiano Ronaldo', position: 'Centroavante', overall: 96, country: 'Portugal' },
      { name: 'Luka Modric', position: 'Meio Campo', overall: 92, country: 'Croácia' },
      { name: 'Toni Kroos', position: 'Volante', overall: 90, country: 'Alemanha' },
      { name: 'Sergio Ramos', position: 'Zagueiro', overall: 90, country: 'Espanha' },
      { name: 'Gareth Bale', position: 'Ponta Direita', overall: 90, country: 'Gales' },
      { name: 'Karim Benzema', position: 'Atacante', overall: 89, country: 'França' },
      { name: 'Marcelo', position: 'Lateral Esquerdo', overall: 89, country: 'Brasil' },
      { name: 'Keylor Navas', position: 'Goleiro', overall: 87, country: 'Costa Rica' },
    ],
  },
  {
    name: 'Barcelona',
    year: 2011,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 96,
    formation: '4-3-3',
    decade: 2010,
    badgeColor: '#a50044',
    accentColor: '#004d98',
    description: 'Barça no auge do tiki-taka, considerado o melhor time da história.',
    stars: [
      { name: 'Lionel Messi', position: 'Ponta Direita', overall: 98, country: 'Argentina' },
      { name: 'Xavi', position: 'Meio Campo', overall: 94, country: 'Espanha' },
      { name: 'Andrés Iniesta', position: 'Meia Ofensivo', overall: 94, country: 'Espanha' },
      { name: 'David Villa', position: 'Ponta Esquerda', overall: 90, country: 'Espanha' },
      { name: 'Sergio Busquets', position: 'Volante', overall: 89, country: 'Espanha' },
      { name: 'Carles Puyol', position: 'Zagueiro', overall: 88, country: 'Espanha' },
      { name: 'Gerard Piqué', position: 'Zagueiro', overall: 89, country: 'Espanha' },
      { name: 'Dani Alves', position: 'Lateral Direito', overall: 90, country: 'Brasil' },
      { name: 'Víctor Valdés', position: 'Goleiro', overall: 87, country: 'Espanha' },
    ],
  },
  {
    name: 'AC Milan',
    year: 1994,
    country: 'Itália',
    league: 'Serie A',
    ovr: 94,
    formation: '4-4-2',
    decade: 1990,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'Milan de Capello, atropelou o Barcelona 4-0 em Atenas.',
    stars: [
      { name: 'Franco Baresi', position: 'Zagueiro', overall: 93, country: 'Itália' },
      { name: 'Paolo Maldini', position: 'Lateral Esquerdo', overall: 93, country: 'Itália' },
      { name: 'Marcel Desailly', position: 'Volante', overall: 91, country: 'França' },
      { name: 'Dejan Savićević', position: 'Meia Ofensivo', overall: 91, country: 'Montenegro' },
      { name: 'Zvonimir Boban', position: 'Meio Campo', overall: 89, country: 'Croácia' },
      { name: 'Roberto Donadoni', position: 'Ponta Esquerda', overall: 88, country: 'Itália' },
      { name: 'Daniele Massaro', position: 'Centroavante', overall: 86, country: 'Itália' },
      { name: 'Sebastiano Rossi', position: 'Goleiro', overall: 86, country: 'Itália' },
    ],
  },
  {
    name: 'Juventus',
    year: 2017,
    country: 'Itália',
    league: 'Serie A',
    ovr: 90,
    formation: '4-2-3-1',
    decade: 2010,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Juve de Allegri, bicampeão italiano com defesa de ferro.',
    stars: [
      { name: 'Gianluigi Buffon', position: 'Goleiro', overall: 90, country: 'Itália' },
      { name: 'Gonzalo Higuaín', position: 'Centroavante', overall: 89, country: 'Argentina' },
      { name: 'Paulo Dybala', position: 'Meia Ofensivo', overall: 89, country: 'Argentina' },
      { name: 'Giorgio Chiellini', position: 'Zagueiro', overall: 89, country: 'Itália' },
      { name: 'Leonardo Bonucci', position: 'Zagueiro', overall: 88, country: 'Itália' },
      { name: 'Miralem Pjanić', position: 'Volante', overall: 87, country: 'Bósnia' },
      { name: 'Alex Sandro', position: 'Lateral Esquerdo', overall: 86, country: 'Brasil' },
    ],
  },
  {
    name: 'Bayern de Munique',
    year: 2013,
    country: 'Alemanha',
    league: 'Bundesliga',
    ovr: 95,
    formation: '4-2-3-1',
    decade: 2010,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Bayern de Heynckes, tríplice coroa sobre o Borussia em Wembley.',
    stars: [
      { name: 'Manuel Neuer', position: 'Goleiro', overall: 91, country: 'Alemanha' },
      { name: 'Philipp Lahm', position: 'Lateral Direito', overall: 89, country: 'Alemanha' },
      { name: 'Bastian Schweinsteiger', position: 'Volante', overall: 90, country: 'Alemanha' },
      { name: 'Franck Ribéry', position: 'Ponta Esquerda', overall: 91, country: 'França' },
      { name: 'Arjen Robben', position: 'Ponta Direita', overall: 91, country: 'Holanda' },
      { name: 'Thomas Müller', position: 'Atacante', overall: 88, country: 'Alemanha' },
      { name: 'Jérôme Boateng', position: 'Zagueiro', overall: 87, country: 'Alemanha' },
      { name: 'Mario Mandžukić', position: 'Centroavante', overall: 86, country: 'Croácia' },
    ],
  },
  {
    name: 'Borussia Dortmund',
    year: 1997,
    country: 'Alemanha',
    league: 'Bundesliga',
    ovr: 89,
    formation: '4-4-2 losango',
    decade: 1990,
    badgeColor: '#facc15',
    accentColor: '#000000',
    description: 'Borussia campeão europeu sobre a Juventus com Karlheinz Riedle.',
    stars: [
      { name: 'Matthias Sammer', position: 'Zagueiro', overall: 91, country: 'Alemanha' },
      { name: 'Karlheinz Riedle', position: 'Centroavante', overall: 87, country: 'Alemanha' },
      { name: 'Stéphane Chapuisat', position: 'Atacante', overall: 86, country: 'Suíça' },
      { name: 'Andreas Möller', position: 'Meia Ofensivo', overall: 88, country: 'Alemanha' },
      { name: 'Jürgen Kohler', position: 'Zagueiro', overall: 88, country: 'Alemanha' },
      { name: 'Stefan Reuter', position: 'Lateral Direito', overall: 86, country: 'Alemanha' },
      { name: 'Stefan Klos', position: 'Goleiro', overall: 85, country: 'Alemanha' },
    ],
  },
  {
    name: 'Liverpool',
    year: 2019,
    country: 'Inglaterra',
    league: 'Premier League',
    ovr: 94,
    formation: '4-3-3',
    decade: 2010,
    badgeColor: '#dc2626',
    accentColor: '#fbbf24',
    description: 'Liverpool de Klopp, hexa europeu com virada histórica sobre o Barça.',
    stars: [
      { name: 'Mohamed Salah', position: 'Ponta Direita', overall: 92, country: 'Egito' },
      { name: 'Virgil van Dijk', position: 'Zagueiro', overall: 92, country: 'Holanda' },
      { name: 'Sadio Mané', position: 'Ponta Esquerda', overall: 91, country: 'Senegal' },
      { name: 'Roberto Firmino', position: 'Centroavante', overall: 88, country: 'Brasil' },
      { name: 'Alisson', position: 'Goleiro', overall: 90, country: 'Brasil' },
      { name: 'Trent Alexander-Arnold', position: 'Lateral Direito', overall: 88, country: 'Inglaterra' },
      { name: 'Andrew Robertson', position: 'Lateral Esquerdo', overall: 87, country: 'Escócia' },
      { name: 'Fabinho', position: 'Volante', overall: 88, country: 'Brasil' },
    ],
  },
  {
    name: 'Liverpool',
    year: 1977,
    country: 'Inglaterra',
    league: 'First Division',
    ovr: 89,
    formation: '4-4-2',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#fbbf24',
    description: 'Liverpool de Paisley, primeiro título europeu em Roma.',
    stars: [
      { name: 'Kevin Keegan', position: 'Centroavante', overall: 90, country: 'Inglaterra' },
      { name: 'Steve Heighway', position: 'Ponta Direita', overall: 86, country: 'Irlanda' },
      { name: 'Ray Kennedy', position: 'Atacante', overall: 86, country: 'Inglaterra' },
      { name: 'Emlyn Hughes', position: 'Zagueiro', overall: 87, country: 'Inglaterra' },
      { name: 'Phil Neal', position: 'Lateral Direito', overall: 85, country: 'Inglaterra' },
      { name: 'Ray Clemence', position: 'Goleiro', overall: 88, country: 'Inglaterra' },
      { name: 'Terry McDermott', position: 'Meio Campo', overall: 86, country: 'Inglaterra' },
    ],
  },
  {
    name: 'Santos',
    year: 2011,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 86,
    formation: '4-3-3',
    decade: 2010,
    badgeColor: '#ffffff',
    accentColor: '#000000',
    description: 'Santos de Neymar e Ganso, bicampeão da Libertadores.',
    stars: [
      { name: 'Neymar', position: 'Ponta Esquerda', overall: 88, country: 'Brasil' },
      { name: 'Ganso', position: 'Meia Ofensivo', overall: 86, country: 'Brasil' },
      { name: 'Borges', position: 'Centroavante', overall: 83, country: 'Brasil' },
      { name: 'Elano', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Danilo', position: 'Lateral Direito', overall: 82, country: 'Brasil' },
      { name: 'Léo', position: 'Lateral Esquerdo', overall: 82, country: 'Brasil' },
      { name: 'Rafael Cabral', position: 'Goleiro', overall: 83, country: 'Brasil' },
    ],
  },
  {
    name: 'Atlético de Madrid',
    year: 2014,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 90,
    formation: '4-4-2',
    decade: 2010,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Atleti de Simeone, campeão espanhol e finalista europeu.',
    stars: [
      { name: 'Diego Costa', position: 'Centroavante', overall: 89, country: 'Espanha' },
      { name: 'Koke', position: 'Meio Campo', overall: 87, country: 'Espanha' },
      { name: 'Diego Godín', position: 'Zagueiro', overall: 89, country: 'Uruguai' },
      { name: 'Filipe Luís', position: 'Lateral Esquerdo', overall: 86, country: 'Brasil' },
      { name: 'Juanfran', position: 'Lateral Direito', overall: 85, country: 'Espanha' },
      { name: 'Thibaut Courtois', position: 'Goleiro', overall: 89, country: 'Bélgica' },
      { name: 'Arda Turan', position: 'Ponta Direita', overall: 86, country: 'Turquia' },
      { name: 'Gabi', position: 'Volante', overall: 84, country: 'Espanha' },
    ],
  },
  {
    name: 'Sevilla',
    year: 2006,
    country: 'Espanha',
    league: 'La Liga',
    ovr: 84,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Sevilla campeão da Copa da UEFA com Kanouté e Dani Alves.',
    stars: [
      { name: 'Frédéric Kanouté', position: 'Centroavante', overall: 86, country: 'Mali' },
      { name: 'Luís Fabiano', position: 'Atacante', overall: 86, country: 'Brasil' },
      { name: 'Daniel Alves', position: 'Lateral Direito', overall: 86, country: 'Brasil' },
      { name: 'Jesús Navas', position: 'Ponta Direita', overall: 85, country: 'Espanha' },
      { name: 'Seydou Keita', position: 'Volante', overall: 84, country: 'Mali' },
      { name: 'Andrés Palop', position: 'Goleiro', overall: 83, country: 'Espanha' },
    ],
  },
  {
    name: 'PSV',
    year: 1988,
    country: 'Holanda',
    league: 'Eredivisie',
    ovr: 86,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'PSV campeão europeu com Romário em ascensão.',
    stars: [
      { name: 'Romário', position: 'Centroavante', overall: 91, country: 'Brasil' },
      { name: 'Ronald Koeman', position: 'Zagueiro', overall: 88, country: 'Holanda' },
      { name: 'Søren Lerby', position: 'Volante', overall: 85, country: 'Holanda' },
      { name: 'Gerald Vanenburg', position: 'Ponta Direita', overall: 85, country: 'Holanda' },
      { name: 'Hans van Breukelen', position: 'Goleiro', overall: 85, country: 'Holanda' },
      { name: 'Wim Kieft', position: 'Atacante', overall: 84, country: 'Holanda' },
    ],
  },
  {
    name: 'Feyenoord',
    year: 1970,
    country: 'Holanda',
    league: 'Eredivisie',
    ovr: 86,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Feyenoord campeão europeu com Ove Kindvall decisivo.',
    stars: [
      { name: 'Ove Kindvall', position: 'Centroavante', overall: 87, country: 'Suécia' },
      { name: 'Wim van Hanegem', position: 'Meia Ofensivo', overall: 87, country: 'Holanda' },
      { name: 'Wim Jansen', position: 'Volante', overall: 85, country: 'Holanda' },
      { name: 'Wim Rijsbergen', position: 'Zagueiro', overall: 84, country: 'Holanda' },
      { name: 'Eddy Treijtel', position: 'Goleiro', overall: 83, country: 'Holanda' },
      { name: 'Henk Wery', position: 'Ponta Direita', overall: 84, country: 'Holanda' },
    ],
  },
  {
    name: 'Marseille',
    year: 1993,
    country: 'França',
    league: 'Ligue 1',
    ovr: 87,
    formation: '4-3-3',
    decade: 1990,
    badgeColor: '#1e3a8a',
    accentColor: '#facc15',
    description: 'Marseille campeão europeu com Boli e Deschamps.',
    stars: [
      { name: 'Basile Boli', position: 'Zagueiro', overall: 86, country: 'Costa do Marfim' },
      { name: 'Didier Deschamps', position: 'Volante', overall: 86, country: 'França' },
      { name: 'Marcel Desailly', position: 'Zagueiro', overall: 87, country: 'França' },
      { name: 'Rudi Völler', position: 'Centroavante', overall: 87, country: 'Alemanha' },
      { name: 'Alen Bokšić', position: 'Atacante', overall: 86, country: 'Croácia' },
      { name: 'Fabien Barthez', position: 'Goleiro', overall: 84, country: 'França' },
    ],
  },
  {
    name: 'Estrela Vermelha',
    year: 1991,
    country: 'Sérvia',
    league: 'Liga Iugoslava',
    ovr: 84,
    formation: '4-4-2',
    decade: 1990,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Estrela Vermelha campeã europeia em Bari.',
    stars: [
      { name: 'Dejan Savićević', position: 'Meia Ofensivo', overall: 90, country: 'Montenegro' },
      { name: 'Robert Prosinečki', position: 'Meio Campo', overall: 89, country: 'Croácia' },
      { name: 'Siniša Mihajlović', position: 'Volante', overall: 86, country: 'Sérvia' },
      { name: 'Darko Pančev', position: 'Centroavante', overall: 85, country: 'Macedônia' },
      { name: 'Vladimir Jugović', position: 'Meio Campo', overall: 84, country: 'Sérvia' },
      { name: 'Stevan Stojanović', position: 'Goleiro', overall: 83, country: 'Sérvia' },
    ],
  },
  {
    name: 'Palmeiras',
    year: 1999,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 87,
    formation: '4-4-2',
    decade: 1990,
    badgeColor: '#16a34a',
    accentColor: '#ffffff',
    description: 'Palmeiras de Felipão, campeão da Libertadores em pleno Palestra.',
    stars: [
      { name: 'Alex', position: 'Meia Ofensivo', overall: 87, country: 'Brasil' },
      { name: 'Paulo Nunes', position: 'Atacante', overall: 85, country: 'Brasil' },
      { name: 'Oséas', position: 'Centroavante', overall: 83, country: 'Brasil' },
      { name: 'Zinho', position: 'Meio Campo', overall: 84, country: 'Brasil' },
      { name: 'Felipe', position: 'Lateral Direito', overall: 83, country: 'Brasil' },
      { name: 'Roque Júnior', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Marcos', position: 'Goleiro', overall: 86, country: 'Brasil' },
      { name: 'César Sampaio', position: 'Volante', overall: 85, country: 'Brasil' },
    ],
  },
  {
    name: 'Vasco da Gama',
    year: 1998,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 86,
    formation: '4-4-2 losango',
    decade: 1990,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Vasco de Juninho e Donizete, campeão da Libertadores.',
    stars: [
      { name: 'Juninho Pernambucano', position: 'Meia Ofensivo', overall: 88, country: 'Brasil' },
      { name: 'Donizete', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Luizão', position: 'Centroavante', overall: 84, country: 'Brasil' },
      { name: 'Ramón', position: 'Ponta Direita', overall: 84, country: 'Brasil' },
      { name: 'Felipe', position: 'Atacante', overall: 84, country: 'Brasil' },
      { name: 'Mauro Galvão', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Carlos Germano', position: 'Goleiro', overall: 85, country: 'Brasil' },
    ],
  },
  {
    name: 'Fluminense',
    year: 1984,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 84,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#7c3aed',
    accentColor: '#0f766e',
    description: 'Flu de Castor de Andrade, campeão brasileiro com Assis e Washington.',
    stars: [
      { name: 'Washington', position: 'Centroavante', overall: 84, country: 'Brasil' },
      { name: 'Assis', position: 'Ponta Direita', overall: 84, country: 'Brasil' },
      { name: 'Edinho', position: 'Volante', overall: 83, country: 'Brasil' },
      { name: 'Branco', position: 'Lateral Esquerdo', overall: 85, country: 'Brasil' },
      { name: 'Ricardo Gomes', position: 'Zagueiro', overall: 84, country: 'Brasil' },
      { name: 'Paulo Vitor', position: 'Goleiro', overall: 83, country: 'Brasil' },
    ],
  },
  {
    name: 'Internacional',
    year: 2006,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 87,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Colorados bicampeão da Libertadores e mundial sobre o Barça.',
    stars: [
      { name: 'Fernandão', position: 'Centroavante', overall: 85, country: 'Brasil' },
      { name: 'Rafael Sóbis', position: 'Atacante', overall: 84, country: 'Brasil' },
      { name: 'Alexandrino', position: 'Ponta Direita', overall: 82, country: 'Brasil' },
      { name: 'Tinga', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Fábio Ceará', position: 'Meio Campo', overall: 82, country: 'Brasil' },
      { name: 'Ceará', position: 'Lateral Direito', overall: 82, country: 'Brasil' },
      { name: 'Índio', position: 'Zagueiro', overall: 84, country: 'Brasil' },
      { name: 'Clemer', position: 'Goleiro', overall: 83, country: 'Brasil' },
    ],
  },
  {
    name: 'Sport Club Bahia',
    year: 1959,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 80,
    formation: '4-3-3',
    decade: 1950,
    badgeColor: '#1e3a8a',
    accentColor: '#dc2626',
    description: 'Bahia primeiro campeão brasileiro da era moderna.',
    stars: [
      { name: 'Ney', position: 'Centroavante', overall: 82, country: 'Brasil' },
      { name: 'Vítor', position: 'Goleiro', overall: 80, country: 'Brasil' },
      { name: 'Marito', position: 'Meia Ofensivo', overall: 80, country: 'Brasil' },
      { name: 'Jacaré', position: 'Zagueiro', overall: 79, country: 'Brasil' },
      { name: 'Almeida', position: 'Volante', overall: 78, country: 'Brasil' },
    ],
  },
  {
    name: 'Athletico Paranaense',
    year: 2001,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 82,
    formation: '4-4-2',
    decade: 2000,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'Furacão primeiro campeão brasileiro do Sul do país.',
    stars: [
      { name: 'Alex Mineiro', position: 'Centroavante', overall: 83, country: 'Brasil' },
      { name: 'Kleber', position: 'Ponta Esquerda', overall: 82, country: 'Brasil' },
      { name: 'Ilhan', position: 'Meia Ofensivo', overall: 80, country: 'Brasil' },
      { name: 'Lima', position: 'Volante', overall: 80, country: 'Brasil' },
      { name: 'Rogério Correa', position: 'Lateral Esquerdo', overall: 80, country: 'Brasil' },
    ],
  },
  {
    name: 'Boca Juniors',
    year: 2000,
    country: 'Argentina',
    league: 'Argentino',
    ovr: 88,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#1e3a8a',
    accentColor: '#facc15',
    description: 'Boca de Bianchi, bicampeão da Libertadores com Riquelme.',
    stars: [
      { name: 'Juan Román Riquelme', position: 'Meia Ofensivo', overall: 90, country: 'Argentina' },
      { name: 'Martín Palermo', position: 'Centroavante', overall: 87, country: 'Argentina' },
      { name: 'Guillermo Barros Schelotto', position: 'Ponta Direita', overall: 85, country: 'Argentina' },
      { name: 'Sebastián Battaglia', position: 'Volante', overall: 84, country: 'Argentina' },
      { name: 'Roberto Abbondanzieri', position: 'Goleiro', overall: 85, country: 'Argentina' },
      { name: 'Aníbal Matellán', position: 'Zagueiro', overall: 83, country: 'Argentina' },
    ],
  },
  {
    name: 'River Plate',
    year: 1986,
    country: 'Argentina',
    league: 'Argentino',
    ovr: 86,
    formation: '4-3-3',
    decade: 1980,
    badgeColor: '#ffffff',
    accentColor: '#dc2626',
    description: 'River Plate campeão da Libertadores com Francescoli.',
    stars: [
      { name: 'Enzo Francescoli', position: 'Meia Ofensivo', overall: 89, country: 'Uruguai' },
      { name: 'Juan Gilberto Funes', position: 'Centroavante', overall: 85, country: 'Argentina' },
      { name: 'Claudio Paul Caniggia', position: 'Ponta Direita', overall: 86, country: 'Argentina' },
      { name: 'Néstor Gorosito', position: 'Volante', overall: 84, country: 'Argentina' },
      { name: 'Héctor Enrique', position: 'Meio Campo', overall: 83, country: 'Argentina' },
      { name: 'Nery Pumpido', position: 'Goleiro', overall: 84, country: 'Argentina' },
    ],
  },
  {
    name: 'Independiente',
    year: 1973,
    country: 'Argentina',
    league: 'Argentino',
    ovr: 86,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#dc2626',
    accentColor: '#ffffff',
    description: 'Rei de Copas, tetracampeão da Libertadores consecutivo.',
    stars: [
      { name: 'Ricardo Bochini', position: 'Meia Ofensivo', overall: 89, country: 'Argentina' },
      { name: 'Daniel Bertoni', position: 'Ponta Direita', overall: 86, country: 'Argentina' },
      { name: 'Eduardo Maglioni', position: 'Centroavante', overall: 84, country: 'Argentina' },
      { name: 'Francisco Sá', position: 'Zagueiro', overall: 84, country: 'Argentina' },
      { name: 'José Pastoriza', position: 'Volante', overall: 85, country: 'Argentina' },
      { name: 'Santoro', position: 'Goleiro', overall: 83, country: 'Argentina' },
    ],
  },
  {
    name: 'Nacional',
    year: 1971,
    country: 'Uruguai',
    league: 'Uruguaio',
    ovr: 84,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#ffffff',
    accentColor: '#1e3a8a',
    description: 'Nacional de Cubilla e Artime, primeiro título da Libertadores.',
    stars: [
      { name: 'Luis Artime', position: 'Centroavante', overall: 87, country: 'Argentina' },
      { name: 'Pedro Rocha', position: 'Meia Ofensivo', overall: 85, country: 'Uruguai' },
      { name: 'Luis Cubilla', position: 'Ponta Direita', overall: 86, country: 'Uruguai' },
      { name: 'Atilio Ancheta', position: 'Zagueiro', overall: 83, country: 'Uruguai' },
      { name: 'Mamelli', position: 'Goleiro', overall: 82, country: 'Uruguai' },
    ],
  },
  {
    name: 'Peñarol',
    year: 1966,
    country: 'Uruguai',
    league: 'Uruguaio',
    ovr: 85,
    formation: '4-3-3',
    decade: 1960,
    badgeColor: '#000000',
    accentColor: '#facc15',
    description: 'Peñarol bicampeão da Libertadores com Spencer e Joya.',
    stars: [
      { name: 'Alberto Spencer', position: 'Centroavante', overall: 88, country: 'Equador' },
      { name: 'Pedro Rocha', position: 'Meia Ofensivo', overall: 85, country: 'Uruguai' },
      { name: 'Julio César Cortés', position: 'Meio Campo', overall: 83, country: 'Uruguai' },
      { name: 'Omar Caetano', position: 'Volante', overall: 82, country: 'Uruguai' },
      { name: 'Ladislao Mazurkiewicz', position: 'Goleiro', overall: 87, country: 'Uruguai' },
    ],
  },
  {
    name: 'Olimpia',
    year: 1979,
    country: 'Paraguai',
    league: 'Paraguaio',
    ovr: 83,
    formation: '4-4-2',
    decade: 1970,
    badgeColor: '#ffffff',
    accentColor: '#000000',
    description: 'Olimpia do Paraguai, primeiro campeão da Libertadores do país.',
    stars: [
      { name: 'Alicio Solalinde', position: 'Zagueiro', overall: 83, country: 'Paraguai' },
      { name: 'Ever Hugo Almeida', position: 'Goleiro', overall: 83, country: 'Paraguai' },
      { name: 'Osvaldo Aquino', position: 'Volante', overall: 81, country: 'Paraguai' },
      { name: 'Isidro Candía', position: 'Meia Ofensivo', overall: 81, country: 'Paraguai' },
      { name: 'Miguel Chaparro', position: 'Centroavante', overall: 82, country: 'Paraguai' },
    ],
  },
  {
    name: 'Colo-Colo',
    year: 1991,
    country: 'Chile',
    league: 'Chileno',
    ovr: 82,
    formation: '4-4-2',
    decade: 1990,
    badgeColor: '#ffffff',
    accentColor: '#000000',
    description: 'Colo-Colo, único clube chileno campeão da Libertadores.',
    stars: [
      { name: 'Marcelo Barticciotto', position: 'Meia Ofensivo', overall: 84, country: 'Argentina' },
      { name: 'Rubén Martínez', position: 'Centroavante', overall: 83, country: 'Uruguai' },
      { name: 'Gabriel Mendoza', position: 'Ponta Direita', overall: 82, country: 'Chile' },
      { name: 'Lizardo Garrido', position: 'Zagueiro', overall: 83, country: 'Chile' },
      { name: 'Daniel Morón', position: 'Goleiro', overall: 81, country: 'Chile' },
    ],
  },
  {
    name: 'Atlético Nacional',
    year: 1989,
    country: 'Colômbia',
    league: 'Colombiano',
    ovr: 82,
    formation: '4-4-2',
    decade: 1980,
    badgeColor: '#16a34a',
    accentColor: '#ffffff',
    description: 'Nacional primeiro campeão colombiano da Libertadores.',
    stars: [
      { name: 'René Higuita', position: 'Goleiro', overall: 86, country: 'Colômbia' },
      { name: 'Andrés Escobar', position: 'Zagueiro', overall: 83, country: 'Colômbia' },
      { name: 'Faustino Asprilla', position: 'Atacante', overall: 84, country: 'Colômbia' },
      { name: 'Albeiro Usuriaga', position: 'Centroavante', overall: 83, country: 'Colômbia' },
      { name: 'Leonel Álvarez', position: 'Volante', overall: 82, country: 'Colômbia' },
    ],
  },
  {
    name: 'São Paulo',
    year: 1993,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 91,
    formation: '4-3-3',
    decade: 1990,
    badgeColor: '#dc2626',
    accentColor: '#000000',
    description: 'São Paulo de Telê, bicampeão da Libertadores e mundial em Tóquio.',
    stars: [
      { name: 'Raí', position: 'Meia Ofensivo', overall: 90, country: 'Brasil' },
      { name: 'Müller', position: 'Atacante', overall: 86, country: 'Brasil' },
      { name: 'Toninho Cerezo', position: 'Volante', overall: 87, country: 'Brasil' },
      { name: 'Cafu', position: 'Lateral Direito', overall: 87, country: 'Brasil' },
      { name: 'Ronaldo Luís', position: 'Centroavante', overall: 84, country: 'Brasil' },
      { name: 'Zetti', position: 'Goleiro', overall: 84, country: 'Brasil' },
      { name: 'Vítor', position: 'Zagueiro', overall: 85, country: 'Brasil' },
      { name: 'Pintado', position: 'Zagueiro', overall: 84, country: 'Brasil' },
    ],
  },
  {
    name: 'Santos',
    year: 2004,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 84,
    formation: '4-3-3',
    decade: 2000,
    badgeColor: '#ffffff',
    accentColor: '#000000',
    description: 'Santos de Robinho e Diego, campeão brasileiro de futebol arte.',
    stars: [
      { name: 'Robinho', position: 'Ponta Direita', overall: 87, country: 'Brasil' },
      { name: 'Diego', position: 'Meia Ofensivo', overall: 86, country: 'Brasil' },
      { name: 'Ricardinho', position: 'Volante', overall: 84, country: 'Brasil' },
      { name: 'Elano', position: 'Meio Campo', overall: 84, country: 'Brasil' },
      { name: 'Alex', position: 'Centroavante', overall: 82, country: 'Brasil' },
      { name: 'Léo', position: 'Lateral Esquerdo', overall: 82, country: 'Brasil' },
    ],
  },
  {
    name: 'Atlético Mineiro',
    year: 1971,
    country: 'Brasil',
    league: 'Brasileirão',
    ovr: 80,
    formation: '4-3-3',
    decade: 1970,
    badgeColor: '#000000',
    accentColor: '#ffffff',
    description: 'Galo primeiro campeão brasileiro pós-1970 com Dadá Maravilha.',
    stars: [
      { name: 'Dadá Maravilha', position: 'Centroavante', overall: 85, country: 'Brasil' },
      { name: 'Afonso', position: 'Ponta Direita', overall: 81, country: 'Brasil' },
      { name: 'Vânavo', position: 'Volante', overall: 80, country: 'Brasil' },
      { name: 'Hiroshi', position: 'Zagueiro', overall: 79, country: 'Brasil' },
      { name: 'Placido', position: 'Goleiro', overall: 79, country: 'Brasil' },
    ],
  },
];

// ============================================================
// Club pools for procedural generation
// ============================================================

interface ClubSeed {
  name: string;
  country: string;
  league: string;
}

const BRAZILIAN_CLUBS: ClubSeed[] = [
  { name: 'Flamengo', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Vasco da Gama', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Botafogo', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Fluminense', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Palmeiras', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Corinthians', country: 'Brasil', league: 'Brasileirão' },
  { name: 'São Paulo', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Santos', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Cruzeiro', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Atlético Mineiro', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Grêmio', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Internacional', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Bahia', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Vitória', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Sport Recife', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Santa Cruz', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Ceará', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Fortaleza', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Coritiba', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Athletico Paranaense', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Goiás', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Juventude', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Guarani', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Ponte Preta', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Portuguesa', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Bangu', country: 'Brasil', league: 'Brasileirão' },
  { name: 'América-RJ', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Atlético-GO', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Paysandu', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Remo', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Criciúma', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Paraná', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Bragantino', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Joinville', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Figueirense', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Chapecoense', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Avaí', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Náutico', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Operário-PR', country: 'Brasil', league: 'Brasileirão' },
  { name: 'América-MG', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Botafogo-PB', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Sampaio Corrêa', country: 'Brasil', league: 'Brasileirão' },
  { name: 'CRB', country: 'Brasil', league: 'Brasileirão' },
  { name: 'CSA', country: 'Brasil', league: 'Brasileirão' },
  { name: 'ABC', country: 'Brasil', league: 'Brasileirão' },
  { name: 'Barueri', country: 'Brasil', league: 'Brasileirão' },
];

const INTERNATIONAL_CLUBS: ClubSeed[] = [
  { name: 'Real Madrid', country: 'Espanha', league: 'La Liga' },
  { name: 'Barcelona', country: 'Espanha', league: 'La Liga' },
  { name: 'Atlético de Madrid', country: 'Espanha', league: 'La Liga' },
  { name: 'Athletic Bilbao', country: 'Espanha', league: 'La Liga' },
  { name: 'Sevilla', country: 'Espanha', league: 'La Liga' },
  { name: 'Valencia', country: 'Espanha', league: 'La Liga' },
  { name: 'Villarreal', country: 'Espanha', league: 'La Liga' },
  { name: 'Real Sociedad', country: 'Espanha', league: 'La Liga' },
  { name: 'Real Betis', country: 'Espanha', league: 'La Liga' },
  { name: 'Deportivo La Coruña', country: 'Espanha', league: 'La Liga' },
  { name: 'Inter de Milão', country: 'Itália', league: 'Serie A' },
  { name: 'AC Milan', country: 'Itália', league: 'Serie A' },
  { name: 'Juventus', country: 'Itália', league: 'Serie A' },
  { name: 'Roma', country: 'Itália', league: 'Serie A' },
  { name: 'Lazio', country: 'Itália', league: 'Serie A' },
  { name: 'Napoli', country: 'Itália', league: 'Serie A' },
  { name: 'Fiorentina', country: 'Itália', league: 'Serie A' },
  { name: 'Torino', country: 'Itália', league: 'Serie A' },
  { name: 'Sampdoria', country: 'Itália', league: 'Serie A' },
  { name: 'Genoa', country: 'Itália', league: 'Serie A' },
  { name: 'Parma', country: 'Itália', league: 'Serie A' },
  { name: 'Bayern de Munique', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Borussia Dortmund', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Schalke 04', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Bayer Leverkusen', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Hamburgo', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Werder Bremen', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Stuttgart', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Borussia Mönchengladbach', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Eintracht Frankfurt', country: 'Alemanha', league: 'Bundesliga' },
  { name: 'Liverpool', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Manchester United', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Manchester City', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Chelsea', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Arsenal', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Tottenham', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Everton', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Leeds United', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Newcastle United', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Aston Villa', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Nottingham Forest', country: 'Inglaterra', league: 'Premier League' },
  { name: 'Rangers', country: 'Escócia', league: 'Scottish League' },
  { name: 'Celtic', country: 'Escócia', league: 'Scottish League' },
  { name: 'Ajax', country: 'Holanda', league: 'Eredivisie' },
  { name: 'PSV', country: 'Holanda', league: 'Eredivisie' },
  { name: 'Feyenoord', country: 'Holanda', league: 'Eredivisie' },
  { name: 'Porto', country: 'Portugal', league: 'Liga Portuguesa' },
  { name: 'Benfica', country: 'Portugal', league: 'Liga Portuguesa' },
  { name: 'Sporting', country: 'Portugal', league: 'Liga Portuguesa' },
  { name: 'Marseille', country: 'França', league: 'Ligue 1' },
  { name: 'Lyon', country: 'França', league: 'Ligue 1' },
  { name: 'Paris Saint-Germain', country: 'França', league: 'Ligue 1' },
  { name: 'Bordeaux', country: 'França', league: 'Ligue 1' },
  { name: 'Monaco', country: 'França', league: 'Ligue 1' },
  { name: 'Saint-Étienne', country: 'França', league: 'Ligue 1' },
  { name: 'River Plate', country: 'Argentina', league: 'Argentino' },
  { name: 'Boca Juniors', country: 'Argentina', league: 'Argentino' },
  { name: 'Independiente', country: 'Argentina', league: 'Argentino' },
  { name: 'Racing Club', country: 'Argentina', league: 'Argentino' },
  { name: 'Estudiantes', country: 'Argentina', league: 'Argentino' },
  { name: 'San Lorenzo', country: 'Argentina', league: 'Argentino' },
  { name: 'Nacional', country: 'Uruguai', league: 'Uruguaio' },
  { name: 'Peñarol', country: 'Uruguai', league: 'Uruguaio' },
  { name: 'Olimpia', country: 'Paraguai', league: 'Paraguaio' },
  { name: 'Colo-Colo', country: 'Chile', league: 'Chileno' },
  { name: 'Universidad Católica', country: 'Chile', league: 'Chileno' },
  { name: 'Atlético Nacional', country: 'Colômbia', league: 'Colombiano' },
  { name: 'Millonarios', country: 'Colômbia', league: 'Colombiano' },
  { name: 'Estrela Vermelha', country: 'Sérvia', league: 'Liga Sérvia' },
  { name: 'Estrela Azul', country: 'Sérvia', league: 'Liga Sérvia' },
  { name: 'Dínamo Zagreb', country: 'Croácia', league: 'Liga Croata' },
  { name: 'Steaua Bucareste', country: 'Romênia', league: 'Liga Romena' },
];

const NATIONAL_TEAMS: ClubSeed[] = [
  { name: 'Brasil', country: 'Brasil', league: 'Seleções' },
  { name: 'Argentina', country: 'Argentina', league: 'Seleções' },
  { name: 'Uruguai', country: 'Uruguai', league: 'Seleções' },
  { name: 'Itália', country: 'Itália', league: 'Seleções' },
  { name: 'Alemanha', country: 'Alemanha', league: 'Seleções' },
  { name: 'Holanda', country: 'Holanda', league: 'Seleções' },
  { name: 'Inglaterra', country: 'Inglaterra', league: 'Seleções' },
  { name: 'França', country: 'França', league: 'Seleções' },
  { name: 'Espanha', country: 'Espanha', league: 'Seleções' },
  { name: 'Portugal', country: 'Portugal', league: 'Seleções' },
  { name: 'Paraguai', country: 'Paraguai', league: 'Seleções' },
  { name: 'Chile', country: 'Chile', league: 'Seleções' },
  { name: 'Colômbia', country: 'Colômbia', league: 'Seleções' },
  { name: 'Peru', country: 'Peru', league: 'Seleções' },
  { name: 'México', country: 'México', league: 'Seleções' },
];

// ============================================================
// Procedural generator
// ============================================================

function pickTeamColors(rng: () => number): { badge: string; accent: string } {
  const badge = randomColor(rng);
  let accent = randomColor(rng);
  let attempts = 0;
  while (accent === badge && attempts < 5) {
    accent = randomColor(rng);
    attempts++;
  }
  return { badge, accent };
}

function generateProceduralTeam(
  rng: () => number,
  usedKeys: Set<string>,
): { team: HistoricalTeamData; players: HistoricalPlayerData[] } | null {
  // Decide team type
  const r = rng();
  let club: ClubSeed;
  if (r < 0.45) {
    club = pick(rng, BRAZILIAN_CLUBS);
  } else if (r < 0.85) {
    club = pick(rng, INTERNATIONAL_CLUBS);
  } else {
    club = pick(rng, NATIONAL_TEAMS);
  }

  const decade = pick(rng, DECADES);
  // Try up to 6 year offsets to avoid collisions
  let year = decade + Math.floor(rng() * 10);
  let attempts = 0;
  while (usedKeys.has(`${club.name}|${year}`) && attempts < 6) {
    year = decade + ((year - decade + 1 + 10) % 10);
    attempts++;
  }
  if (usedKeys.has(`${club.name}|${year}`)) {
    return null; // give up
  }
  usedKeys.add(`${club.name}|${year}`);

  // OVR distribution skewed toward mid
  const ovrRoll = rng();
  const ovr =
    70 + Math.floor(ovrRoll * ovrRoll * 26); // 70-95, skewed toward lower
  const formation = pick(rng, FORMATION_KEYS);
  const colors = pickTeamColors(rng);

  const team: HistoricalTeamData = {
    name: club.name,
    year,
    country: club.country,
    league: club.league,
    ovr,
    formation,
    decade,
    badgeColor: colors.badge,
    accentColor: colors.accent,
    description: `${club.name} de ${year}, elenco histórico da década de ${decade}.`,
  };

  // Build squad
  const players: HistoricalPlayerData[] = [];
  const starters = FORMATIONS[formation];

  // 1-2 star players above team ovr
  const starCount = 1 + Math.floor(rng() * 2);
  const starSlots = new Set<number>();
  for (let s = 0; s < starCount; s++) {
    const idx = Math.floor(rng() * starters.length);
    if (starSlots.has(idx)) continue;
    starSlots.add(idx);
    const overall = clamp(ovr + 4 + Math.floor(rng() * 6), 75, 96);
    const name = randomName(club.country, rng);
    players.push(makePlayer(team, name, starters[idx], overall, club.country, rng));
  }

  // Remaining starters
  for (let i = 0; i < starters.length; i++) {
    if (starSlots.has(i)) continue;
    const overall = clamp(ovr + jitter(rng, 10), 60, 94);
    const name = randomName(club.country, rng);
    players.push(makePlayer(team, name, starters[i], overall, club.country, rng));
  }

  // Reserves (5-7)
  const reserveCount = 5 + Math.floor(rng() * 3);
  for (let r2 = 0; r2 < reserveCount; r2++) {
    const pos = RESERVE_POSITIONS[r2 % RESERVE_POSITIONS.length];
    const overall = clamp(ovr - 5 + jitter(rng, 6), 55, 90);
    const name = randomName(club.country, rng);
    players.push(makePlayer(team, name, pos, overall, club.country, rng));
  }

  return { team, players };
}

// ============================================================
// Brazilian Legends — comprehensive list of REAL famous
// Brazilian footballers spanning all decades 1960-2026.
// ============================================================

interface LegendSeed {
  name: string;
  position: Position;
  overall: number;
  club: string;
  year: number;
  /** Optional hex color. If omitted, a deterministic color is picked. */
  photoColor?: string;
  /** Optional per-stat overrides merged on top of the auto-generated stats. */
  stats?: Partial<PlayerStats>;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function brazilianLegend(seed: LegendSeed): HistoricalPlayerData {
  const decade = Math.floor(seed.year / 10) * 10;
  // Deterministic per-player RNG so stats are stable across runs.
  const h = hashString(`${seed.name}|${seed.year}`);
  const rng = mulberry32(h);
  const baseStats = statsForPosition(seed.position, seed.overall, rng);
  const stats: PlayerStats = seed.stats ? { ...baseStats, ...seed.stats } : baseStats;
  const photoColor = seed.photoColor ?? COLOR_PALETTE[h % COLOR_PALETTE.length];
  return {
    name: seed.name,
    position: seed.position,
    overall: clamp(seed.overall, 50, 99),
    country: 'Brasil',
    club: seed.club,
    year: seed.year,
    decade,
    photoColor,
    stats,
    teamId: null, // free agent — seed script will attach to a team if (club,year) matches
  };
}

const BRAZILIAN_LEGENDS: LegendSeed[] = [
  // ====================== 1960s ======================
  { name: 'Pelé', position: 'Centroavante', overall: 98, club: 'Santos', year: 1965, photoColor: '#fbbf24', stats: { pace: 90, shooting: 96, passing: 92, dribbling: 96, defending: 55, physical: 84 } },
  { name: 'Garrincha', position: 'Ponta Direita', overall: 94, club: 'Botafogo', year: 1962, photoColor: '#1e3a8a', stats: { pace: 94, shooting: 82, passing: 80, dribbling: 97, defending: 50, physical: 70 } },
  { name: 'Nilton Santos', position: 'Lateral Esquerdo', overall: 91, club: 'Botafogo', year: 1962, photoColor: '#000000', stats: { pace: 85, shooting: 65, passing: 84, dribbling: 84, defending: 88, physical: 82 } },
  { name: 'Djalma Santos', position: 'Lateral Direito', overall: 91, club: 'Portuguesa', year: 1962, photoColor: '#16a34a', stats: { pace: 84, shooting: 65, passing: 82, dribbling: 82, defending: 90, physical: 84 } },
  { name: 'Vavá', position: 'Centroavante', overall: 89, club: 'Atlético Madrid', year: 1962, photoColor: '#dc2626', stats: { pace: 84, shooting: 91, passing: 76, dribbling: 82, defending: 50, physical: 86 } },
  { name: 'Amarildo', position: 'Centroavante', overall: 88, club: 'Botafogo', year: 1963, photoColor: '#000000', stats: { pace: 86, shooting: 87, passing: 80, dribbling: 88, defending: 50, physical: 78 } },
  { name: 'Mário Zagallo', position: 'Ponta Esquerda', overall: 88, club: 'Botafogo', year: 1963, photoColor: '#000000', stats: { pace: 84, shooting: 78, passing: 86, dribbling: 84, defending: 70, physical: 74 } },
  { name: 'Didi', position: 'Meia Ofensivo', overall: 93, club: 'Botafogo', year: 1961, photoColor: '#000000', stats: { pace: 78, shooting: 86, passing: 93, dribbling: 90, defending: 62, physical: 78 } },
  { name: 'Gérson', position: 'Meia Ofensivo', overall: 91, club: 'Botafogo', year: 1967, photoColor: '#000000', stats: { pace: 76, shooting: 88, passing: 93, dribbling: 86, defending: 64, physical: 76 } },
  { name: 'Tostão', position: 'Centroavante', overall: 90, club: 'Cruzeiro', year: 1968, photoColor: '#1e3a8a', stats: { pace: 80, shooting: 89, passing: 85, dribbling: 87, defending: 50, physical: 76 } },
  { name: 'Carlos Alberto Torres', position: 'Lateral Direito', overall: 92, club: 'Santos', year: 1968, photoColor: '#ffffff', stats: { pace: 88, shooting: 72, passing: 86, dribbling: 85, defending: 88, physical: 84 } },
  { name: 'Clodoaldo', position: 'Volante', overall: 89, club: 'Santos', year: 1969, photoColor: '#ffffff', stats: { pace: 80, shooting: 74, passing: 88, dribbling: 88, defending: 84, physical: 80 } },
  { name: 'Félix', position: 'Goleiro', overall: 86, club: 'Portuguesa', year: 1965, photoColor: '#16a34a' },
  { name: 'Brito', position: 'Zagueiro', overall: 87, club: 'Vasco da Gama', year: 1968, photoColor: '#000000', stats: { pace: 80, shooting: 50, passing: 70, dribbling: 65, defending: 90, physical: 88 } },
  { name: 'Piazza', position: 'Zagueiro', overall: 88, club: 'Cruzeiro', year: 1966, photoColor: '#1e3a8a', stats: { pace: 82, shooting: 55, passing: 78, dribbling: 72, defending: 90, physical: 86 } },
  { name: 'Jairzinho', position: 'Ponta Direita', overall: 91, club: 'Botafogo', year: 1968, photoColor: '#000000', stats: { pace: 93, shooting: 86, passing: 80, dribbling: 89, defending: 50, physical: 80 } },
  { name: 'Rivellino', position: 'Meia Ofensivo', overall: 92, club: 'Corinthians', year: 1969, photoColor: '#000000', stats: { pace: 82, shooting: 89, passing: 90, dribbling: 94, defending: 60, physical: 78 } },
  { name: 'Paulo César Caju', position: 'Ponta Esquerda', overall: 88, club: 'Botafogo', year: 1968, photoColor: '#000000', stats: { pace: 88, shooting: 80, passing: 84, dribbling: 90, defending: 50, physical: 74 } },
  { name: 'Ado', position: 'Goleiro', overall: 82, club: 'Santos', year: 1969, photoColor: '#ffffff' },
  { name: 'Hércules', position: 'Volante', overall: 80, club: 'Vasco da Gama', year: 1968, photoColor: '#000000' },
  { name: 'Zé Maria', position: 'Lateral Direito', overall: 85, club: 'Portuguesa', year: 1968, photoColor: '#16a34a', stats: { pace: 86, shooting: 70, passing: 80, dribbling: 80, defending: 84, physical: 78 } },
  { name: 'Leônidas da Silva', position: 'Centroavante', overall: 87, club: 'Vasco da Gama', year: 1960, photoColor: '#000000', stats: { pace: 84, shooting: 88, passing: 76, dribbling: 86, defending: 50, physical: 80 } },
  { name: 'Gilmar', position: 'Goleiro', overall: 89, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Manga', position: 'Goleiro', overall: 85, club: 'Internacional', year: 1968, photoColor: '#dc2626' },
  { name: 'Raul Plassmann', position: 'Goleiro', overall: 84, club: 'Flamengo', year: 1969, photoColor: '#dc2626' },
  { name: 'Zito', position: 'Volante', overall: 87, club: 'Santos', year: 1962, photoColor: '#ffffff', stats: { pace: 78, shooting: 72, passing: 86, dribbling: 80, defending: 86, physical: 84 } },
  { name: 'Mengálvio', position: 'Meio Campo', overall: 85, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Dorval', position: 'Ponta Direita', overall: 86, club: 'Santos', year: 1962, photoColor: '#ffffff', stats: { pace: 90, shooting: 78, passing: 80, dribbling: 86, defending: 50, physical: 72 } },
  { name: 'Coutinho', position: 'Atacante', overall: 90, club: 'Santos', year: 1962, photoColor: '#ffffff', stats: { pace: 86, shooting: 90, passing: 80, dribbling: 88, defending: 50, physical: 78 } },
  { name: 'Pepe', position: 'Ponta Esquerda', overall: 88, club: 'Santos', year: 1962, photoColor: '#ffffff', stats: { pace: 88, shooting: 86, passing: 80, dribbling: 85, defending: 55, physical: 74 } },
  { name: 'Jair da Costa', position: 'Ponta Direita', overall: 85, club: 'Internacional', year: 1965, photoColor: '#dc2626', stats: { pace: 90, shooting: 80, passing: 76, dribbling: 84, defending: 50, physical: 72 } },
  { name: 'Dirceu Lopes', position: 'Meia Ofensivo', overall: 89, club: 'Cruzeiro', year: 1968, photoColor: '#1e3a8a', stats: { pace: 82, shooting: 86, passing: 88, dribbling: 90, defending: 60, physical: 78 } },
  { name: 'Procópio', position: 'Volante', overall: 84, club: 'Cruzeiro', year: 1966, photoColor: '#1e3a8a' },
  { name: 'Mauro', position: 'Zagueiro', overall: 85, club: 'Santos', year: 1962, photoColor: '#ffffff', stats: { pace: 80, shooting: 50, passing: 70, dribbling: 65, defending: 88, physical: 85 } },
  { name: 'Everaldo', position: 'Lateral Esquerdo', overall: 85, club: 'Cruzeiro', year: 1969, photoColor: '#1e3a8a', stats: { pace: 86, shooting: 65, passing: 78, dribbling: 80, defending: 84, physical: 78 } },
  { name: 'Alcindo', position: 'Centroavante', overall: 84, club: 'Botafogo', year: 1966, photoColor: '#000000' },
  { name: 'Toninho Guerreiro', position: 'Centroavante', overall: 85, club: 'Santos', year: 1968, photoColor: '#ffffff' },
  { name: 'Edu', position: 'Ponta Direita', overall: 86, club: 'Santos', year: 1966, photoColor: '#ffffff', stats: { pace: 90, shooting: 82, passing: 78, dribbling: 86, defending: 50, physical: 74 } },
  { name: 'Miruca', position: 'Ponta Esquerda', overall: 82, club: 'Santos', year: 1966, photoColor: '#ffffff' },
  { name: 'Ney Simões', position: 'Meio Campo', overall: 82, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Décio Esteves', position: 'Volante', overall: 83, club: 'Botafogo', year: 1961, photoColor: '#000000' },
  { name: 'Zequinha', position: 'Meio Campo', overall: 82, club: 'Botafogo', year: 1961, photoColor: '#000000' },
  { name: 'Servílio', position: 'Centroavante', overall: 82, club: 'Portuguesa', year: 1965, photoColor: '#16a34a' },
  { name: 'Roberto Dias', position: 'Zagueiro', overall: 84, club: 'São Paulo', year: 1965, photoColor: '#dc2626' },
  { name: 'Djalma Dias', position: 'Zagueiro', overall: 83, club: 'Palmeiras', year: 1965, photoColor: '#16a34a' },
  { name: 'Vicente', position: 'Lateral Esquerdo', overall: 83, club: 'Fluminense', year: 1965, photoColor: '#7c2d12' },
  { name: 'Fontana', position: 'Zagueiro', overall: 83, club: 'Vasco da Gama', year: 1963, photoColor: '#000000' },
  { name: 'Altair', position: 'Zagueiro', overall: 83, club: 'Fluminense', year: 1965, photoColor: '#7c2d12' },
  { name: 'Orlando Peçanha', position: 'Zagueiro', overall: 85, club: 'Vasco da Gama', year: 1961, photoColor: '#000000' },
  { name: 'Bellini', position: 'Zagueiro', overall: 85, club: 'Vasco da Gama', year: 1961, photoColor: '#000000' },
  { name: 'Joel Mendes', position: 'Lateral Direito', overall: 82, club: 'Santos', year: 1965, photoColor: '#ffffff' },
  { name: 'Duncan', position: 'Lateral Direito', overall: 81, club: 'Vasco da Gama', year: 1964, photoColor: '#000000' },
  { name: 'Henrique', position: 'Zagueiro', overall: 82, club: 'Fluminense', year: 1966, photoColor: '#7c2d12' },
  { name: 'Leônidas', position: 'Zagueiro', overall: 81, club: 'Santos', year: 1968, photoColor: '#ffffff' },
  { name: 'Haroldo', position: 'Lateral Esquerdo', overall: 81, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Mazarópi', position: 'Goleiro', overall: 83, club: 'Grêmio', year: 1968, photoColor: '#0284c7' },
  { name: 'Zé Luís', position: 'Zagueiro', overall: 82, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Lima', position: 'Meio Campo', overall: 84, club: 'Santos', year: 1962, photoColor: '#ffffff' },
  { name: 'Oriental', position: 'Zagueiro', overall: 81, club: 'Portuguesa', year: 1965, photoColor: '#16a34a' },
  { name: 'Nair', position: 'Meia Ofensivo', overall: 80, club: 'Vasco da Gama', year: 1964, photoColor: '#000000' },

  // ====================== 1970s ======================
  { name: 'Pelé', position: 'Centroavante', overall: 97, club: 'Santos', year: 1970, photoColor: '#fbbf24', stats: { pace: 88, shooting: 96, passing: 92, dribbling: 95, defending: 55, physical: 82 } },
  { name: 'Zico', position: 'Meia Ofensivo', overall: 93, club: 'Flamengo', year: 1979, photoColor: '#dc2626', stats: { pace: 82, shooting: 92, passing: 93, dribbling: 92, defending: 58, physical: 74 } },
  { name: 'Sócrates', position: 'Meia Ofensivo', overall: 90, club: 'Corinthians', year: 1979, photoColor: '#000000', stats: { pace: 76, shooting: 86, passing: 92, dribbling: 86, defending: 64, physical: 82 } },
  { name: 'Falcão', position: 'Volante', overall: 91, club: 'Internacional', year: 1979, photoColor: '#dc2626', stats: { pace: 78, shooting: 82, passing: 90, dribbling: 84, defending: 86, physical: 82 } },
  { name: 'Cerezo', position: 'Volante', overall: 89, club: 'Atlético Mineiro', year: 1979, photoColor: '#000000', stats: { pace: 80, shooting: 80, passing: 88, dribbling: 84, defending: 82, physical: 78 } },
  { name: 'Júnior', position: 'Lateral Esquerdo', overall: 89, club: 'Flamengo', year: 1979, photoColor: '#dc2626', stats: { pace: 86, shooting: 76, passing: 86, dribbling: 86, defending: 84, physical: 78 } },
  { name: 'Reinaldo', position: 'Centroavante', overall: 87, club: 'Atlético Mineiro', year: 1978, photoColor: '#000000', stats: { pace: 88, shooting: 88, passing: 76, dribbling: 86, defending: 50, physical: 80 } },
  { name: 'Roberto Dinamite', position: 'Centroavante', overall: 88, club: 'Vasco da Gama', year: 1978, photoColor: '#000000', stats: { pace: 84, shooting: 90, passing: 76, dribbling: 82, defending: 50, physical: 82 } },
  { name: 'Careca', position: 'Centroavante', overall: 88, club: 'Guarani', year: 1978, photoColor: '#16a34a', stats: { pace: 90, shooting: 89, passing: 76, dribbling: 84, defending: 50, physical: 80 } },
  { name: 'Edinho', position: 'Zagueiro', overall: 86, club: 'Fluminense', year: 1979, photoColor: '#7c2d12' },
  { name: 'Oscar', position: 'Zagueiro', overall: 84, club: 'Atlético Mineiro', year: 1979, photoColor: '#000000' },
  { name: 'Batista', position: 'Volante', overall: 84, club: 'Grêmio', year: 1979, photoColor: '#0284c7' },
  { name: 'Valdir Peres', position: 'Goleiro', overall: 84, club: 'São Paulo', year: 1977, photoColor: '#dc2626' },
  { name: 'Leovegildo Júnior', position: 'Lateral Esquerdo', overall: 86, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Biro-Biro', position: 'Volante', overall: 84, club: 'Corinthians', year: 1979, photoColor: '#000000' },
  { name: 'Paulinho', position: 'Meio Campo', overall: 83, club: 'Corinthians', year: 1979, photoColor: '#000000' },
  { name: 'Mário Sérgio', position: 'Ponta Direita', overall: 86, club: 'Internacional', year: 1979, photoColor: '#dc2626', stats: { pace: 88, shooting: 82, passing: 84, dribbling: 88, defending: 50, physical: 74 } },
  { name: 'Cabralzinho', position: 'Lateral Direito', overall: 82, club: 'Flamengo', year: 1978, photoColor: '#dc2626' },
  { name: 'Wladimir', position: 'Lateral Esquerdo', overall: 84, club: 'Corinthians', year: 1979, photoColor: '#000000' },
  { name: 'Palhinha', position: 'Centroavante', overall: 85, club: 'Corinthians', year: 1979, photoColor: '#000000' },
  { name: 'Nunes', position: 'Centroavante', overall: 86, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Cláudio Adão', position: 'Centroavante', overall: 85, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Robertinho', position: 'Meia Ofensivo', overall: 82, club: 'Botafogo', year: 1978, photoColor: '#000000' },
  { name: 'Jairzinho', position: 'Ponta Direita', overall: 90, club: 'Marseille', year: 1974, photoColor: '#0284c7', stats: { pace: 92, shooting: 84, passing: 80, dribbling: 88, defending: 50, physical: 80 } },
  { name: 'Rivellino', position: 'Meia Ofensivo', overall: 91, club: 'Fluminense', year: 1975, photoColor: '#7c2d12', stats: { pace: 80, shooting: 88, passing: 90, dribbling: 93, defending: 60, physical: 78 } },
  { name: 'Tostão', position: 'Atacante', overall: 88, club: 'Cruzeiro', year: 1971, photoColor: '#1e3a8a' },
  { name: 'Gérson', position: 'Meia Ofensivo', overall: 89, club: 'Fluminense', year: 1972, photoColor: '#7c2d12' },
  { name: 'Carlos Alberto Torres', position: 'Lateral Direito', overall: 90, club: 'Fluminense', year: 1974, photoColor: '#7c2d12' },
  { name: 'Clodoaldo', position: 'Volante', overall: 86, club: 'Santos', year: 1973, photoColor: '#ffffff' },
  { name: 'Paulo César Caju', position: 'Ponta Esquerda', overall: 87, club: 'Flamengo', year: 1972, photoColor: '#dc2626' },
  { name: 'Adó', position: 'Ponta Direita', overall: 82, club: 'Flamengo', year: 1974, photoColor: '#dc2626' },
  { name: 'Dirceu Lopes', position: 'Meia Ofensivo', overall: 88, club: 'Cruzeiro', year: 1971, photoColor: '#1e3a8a' },
  { name: 'Piazza', position: 'Zagueiro', overall: 86, club: 'Cruzeiro', year: 1971, photoColor: '#1e3a8a' },
  { name: 'Edu', position: 'Ponta Direita', overall: 85, club: 'Flamengo', year: 1973, photoColor: '#dc2626' },
  { name: 'Adílio', position: 'Meia Ofensivo', overall: 85, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Andrade', position: 'Volante', overall: 84, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Natal', position: 'Goleiro', overall: 82, club: 'Cruzeiro', year: 1971, photoColor: '#1e3a8a' },
  { name: 'Rinaldo', position: 'Centroavante', overall: 83, club: 'Atlético Mineiro', year: 1978, photoColor: '#000000' },
  { name: 'Dario', position: 'Centroavante', overall: 86, club: 'Internacional', year: 1976, photoColor: '#dc2626', stats: { pace: 86, shooting: 88, passing: 74, dribbling: 82, defending: 50, physical: 82 } },
  { name: 'Figueiredo', position: 'Volante', overall: 83, club: 'Atlético Mineiro', year: 1978, photoColor: '#000000' },
  { name: 'Borges', position: 'Zagueiro', overall: 82, club: 'Internacional', year: 1979, photoColor: '#dc2626' },
  { name: 'Mauro Galvão', position: 'Zagueiro', overall: 86, club: 'Internacional', year: 1979, photoColor: '#dc2626', stats: { pace: 82, shooting: 50, passing: 74, dribbling: 70, defending: 90, physical: 86 } },
  { name: 'Müller', position: 'Atacante', overall: 82, club: 'Operário-MS', year: 1979, photoColor: '#16a34a' },
  { name: 'Tita', position: 'Meia Ofensivo', overall: 85, club: 'Flamengo', year: 1979, photoColor: '#dc2626' },
  { name: 'Adílio', position: 'Meio Campo', overall: 84, club: 'Flamengo', year: 1978, photoColor: '#dc2626' },
  { name: 'Falcão', position: 'Volante', overall: 88, club: 'Internacional', year: 1978, photoColor: '#dc2626' },
  { name: 'Renato', position: 'Zagueiro', overall: 84, club: 'São Paulo', year: 1979, photoColor: '#dc2626' },
  { name: 'Juari', position: 'Ponta Direita', overall: 82, club: 'Internacional', year: 1979, photoColor: '#dc2626' },
  { name: 'Valdir Lima', position: 'Goleiro', overall: 81, club: 'Grêmio', year: 1979, photoColor: '#0284c7' },
  { name: 'Dadá Maravilha', position: 'Centroavante', overall: 86, club: 'Atlético Mineiro', year: 1971, photoColor: '#000000', stats: { pace: 84, shooting: 88, passing: 70, dribbling: 80, defending: 50, physical: 84 } },
  { name: 'Félix', position: 'Goleiro', overall: 84, club: 'Portuguesa', year: 1971, photoColor: '#16a34a' },

  // ====================== 1980s ======================
  { name: 'Zico', position: 'Meia Ofensivo', overall: 94, club: 'Flamengo', year: 1982, photoColor: '#dc2626', stats: { pace: 82, shooting: 93, passing: 95, dribbling: 93, defending: 58, physical: 74 } },
  { name: 'Sócrates', position: 'Meia Ofensivo', overall: 92, club: 'Corinthians', year: 1983, photoColor: '#000000', stats: { pace: 76, shooting: 88, passing: 93, dribbling: 88, defending: 66, physical: 84 } },
  { name: 'Falcão', position: 'Volante', overall: 92, club: 'Roma', year: 1983, photoColor: '#7c2d12', stats: { pace: 78, shooting: 84, passing: 92, dribbling: 86, defending: 88, physical: 84 } },
  { name: 'Cerezo', position: 'Volante', overall: 90, club: 'Roma', year: 1985, photoColor: '#7c2d12', stats: { pace: 80, shooting: 82, passing: 90, dribbling: 86, defending: 84, physical: 80 } },
  { name: 'Júnior', position: 'Lateral Esquerdo', overall: 90, club: 'Flamengo', year: 1982, photoColor: '#dc2626', stats: { pace: 86, shooting: 78, passing: 88, dribbling: 88, defending: 86, physical: 78 } },
  { name: 'Careca', position: 'Centroavante', overall: 90, club: 'Napoli', year: 1988, photoColor: '#0284c7', stats: { pace: 92, shooting: 91, passing: 78, dribbling: 86, defending: 50, physical: 82 } },
  { name: 'Romário', position: 'Centroavante', overall: 92, club: 'PSV', year: 1989, photoColor: '#dc2626', stats: { pace: 90, shooting: 93, passing: 76, dribbling: 95, defending: 45, physical: 76 } },
  { name: 'Bebeto', position: 'Centroavante', overall: 88, club: 'Vasco da Gama', year: 1989, photoColor: '#000000', stats: { pace: 86, shooting: 88, passing: 80, dribbling: 88, defending: 50, physical: 74 } },
  { name: 'Branco', position: 'Lateral Esquerdo', overall: 87, club: 'Bremen', year: 1987, photoColor: '#0284c7', stats: { pace: 82, shooting: 80, passing: 84, dribbling: 82, defending: 84, physical: 82 } },
  { name: 'Mazinho', position: 'Lateral Direito', overall: 85, club: 'Lecce', year: 1989, photoColor: '#0284c7' },
  { name: 'Aldair', position: 'Zagueiro', overall: 88, club: 'Benfica', year: 1989, photoColor: '#dc2626', stats: { pace: 82, shooting: 50, passing: 76, dribbling: 72, defending: 90, physical: 86 } },
  { name: 'Mauro Galvão', position: 'Zagueiro', overall: 88, club: 'Botafogo', year: 1986, photoColor: '#000000', stats: { pace: 82, shooting: 50, passing: 76, dribbling: 72, defending: 92, physical: 86 } },
  { name: 'Ricardo Rocha', position: 'Zagueiro', overall: 87, club: 'São Paulo', year: 1989, photoColor: '#dc2626', stats: { pace: 80, shooting: 50, passing: 74, dribbling: 70, defending: 90, physical: 88 } },
  { name: 'Dunga', position: 'Volante', overall: 87, club: 'Fiorentina', year: 1988, photoColor: '#7c2d12', stats: { pace: 76, shooting: 76, passing: 86, dribbling: 78, defending: 88, physical: 84 } },
  { name: 'Silas', position: 'Meia Ofensivo', overall: 84, club: 'Sporting', year: 1988, photoColor: '#16a34a' },
  { name: 'Taffarel', position: 'Goleiro', overall: 89, club: 'Internacional', year: 1989, photoColor: '#dc2626' },
  { name: 'Acácio', position: 'Goleiro', overall: 84, club: 'Sport Recife', year: 1984, photoColor: '#dc2626' },
  { name: 'Carlos Mozer', position: 'Zagueiro', overall: 87, club: 'Benfica', year: 1988, photoColor: '#dc2626' },
  { name: 'Valdo', position: 'Meio Campo', overall: 85, club: 'Benfica', year: 1989, photoColor: '#dc2626' },
  { name: 'Raí', position: 'Meia Ofensivo', overall: 86, club: 'São Paulo', year: 1989, photoColor: '#dc2626', stats: { pace: 78, shooting: 86, passing: 88, dribbling: 86, defending: 60, physical: 80 } },
  { name: 'Bismarck', position: 'Volante', overall: 84, club: 'Vasco da Gama', year: 1988, photoColor: '#000000' },
  { name: 'Casagrande', position: 'Centroavante', overall: 87, club: 'Porto', year: 1986, photoColor: '#0284c7', stats: { pace: 84, shooting: 88, passing: 78, dribbling: 82, defending: 50, physical: 84 } },
  { name: 'Renato Gaúcho', position: 'Ponta Direita', overall: 87, club: 'Grêmio', year: 1983, photoColor: '#0284c7', stats: { pace: 90, shooting: 82, passing: 82, dribbling: 90, defending: 50, physical: 76 } },
  { name: 'Assis', position: 'Meia Ofensivo', overall: 84, club: 'Vasco da Gama', year: 1988, photoColor: '#000000' },
  { name: 'Mirandinha', position: 'Centroavante', overall: 83, club: 'Corinthians', year: 1984, photoColor: '#000000' },
  { name: 'Müller', position: 'Atacante', overall: 86, club: 'São Paulo', year: 1987, photoColor: '#dc2626', stats: { pace: 88, shooting: 86, passing: 76, dribbling: 84, defending: 50, physical: 78 } },
  { name: 'Careca', position: 'Centroavante', overall: 87, club: 'Guarani', year: 1984, photoColor: '#16a34a' },
  { name: 'Bebeto', position: 'Atacante', overall: 85, club: 'Flamengo', year: 1985, photoColor: '#dc2626' },
  { name: 'Romário', position: 'Centroavante', overall: 88, club: 'Vasco da Gama', year: 1988, photoColor: '#000000' },
  { name: 'Edivaldo', position: 'Meia Ofensivo', overall: 84, club: 'Flamengo', year: 1984, photoColor: '#dc2626' },
  { name: 'Adílio', position: 'Meia Ofensivo', overall: 85, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Nunes', position: 'Centroavante', overall: 85, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Tita', position: 'Meia Ofensivo', overall: 86, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Andrade', position: 'Volante', overall: 86, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Leandro', position: 'Lateral Direito', overall: 86, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Rondinelli', position: 'Zagueiro', overall: 84, club: 'Flamengo', year: 1981, photoColor: '#dc2626' },
  { name: 'Falcão', position: 'Volante', overall: 89, club: 'Roma', year: 1982, photoColor: '#7c2d12' },
  { name: 'Paulo Isidoro', position: 'Meia Ofensivo', overall: 84, club: 'Grêmio', year: 1983, photoColor: '#0284c7' },
  { name: 'Júnior', position: 'Lateral Esquerdo', overall: 88, club: 'Torino', year: 1984, photoColor: '#7c2d12' },
  { name: 'Oscar', position: 'Zagueiro', overall: 84, club: 'Atlético Mineiro', year: 1982, photoColor: '#000000' },
  { name: 'Edinho', position: 'Zagueiro', overall: 85, club: 'Fluminense', year: 1982, photoColor: '#7c2d12' },
  { name: 'Carlos Mozer', position: 'Zagueiro', overall: 85, club: 'Sporting', year: 1983, photoColor: '#16a34a' },
  { name: 'Branco', position: 'Lateral Esquerdo', overall: 85, club: 'Fluminense', year: 1984, photoColor: '#7c2d12' },
  { name: 'Mazinho', position: 'Meio Campo', overall: 84, club: 'Vasco da Gama', year: 1985, photoColor: '#000000' },
  { name: 'Taffarel', position: 'Goleiro', overall: 86, club: 'Brasil', year: 1986, photoColor: '#facc15' },
  { name: 'Acácio', position: 'Goleiro', overall: 84, club: 'Guarani', year: 1985, photoColor: '#16a34a' },
  { name: 'Valdir Peres', position: 'Goleiro', overall: 82, club: 'São Paulo', year: 1982, photoColor: '#dc2626' },
  { name: 'Paulo Sérgio', position: 'Goleiro', overall: 83, club: 'Corinthians', year: 1987, photoColor: '#000000' },
  { name: 'Galvão', position: 'Zagueiro', overall: 84, club: 'Botafogo', year: 1984, photoColor: '#000000' },
  { name: 'Mauro Galvão', position: 'Zagueiro', overall: 87, club: 'Botafogo', year: 1988, photoColor: '#000000' },
  { name: 'Aldair', position: 'Zagueiro', overall: 86, club: 'Rio Branco', year: 1986, photoColor: '#1e3a8a' },
  { name: 'Ricardo Gomes', position: 'Zagueiro', overall: 86, club: 'Benfica', year: 1989, photoColor: '#dc2626' },
  { name: 'Bismarck', position: 'Volante', overall: 84, club: 'Vasco da Gama', year: 1987, photoColor: '#000000' },
  { name: 'Geovani', position: 'Meia Ofensivo', overall: 85, club: 'Vasco da Gama', year: 1987, photoColor: '#000000' },
  { name: 'Dunga', position: 'Volante', overall: 85, club: 'Internacional', year: 1985, photoColor: '#dc2626' },
  { name: 'Silas', position: 'Meia Ofensivo', overall: 85, club: 'São Paulo', year: 1986, photoColor: '#dc2626' },
  { name: 'Boi', position: 'Centroavante', overall: 82, club: 'Vitória', year: 1985, photoColor: '#dc2626' },
  { name: 'Nunes', position: 'Centroavante', overall: 84, club: 'Flamengo', year: 1985, photoColor: '#dc2626' },
  { name: 'Humberto', position: 'Centroavante', overall: 82, club: 'Portuguesa', year: 1983, photoColor: '#16a34a' },
  { name: 'João Paulo', position: 'Lateral Esquerdo', overall: 82, club: 'Corinthians', year: 1984, photoColor: '#000000' },

  // ====================== 1990s ======================
  { name: 'Romário', position: 'Centroavante', overall: 94, club: 'Barcelona', year: 1994, photoColor: '#a50044', stats: { pace: 90, shooting: 94, passing: 78, dribbling: 95, defending: 45, physical: 76 } },
  { name: 'Bebeto', position: 'Centroavante', overall: 89, club: 'Deportivo La Coruña', year: 1993, photoColor: '#0284c7', stats: { pace: 86, shooting: 89, passing: 80, dribbling: 88, defending: 50, physical: 74 } },
  { name: 'Ronaldo Fenômeno', position: 'Centroavante', overall: 96, club: 'Barcelona', year: 1997, photoColor: '#a50044', stats: { pace: 96, shooting: 95, passing: 80, dribbling: 96, defending: 50, physical: 84 } },
  { name: 'Rivaldo', position: 'Meia Ofensivo', overall: 93, club: 'Barcelona', year: 1999, photoColor: '#a50044', stats: { pace: 84, shooting: 91, passing: 90, dribbling: 92, defending: 55, physical: 80 } },
  { name: 'Ronaldinho Gaúcho', position: 'Meia Ofensivo', overall: 91, club: 'Grêmio', year: 1999, photoColor: '#0284c7', stats: { pace: 88, shooting: 86, passing: 88, dribbling: 95, defending: 50, physical: 76 } },
  { name: 'Roberto Carlos', position: 'Lateral Esquerdo', overall: 92, club: 'Real Madrid', year: 1998, photoColor: '#ffffff', stats: { pace: 94, shooting: 82, passing: 84, dribbling: 88, defending: 86, physical: 84 } },
  { name: 'Cafu', position: 'Lateral Direito', overall: 91, club: 'Roma', year: 1998, photoColor: '#7c2d12', stats: { pace: 92, shooting: 70, passing: 84, dribbling: 86, defending: 88, physical: 84 } },
  { name: 'Taffarel', position: 'Goleiro', overall: 89, club: 'Galatasaray', year: 1998, photoColor: '#dc2626' },
  { name: 'Cláudio Taffarel', position: 'Goleiro', overall: 88, club: 'Parma', year: 1995, photoColor: '#0284c7' },
  { name: 'Aldair', position: 'Zagueiro', overall: 89, club: 'Roma', year: 1998, photoColor: '#7c2d12', stats: { pace: 82, shooting: 50, passing: 78, dribbling: 74, defending: 91, physical: 86 } },
  { name: 'Mauro Silva', position: 'Volante', overall: 88, club: 'Deportivo La Coruña', year: 1997, photoColor: '#0284c7', stats: { pace: 78, shooting: 70, passing: 86, dribbling: 80, defending: 90, physical: 86 } },
  { name: 'Leonardo', position: 'Lateral Esquerdo', overall: 88, club: 'Milan', year: 1999, photoColor: '#dc2626', stats: { pace: 86, shooting: 80, passing: 88, dribbling: 88, defending: 76, physical: 76 } },
  { name: 'Branco', position: 'Lateral Esquerdo', overall: 86, club: 'Middlesbrough', year: 1996, photoColor: '#0284c7' },
  { name: 'Mazinho', position: 'Volante', overall: 85, club: 'Valencia', year: 1994, photoColor: '#0284c7' },
  { name: 'Dunga', position: 'Volante', overall: 86, club: 'Júbilo Iwata', year: 1997, photoColor: '#0284c7' },
  { name: 'Raí', position: 'Meia Ofensivo', overall: 89, club: 'PSG', year: 1995, photoColor: '#0284c7', stats: { pace: 78, shooting: 88, passing: 90, dribbling: 88, defending: 60, physical: 80 } },
  { name: 'Edmundo', position: 'Centroavante', overall: 87, club: 'Fiorentina', year: 1998, photoColor: '#7c2d12', stats: { pace: 86, shooting: 88, passing: 78, dribbling: 90, defending: 50, physical: 78 } },
  { name: 'Sávio', position: 'Ponta Esquerda', overall: 85, club: 'Real Madrid', year: 1998, photoColor: '#ffffff' },
  { name: 'Juninho Paulista', position: 'Ponta Direita', overall: 86, club: 'Middlesbrough', year: 1997, photoColor: '#0284c7' },
  { name: 'Donizete', position: 'Volante', overall: 84, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Flávio Conceição', position: 'Volante', overall: 85, club: 'Deportivo La Coruña', year: 1998, photoColor: '#0284c7' },
  { name: 'Doriva', position: 'Volante', overall: 84, club: 'Celta Vigo', year: 1999, photoColor: '#0284c7' },
  { name: 'Djalminha', position: 'Meia Ofensivo', overall: 87, club: 'Deportivo La Coruña', year: 1999, photoColor: '#0284c7', stats: { pace: 80, shooting: 86, passing: 88, dribbling: 90, defending: 50, physical: 74 } },
  { name: 'Alex', position: 'Meia Ofensivo', overall: 85, club: 'Parma', year: 1999, photoColor: '#0284c7' },
  { name: 'Marcelinho Carioca', position: 'Meia Ofensivo', overall: 86, club: 'Corinthians', year: 1998, photoColor: '#000000', stats: { pace: 78, shooting: 88, passing: 86, dribbling: 86, defending: 50, physical: 74 } },
  { name: 'Viola', position: 'Centroavante', overall: 84, club: 'Corinthians', year: 1995, photoColor: '#000000' },
  { name: 'Müller', position: 'Atacante', overall: 84, club: 'Palmeiras', year: 1994, photoColor: '#16a34a' },
  { name: 'Careca', position: 'Centroavante', overall: 85, club: 'Vissel Kobe', year: 1993, photoColor: '#0284c7' },
  { name: 'Ricardo Rocha', position: 'Zagueiro', overall: 85, club: 'Real Valladolid', year: 1994, photoColor: '#0284c7' },
  { name: 'Carlos Germano', position: 'Goleiro', overall: 85, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Rogério Ceni', position: 'Goleiro', overall: 86, club: 'São Paulo', year: 1999, photoColor: '#dc2626' },
  { name: 'Túlio Maravilha', position: 'Centroavante', overall: 84, club: 'Botafogo', year: 1995, photoColor: '#000000' },
  { name: 'Edílson', position: 'Ponta Direita', overall: 85, club: 'Corinthians', year: 1998, photoColor: '#000000' },
  { name: 'França', position: 'Centroavante', overall: 85, club: 'São Paulo', year: 1999, photoColor: '#dc2626' },
  { name: 'Luizão', position: 'Centroavante', overall: 85, club: 'Vasco da Gama', year: 1999, photoColor: '#000000' },
  { name: 'Felipe', position: 'Lateral Esquerdo', overall: 84, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Ramon', position: 'Meia Ofensivo', overall: 83, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Juninho', position: 'Meia Ofensivo', overall: 87, club: 'Lyon', year: 1999, photoColor: '#0284c7', stats: { pace: 76, shooting: 86, passing: 90, dribbling: 86, defending: 56, physical: 74 } },
  { name: 'Dida', position: 'Goleiro', overall: 87, club: 'Milan', year: 1999, photoColor: '#dc2626' },
  { name: 'Marcos', position: 'Goleiro', overall: 86, club: 'Palmeiras', year: 1999, photoColor: '#16a34a' },
  { name: 'Vampeta', position: 'Volante', overall: 83, club: 'Internacional', year: 1999, photoColor: '#dc2626' },
  { name: 'Cafu', position: 'Lateral Direito', overall: 88, club: 'Palmeiras', year: 1994, photoColor: '#16a34a' },
  { name: 'Roberto Carlos', position: 'Lateral Esquerdo', overall: 89, club: 'Inter de Milão', year: 1995, photoColor: '#1e3a8a' },
  { name: 'Ronaldo Fenômeno', position: 'Centroavante', overall: 91, club: 'PSV', year: 1995, photoColor: '#dc2626' },
  { name: 'Rivaldo', position: 'Meia Ofensivo', overall: 88, club: 'Deportivo La Coruña', year: 1996, photoColor: '#0284c7' },
  { name: 'Giovanni', position: 'Meia Ofensivo', overall: 85, club: 'Barcelona', year: 1997, photoColor: '#a50044' },
  { name: 'Denílson', position: 'Ponta Esquerda', overall: 87, club: 'Betis', year: 1998, photoColor: '#16a34a', stats: { pace: 90, shooting: 80, passing: 82, dribbling: 92, defending: 50, physical: 72 } },
  { name: 'Amoroso', position: 'Centroavante', overall: 87, club: 'Udinese', year: 1999, photoColor: '#000000' },
  { name: 'Élber', position: 'Centroavante', overall: 86, club: 'Bayern de Munique', year: 1999, photoColor: '#dc2626' },
  { name: 'Jardel', position: 'Centroavante', overall: 87, club: 'Porto', year: 1998, photoColor: '#0284c7', stats: { pace: 80, shooting: 92, passing: 72, dribbling: 82, defending: 50, physical: 84 } },
  { name: 'Paulo Nunes', position: 'Ponta Direita', overall: 84, club: 'Grêmio', year: 1996, photoColor: '#0284c7' },
  { name: 'Valdo', position: 'Meio Campo', overall: 84, club: 'Nagoya Grampus', year: 1997, photoColor: '#0284c7' },
  { name: 'Beto', position: 'Volante', overall: 82, club: 'Sport Recife', year: 1996, photoColor: '#dc2626' },
  { name: 'Gonçalves', position: 'Zagueiro', overall: 82, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Nelsinho', position: 'Lateral Direito', overall: 82, club: 'São Paulo', year: 1996, photoColor: '#dc2626' },
  { name: 'Zé Maria', position: 'Lateral Direito', overall: 84, club: 'Parma', year: 1997, photoColor: '#0284c7' },
  { name: 'Sylvinho', position: 'Lateral Esquerdo', overall: 83, club: 'Arsenal', year: 1999, photoColor: '#dc2626' },
  { name: 'Euller', position: 'Atacante', overall: 83, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Luizão', position: 'Centroavante', overall: 83, club: 'Atlético Mineiro', year: 1996, photoColor: '#000000' },
  { name: 'Alex Alves', position: 'Centroavante', overall: 83, club: 'Hertha BSC', year: 1999, photoColor: '#dc2626' },
  { name: 'Marques', position: 'Atacante', overall: 82, club: 'Atlético Mineiro', year: 1997, photoColor: '#000000' },
  { name: 'Odvan', position: 'Zagueiro', overall: 82, club: 'Vasco da Gama', year: 1998, photoColor: '#000000' },
  { name: 'Fábio Luciano', position: 'Zagueiro', overall: 82, club: 'Corinthians', year: 1999, photoColor: '#000000' },
  { name: 'Válber', position: 'Zagueiro', overall: 82, club: 'São Paulo', year: 1996, photoColor: '#dc2626' },
  { name: 'Sérgio', position: 'Goleiro', overall: 83, club: 'Corinthians', year: 1998, photoColor: '#000000' },
  { name: 'Giovanni', position: 'Ponta Direita', overall: 84, club: 'Santos', year: 1995, photoColor: '#ffffff' },
  { name: 'Viola', position: 'Centroavante', overall: 82, club: 'Valencia', year: 1996, photoColor: '#0284c7' },

  // ====================== 2000s ======================
  { name: 'Ronaldo Fenômeno', position: 'Centroavante', overall: 95, club: 'Real Madrid', year: 2003, photoColor: '#ffffff', stats: { pace: 92, shooting: 95, passing: 80, dribbling: 94, defending: 50, physical: 84 } },
  { name: 'Rivaldo', position: 'Meia Ofensivo', overall: 91, club: 'Milan', year: 2003, photoColor: '#dc2626', stats: { pace: 82, shooting: 90, passing: 90, dribbling: 91, defending: 55, physical: 80 } },
  { name: 'Ronaldinho Gaúcho', position: 'Meia Ofensivo', overall: 95, club: 'Barcelona', year: 2006, photoColor: '#a50044', stats: { pace: 88, shooting: 90, passing: 92, dribbling: 97, defending: 50, physical: 78 } },
  { name: 'Kaká', position: 'Meia Ofensivo', overall: 93, club: 'Milan', year: 2007, photoColor: '#dc2626', stats: { pace: 90, shooting: 88, passing: 90, dribbling: 92, defending: 55, physical: 80 } },
  { name: 'Roberto Carlos', position: 'Lateral Esquerdo', overall: 91, club: 'Real Madrid', year: 2002, photoColor: '#ffffff', stats: { pace: 92, shooting: 82, passing: 84, dribbling: 88, defending: 86, physical: 84 } },
  { name: 'Cafu', position: 'Lateral Direito', overall: 90, club: 'Milan', year: 2004, photoColor: '#dc2626', stats: { pace: 90, shooting: 70, passing: 84, dribbling: 86, defending: 88, physical: 84 } },
  { name: 'Lúcio', position: 'Zagueiro', overall: 90, club: 'Bayern de Munique', year: 2005, photoColor: '#dc2626', stats: { pace: 84, shooting: 60, passing: 76, dribbling: 74, defending: 91, physical: 88 } },
  { name: 'Juan', position: 'Zagueiro', overall: 87, club: 'Bayer Leverkusen', year: 2005, photoColor: '#dc2626' },
  { name: 'Gilberto Silva', position: 'Volante', overall: 87, club: 'Arsenal', year: 2004, photoColor: '#dc2626' },
  { name: 'Emerson', position: 'Volante', overall: 86, club: 'Juventus', year: 2005, photoColor: '#000000' },
  { name: 'Kleberson', position: 'Volante', overall: 84, club: 'Manchester United', year: 2003, photoColor: '#dc2626' },
  { name: 'Zé Roberto', position: 'Lateral Esquerdo', overall: 86, club: 'Bayern de Munique', year: 2005, photoColor: '#dc2626' },
  { name: 'Juninho Pernambucano', position: 'Meia Ofensivo', overall: 89, club: 'Lyon', year: 2006, photoColor: '#0284c7', stats: { pace: 74, shooting: 90, passing: 90, dribbling: 86, defending: 60, physical: 76 } },
  { name: 'Denílson', position: 'Ponta Esquerda', overall: 85, club: 'Betis', year: 2002, photoColor: '#16a34a' },
  { name: 'Amoroso', position: 'Centroavante', overall: 86, club: 'Borussia Dortmund', year: 2002, photoColor: '#facc15' },
  { name: 'Élber', position: 'Centroavante', overall: 86, club: 'Bayern de Munique', year: 2002, photoColor: '#dc2626' },
  { name: 'Jardel', position: 'Centroavante', overall: 86, club: 'Sporting', year: 2002, photoColor: '#16a34a' },
  { name: 'Romário', position: 'Centroavante', overall: 88, club: 'Vasco da Gama', year: 2000, photoColor: '#000000' },
  { name: 'Edmundo', position: 'Centroavante', overall: 85, club: 'Vasco da Gama', year: 2000, photoColor: '#000000' },
  { name: 'Alex', position: 'Meia Ofensivo', overall: 86, club: 'Fenerbahçe', year: 2006, photoColor: '#0284c7' },
  { name: 'Emerson Ferreira', position: 'Volante', overall: 85, club: 'Roma', year: 2003, photoColor: '#7c2d12' },
  { name: 'Edmílson', position: 'Zagueiro', overall: 85, club: 'Barcelona', year: 2005, photoColor: '#a50044' },
  { name: 'Belletti', position: 'Lateral Direito', overall: 84, club: 'Barcelona', year: 2006, photoColor: '#a50044' },
  { name: 'Maicon', position: 'Lateral Direito', overall: 88, club: 'Inter de Milão', year: 2008, photoColor: '#1e3a8a', stats: { pace: 90, shooting: 75, passing: 82, dribbling: 84, defending: 86, physical: 84 } },
  { name: 'Daniel Alves', position: 'Lateral Direito', overall: 89, club: 'Barcelona', year: 2009, photoColor: '#a50044', stats: { pace: 90, shooting: 72, passing: 86, dribbling: 88, defending: 82, physical: 78 } },
  { name: 'Roque Júnior', position: 'Zagueiro', overall: 83, club: 'AC Milan', year: 2002, photoColor: '#dc2626' },
  { name: 'Cris', position: 'Zagueiro', overall: 85, club: 'Lyon', year: 2006, photoColor: '#0284c7' },
  { name: 'Luisão', position: 'Zagueiro', overall: 86, club: 'Benfica', year: 2007, photoColor: '#dc2626' },
  { name: 'Adriano', position: 'Centroavante', overall: 90, club: 'Inter de Milão', year: 2005, photoColor: '#1e3a8a', stats: { pace: 86, shooting: 92, passing: 76, dribbling: 86, defending: 50, physical: 88 } },
  { name: 'Fred', position: 'Centroavante', overall: 85, club: 'Lyon', year: 2006, photoColor: '#0284c7' },
  { name: 'Luis Fabiano', position: 'Centroavante', overall: 87, club: 'Sevilla', year: 2009, photoColor: '#ffffff' },
  { name: 'Vágner Love', position: 'Centroavante', overall: 85, club: 'CSKA Moscou', year: 2008, photoColor: '#dc2626' },
  { name: 'Diego', position: 'Meia Ofensivo', overall: 86, club: 'Werder Bremen', year: 2008, photoColor: '#0284c7' },
  { name: 'Robinho', position: 'Ponta Direita', overall: 87, club: 'Real Madrid', year: 2007, photoColor: '#ffffff', stats: { pace: 90, shooting: 80, passing: 82, dribbling: 92, defending: 50, physical: 70 } },
  { name: 'Nilmar', position: 'Centroavante', overall: 84, club: 'Villarreal', year: 2009, photoColor: '#facc15' },
  { name: 'Jô', position: 'Centroavante', overall: 83, club: 'Manchester City', year: 2008, photoColor: '#0284c7' },
  { name: 'Julio Baptista', position: 'Meia Ofensivo', overall: 85, club: 'Real Madrid', year: 2007, photoColor: '#ffffff' },
  { name: 'Mineiro', position: 'Volante', overall: 82, club: 'Chelsea', year: 2008, photoColor: '#0284c7' },
  { name: 'Josué', position: 'Volante', overall: 83, club: 'Wolfsburg', year: 2009, photoColor: '#16a34a' },
  { name: 'Gilberto', position: 'Lateral Esquerdo', overall: 83, club: 'Tottenham', year: 2008, photoColor: '#ffffff' },
  { name: 'Ronaldo Guiaro', position: 'Zagueiro', overall: 81, club: 'Benfica', year: 2004, photoColor: '#dc2626' },
  { name: 'Marcos', position: 'Goleiro', overall: 87, club: 'Palmeiras', year: 2002, photoColor: '#16a34a' },
  { name: 'Dida', position: 'Goleiro', overall: 89, club: 'Milan', year: 2003, photoColor: '#dc2626' },
  { name: 'Rogério Ceni', position: 'Goleiro', overall: 88, club: 'São Paulo', year: 2005, photoColor: '#dc2626' },
  { name: 'Júlio César', position: 'Goleiro', overall: 88, club: 'Inter de Milão', year: 2009, photoColor: '#1e3a8a' },
  { name: 'Heurelho Gomes', position: 'Goleiro', overall: 84, club: 'Tottenham', year: 2008, photoColor: '#ffffff' },
  { name: 'Doni', position: 'Goleiro', overall: 83, club: 'Roma', year: 2008, photoColor: '#7c2d12' },
  { name: 'Alex Silva', position: 'Zagueiro', overall: 83, club: 'Hamburgo', year: 2008, photoColor: '#0284c7' },
  { name: 'Alex', position: 'Zagueiro', overall: 84, club: 'Santos', year: 2002, photoColor: '#ffffff' },
  { name: 'Dante', position: 'Zagueiro', overall: 83, club: 'Borussia Mönchengladbach', year: 2009, photoColor: '#000000' },
  { name: 'David Luiz', position: 'Zagueiro', overall: 84, club: 'Benfica', year: 2009, photoColor: '#dc2626' },
  { name: 'Thiago Silva', position: 'Zagueiro', overall: 85, club: 'Milan', year: 2009, photoColor: '#dc2626' },
  { name: 'Marcelo', position: 'Lateral Esquerdo', overall: 85, club: 'Real Madrid', year: 2009, photoColor: '#ffffff' },
  { name: 'André Santos', position: 'Lateral Esquerdo', overall: 82, club: 'Fenerbahçe', year: 2009, photoColor: '#0284c7' },
  { name: 'Ramires', position: 'Meio Campo', overall: 84, club: 'Benfica', year: 2009, photoColor: '#dc2626' },
  { name: 'Sandro', position: 'Volante', overall: 83, club: 'Tottenham', year: 2009, photoColor: '#ffffff' },
  { name: 'Elias', position: 'Volante', overall: 83, club: 'Corinthians', year: 2009, photoColor: '#000000' },
  { name: 'Hernanes', position: 'Meia Ofensivo', overall: 85, club: 'São Paulo', year: 2009, photoColor: '#dc2626' },
  { name: 'Ganso', position: 'Meia Ofensivo', overall: 86, club: 'Santos', year: 2009, photoColor: '#ffffff', stats: { pace: 76, shooting: 84, passing: 90, dribbling: 88, defending: 56, physical: 76 } },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 84, club: 'Santos', year: 2009, photoColor: '#ffffff' },
  { name: 'Pato', position: 'Centroavante', overall: 87, club: 'Milan', year: 2009, photoColor: '#dc2626' },
  { name: 'Hulk', position: 'Centroavante', overall: 84, club: 'Porto', year: 2009, photoColor: '#0284c7' },
  { name: 'Diego Tardelli', position: 'Atacante', overall: 83, club: 'Atlético Mineiro', year: 2009, photoColor: '#000000' },
  { name: 'Nilmar', position: 'Atacante', overall: 84, club: 'Internacional', year: 2007, photoColor: '#dc2626' },
  { name: 'Tardelli', position: 'Centroavante', overall: 83, club: 'PSV', year: 2007, photoColor: '#dc2626' },
  { name: 'Lúcio', position: 'Zagueiro', overall: 89, club: 'Inter de Milão', year: 2009, photoColor: '#1e3a8a' },
  { name: 'Maicon', position: 'Lateral Direito', overall: 88, club: 'Inter de Milão', year: 2006, photoColor: '#1e3a8a' },
  { name: 'Bastos', position: 'Lateral Esquerdo', overall: 84, club: 'Lyon', year: 2006, photoColor: '#0284c7' },
  { name: 'Adriano', position: 'Centroavante', overall: 86, club: 'Parma', year: 2002, photoColor: '#7c2d12' },
  { name: 'Mancini', position: 'Ponta Direita', overall: 84, club: 'Roma', year: 2005, photoColor: '#7c2d12' },
  { name: 'Ricardinho', position: 'Meia Ofensivo', overall: 84, club: 'Middlesbrough', year: 2004, photoColor: '#0284c7' },
  { name: 'Fábio Simplício', position: 'Meio Campo', overall: 83, club: 'Parma', year: 2005, photoColor: '#7c2d12' },
  { name: 'Rafael Sobis', position: 'Atacante', overall: 83, club: 'Betis', year: 2006, photoColor: '#16a34a' },
  { name: 'Ilsinho', position: 'Lateral Direito', overall: 83, club: 'Shakhtar Donetsk', year: 2008, photoColor: '#dc2626' },
  { name: 'Alex Mineiro', position: 'Centroavante', overall: 82, club: 'Palmeiras', year: 2008, photoColor: '#16a34a' },
  { name: 'Wesley', position: 'Volante', overall: 82, club: 'Werder Bremen', year: 2008, photoColor: '#0284c7' },
  { name: 'Borges', position: 'Centroavante', overall: 82, club: 'Santos', year: 2008, photoColor: '#ffffff' },
  { name: 'Welliton', position: 'Centroavante', overall: 83, club: 'Spartak Moscou', year: 2009, photoColor: '#dc2626' },

  // ====================== 2010s ======================
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 92, club: 'Barcelona', year: 2015, photoColor: '#a50044', stats: { pace: 92, shooting: 86, passing: 86, dribbling: 96, defending: 40, physical: 68 } },
  { name: 'David Luiz', position: 'Zagueiro', overall: 86, club: 'Chelsea', year: 2014, photoColor: '#0284c7' },
  { name: 'Thiago Silva', position: 'Zagueiro', overall: 90, club: 'PSG', year: 2015, photoColor: '#0284c7', stats: { pace: 80, shooting: 50, passing: 78, dribbling: 74, defending: 92, physical: 88 } },
  { name: 'Dani Alves', position: 'Lateral Direito', overall: 90, club: 'Barcelona', year: 2013, photoColor: '#a50044', stats: { pace: 88, shooting: 72, passing: 86, dribbling: 88, defending: 82, physical: 78 } },
  { name: 'Marcelo', position: 'Lateral Esquerdo', overall: 90, club: 'Real Madrid', year: 2016, photoColor: '#ffffff', stats: { pace: 88, shooting: 72, passing: 86, dribbling: 92, defending: 80, physical: 80 } },
  { name: 'Fernandinho', position: 'Volante', overall: 87, club: 'Manchester City', year: 2016, photoColor: '#0284c7' },
  { name: 'Casemiro', position: 'Volante', overall: 88, club: 'Real Madrid', year: 2018, photoColor: '#ffffff', stats: { pace: 76, shooting: 76, passing: 84, dribbling: 78, defending: 90, physical: 88 } },
  { name: 'Paulinho', position: 'Volante', overall: 85, club: 'Guangzhou Evergrande', year: 2016, photoColor: '#dc2626' },
  { name: 'Philippe Coutinho', position: 'Meia Ofensivo', overall: 88, club: 'Liverpool', year: 2017, photoColor: '#dc2626', stats: { pace: 80, shooting: 86, passing: 88, dribbling: 90, defending: 50, physical: 72 } },
  { name: 'Willian', position: 'Ponta Direita', overall: 86, club: 'Chelsea', year: 2016, photoColor: '#0284c7' },
  { name: 'Oscar', position: 'Meia Ofensivo', overall: 86, club: 'Shanghai SIPG', year: 2017, photoColor: '#dc2626' },
  { name: 'Hulk', position: 'Centroavante', overall: 87, club: 'Shanghai SIPG', year: 2017, photoColor: '#dc2626', stats: { pace: 84, shooting: 88, passing: 78, dribbling: 86, defending: 50, physical: 90 } },
  { name: 'Fred', position: 'Centroavante', overall: 84, club: 'Fluminense', year: 2014, photoColor: '#7c2d12' },
  { name: 'Diego Costa', position: 'Centroavante', overall: 87, club: 'Atlético de Madrid', year: 2014, photoColor: '#dc2626', stats: { pace: 80, shooting: 90, passing: 76, dribbling: 82, defending: 50, physical: 90 } },
  { name: 'Jo', position: 'Centroavante', overall: 82, club: 'Atlético Mineiro', year: 2014, photoColor: '#000000' },
  { name: 'Bernard', position: 'Ponta Direita', overall: 83, club: 'Shakhtar Donetsk', year: 2015, photoColor: '#dc2626' },
  { name: 'Lucas Leiva', position: 'Volante', overall: 84, club: 'Liverpool', year: 2012, photoColor: '#dc2626' },
  { name: 'Lucas Moura', position: 'Ponta Direita', overall: 85, club: 'PSG', year: 2015, photoColor: '#0284c7' },
  { name: 'Sandro', position: 'Volante', overall: 84, club: 'Tottenham', year: 2013, photoColor: '#ffffff' },
  { name: 'Ramires', position: 'Volante', overall: 85, club: 'Chelsea', year: 2013, photoColor: '#0284c7' },
  { name: 'Elias', position: 'Volante', overall: 84, club: 'Sport Recife', year: 2016, photoColor: '#dc2626' },
  { name: 'Jadson', position: 'Meia Ofensivo', overall: 84, club: 'São Paulo', year: 2015, photoColor: '#dc2626' },
  { name: 'Ganso', position: 'Meia Ofensivo', overall: 85, club: 'São Paulo', year: 2013, photoColor: '#dc2626' },
  { name: 'Leandro Damião', position: 'Centroavante', overall: 84, club: 'Internacional', year: 2012, photoColor: '#dc2626' },
  { name: 'Danilo', position: 'Lateral Direito', overall: 84, club: 'Real Madrid', year: 2016, photoColor: '#ffffff' },
  { name: 'Marquinhos', position: 'Zagueiro', overall: 88, club: 'PSG', year: 2018, photoColor: '#0284c7', stats: { pace: 84, shooting: 50, passing: 78, dribbling: 74, defending: 90, physical: 84 } },
  { name: 'Filipe Luís', position: 'Lateral Esquerdo', overall: 87, club: 'Atlético de Madrid', year: 2015, photoColor: '#dc2626' },
  { name: 'Miranda', position: 'Zagueiro', overall: 87, club: 'Inter de Milão', year: 2014, photoColor: '#1e3a8a' },
  { name: 'Dante', position: 'Zagueiro', overall: 85, club: 'Bayern de Munique', year: 2013, photoColor: '#dc2626' },
  { name: 'Maxwell', position: 'Lateral Esquerdo', overall: 85, club: 'PSG', year: 2014, photoColor: '#0284c7' },
  { name: 'Maicon', position: 'Lateral Direito', overall: 85, club: 'Roma', year: 2013, photoColor: '#7c2d12' },
  { name: 'Alex Sandro', position: 'Lateral Esquerdo', overall: 86, club: 'Juventus', year: 2018, photoColor: '#000000' },
  { name: 'Fabinho', position: 'Volante', overall: 87, club: 'Liverpool', year: 2019, photoColor: '#dc2626' },
  { name: 'Luiz Gustavo', position: 'Volante', overall: 85, club: 'Wolfsburg', year: 2014, photoColor: '#16a34a' },
  { name: 'Renato Augusto', position: 'Meio Campo', overall: 85, club: 'Beijing Guoan', year: 2017, photoColor: '#dc2626' },
  { name: 'Roberto Firmino', position: 'Centroavante', overall: 88, club: 'Liverpool', year: 2018, photoColor: '#dc2626', stats: { pace: 82, shooting: 86, passing: 84, dribbling: 88, defending: 50, physical: 82 } },
  { name: 'Gabriel Jesus', position: 'Centroavante', overall: 86, club: 'Manchester City', year: 2019, photoColor: '#0284c7' },
  { name: 'Diego Tardelli', position: 'Atacante', overall: 83, club: 'Shandong Luneng', year: 2016, photoColor: '#dc2626' },
  { name: 'Jonas', position: 'Centroavante', overall: 85, club: 'Benfica', year: 2015, photoColor: '#dc2626' },
  { name: 'Douglas Costa', position: 'Ponta Direita', overall: 87, club: 'Bayern de Munique', year: 2017, photoColor: '#dc2626', stats: { pace: 92, shooting: 80, passing: 84, dribbling: 90, defending: 50, physical: 72 } },
  { name: 'Taison', position: 'Ponta Esquerda', overall: 84, club: 'Shakhtar Donetsk', year: 2018, photoColor: '#dc2626' },
  { name: 'Allan', position: 'Volante', overall: 84, club: 'Napoli', year: 2019, photoColor: '#0284c7' },
  { name: 'Arthur', position: 'Meio Campo', overall: 85, club: 'Barcelona', year: 2019, photoColor: '#a50044' },
  { name: 'Richarlison', position: 'Ponta Esquerda', overall: 84, club: 'Everton', year: 2019, photoColor: '#0284c7' },
  { name: 'Everton Ribeiro', position: 'Meia Ofensivo', overall: 84, club: 'Al-Ahli', year: 2017, photoColor: '#dc2626' },
  { name: 'Éder Militão', position: 'Zagueiro', overall: 85, club: 'Real Madrid', year: 2019, photoColor: '#ffffff' },
  { name: 'Eder', position: 'Centroavante', overall: 82, club: 'Lokomotiv Moscou', year: 2018, photoColor: '#dc2626' },
  { name: 'Firmino', position: 'Atacante', overall: 86, club: 'Hoffenheim', year: 2014, photoColor: '#0284c7' },
  { name: 'Philippe Coutinho', position: 'Meia Ofensivo', overall: 84, club: 'Inter de Milão', year: 2012, photoColor: '#1e3a8a' },
  { name: 'Coutinho', position: 'Ponta Esquerda', overall: 84, club: 'Espanyol', year: 2013, photoColor: '#0284c7' },
  { name: 'Casemiro', position: 'Volante', overall: 84, club: 'Porto', year: 2014, photoColor: '#0284c7' },
  { name: 'Marquinhos', position: 'Zagueiro', overall: 85, club: 'Roma', year: 2013, photoColor: '#7c2d12' },
  { name: 'Adriano', position: 'Centroavante', overall: 84, club: 'Corinthians', year: 2011, photoColor: '#000000' },
  { name: 'Ronaldinho Gaúcho', position: 'Meia Ofensivo', overall: 86, club: 'Atlético Mineiro', year: 2012, photoColor: '#000000' },
  { name: 'Alex', position: 'Meia Ofensivo', overall: 84, club: 'Corinthians', year: 2011, photoColor: '#000000' },
  { name: 'Liedson', position: 'Centroavante', overall: 83, club: 'Sporting', year: 2010, photoColor: '#16a34a' },
  { name: 'Wesley', position: 'Volante', overall: 82, club: 'Werder Bremen', year: 2010, photoColor: '#0284c7' },
  { name: 'Kaká', position: 'Meia Ofensivo', overall: 87, club: 'Real Madrid', year: 2010, photoColor: '#ffffff' },
  { name: 'Luis Fabiano', position: 'Centroavante', overall: 86, club: 'Sevilla', year: 2010, photoColor: '#ffffff' },
  { name: 'Júlio César', position: 'Goleiro', overall: 87, club: 'Inter de Milão', year: 2010, photoColor: '#1e3a8a' },
  { name: 'Doni', position: 'Goleiro', overall: 82, club: 'Liverpool', year: 2011, photoColor: '#dc2626' },
  { name: 'Diego Alves', position: 'Goleiro', overall: 84, club: 'Valencia', year: 2014, photoColor: '#0284c7' },
  { name: 'Jefferson', position: 'Goleiro', overall: 83, club: 'Botafogo', year: 2014, photoColor: '#000000' },
  { name: 'Cássio', position: 'Goleiro', overall: 84, club: 'Corinthians', year: 2015, photoColor: '#000000' },
  { name: 'Weverton', position: 'Goleiro', overall: 83, club: 'Atlético Paranaense', year: 2017, photoColor: '#dc2626' },
  { name: 'Ederson', position: 'Goleiro', overall: 87, club: 'Manchester City', year: 2019, photoColor: '#0284c7' },
  { name: 'Alisson', position: 'Goleiro', overall: 89, club: 'Liverpool', year: 2019, photoColor: '#dc2626' },
  { name: 'Rafinha', position: 'Lateral Direito', overall: 83, club: 'Bayern de Munique', year: 2015, photoColor: '#dc2626' },
  { name: 'Danilo', position: 'Lateral Direito', overall: 83, club: 'Santos', year: 2014, photoColor: '#ffffff' },
  { name: 'Filipe Luís', position: 'Lateral Esquerdo', overall: 86, club: 'Chelsea', year: 2014, photoColor: '#0284c7' },
  { name: 'Marcelo', position: 'Lateral Esquerdo', overall: 87, club: 'Real Madrid', year: 2012, photoColor: '#ffffff' },
  { name: 'David Luiz', position: 'Zagueiro', overall: 87, club: 'PSG', year: 2014, photoColor: '#0284c7' },
  { name: 'Dante', position: 'Zagueiro', overall: 84, club: 'Wolfsburg', year: 2015, photoColor: '#16a34a' },
  { name: 'Miranda', position: 'Zagueiro', overall: 85, club: 'São Paulo', year: 2012, photoColor: '#dc2626' },
  { name: 'Thiago Silva', position: 'Zagueiro', overall: 88, club: 'Milan', year: 2011, photoColor: '#dc2626' },
  { name: 'Luisão', position: 'Zagueiro', overall: 85, club: 'Benfica', year: 2012, photoColor: '#dc2626' },
  { name: 'Dedé', position: 'Zagueiro', overall: 83, club: 'Cruzeiro', year: 2014, photoColor: '#1e3a8a' },
  { name: 'Réver', position: 'Zagueiro', overall: 83, club: 'Atlético Mineiro', year: 2014, photoColor: '#000000' },
  { name: 'Paulo Miranda', position: 'Zagueiro', overall: 82, club: 'São Paulo', year: 2014, photoColor: '#dc2626' },
  { name: 'Gil', position: 'Zagueiro', overall: 83, club: 'Shandong Luneng', year: 2016, photoColor: '#dc2626' },
  { name: 'Jemerson', position: 'Zagueiro', overall: 83, club: 'Monaco', year: 2017, photoColor: '#0284c7' },
  { name: 'Pedro Geromel', position: 'Zagueiro', overall: 83, club: 'Grêmio', year: 2017, photoColor: '#0284c7' },
  { name: 'Fernandinho', position: 'Volante', overall: 85, club: 'Shakhtar Donetsk', year: 2012, photoColor: '#dc2626' },
  { name: 'Fabinho', position: 'Lateral Direito', overall: 84, club: 'Monaco', year: 2016, photoColor: '#0284c7' },
  { name: 'Casemiro', position: 'Volante', overall: 86, club: 'Real Madrid', year: 2016, photoColor: '#ffffff' },
  { name: 'Elias', position: 'Volante', overall: 84, club: 'Atlético de Madrid', year: 2014, photoColor: '#dc2626' },
  { name: 'Fred', position: 'Centroavante', overall: 84, club: 'Fluminense', year: 2012, photoColor: '#7c2d12' },
  { name: 'Hulk', position: 'Ponta Direita', overall: 86, club: 'Porto', year: 2012, photoColor: '#0284c7' },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 89, club: 'Santos', year: 2012, photoColor: '#ffffff' },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 91, club: 'Barcelona', year: 2014, photoColor: '#a50044' },
  { name: 'Gabriel Jesus', position: 'Centroavante', overall: 84, club: 'Palmeiras', year: 2016, photoColor: '#16a34a' },
  { name: 'Gabriel Barbosa', position: 'Centroavante', overall: 83, club: 'Santos', year: 2016, photoColor: '#ffffff' },
  { name: 'Diego Souza', position: 'Meia Ofensivo', overall: 83, club: 'Grêmio', year: 2017, photoColor: '#0284c7' },
  { name: 'Lucas Lima', position: 'Meio Campo', overall: 83, club: 'Santos', year: 2016, photoColor: '#ffffff' },
  { name: 'Giuliano', position: 'Meia Ofensivo', overall: 83, club: 'Fenerbahçe', year: 2017, photoColor: '#0284c7' },
  { name: 'Rodrigo Dourado', position: 'Volante', overall: 82, club: 'Internacional', year: 2017, photoColor: '#dc2626' },

  // ====================== 2020s (incl. 2026) ======================
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 90, club: 'PSG', year: 2020, photoColor: '#0284c7', stats: { pace: 88, shooting: 84, passing: 86, dribbling: 95, defending: 40, physical: 66 } },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 87, club: 'Al-Hilal', year: 2023, photoColor: '#0284c7' },
  { name: 'Vinícius Júnior', position: 'Ponta Esquerda', overall: 90, club: 'Real Madrid', year: 2024, photoColor: '#ffffff', stats: { pace: 95, shooting: 84, passing: 82, dribbling: 92, defending: 40, physical: 72 } },
  { name: 'Rodrygo', position: 'Ponta Direita', overall: 87, club: 'Real Madrid', year: 2024, photoColor: '#ffffff', stats: { pace: 90, shooting: 82, passing: 82, dribbling: 88, defending: 45, physical: 70 } },
  { name: 'Gabriel Jesus', position: 'Centroavante', overall: 86, club: 'Arsenal', year: 2023, photoColor: '#dc2626' },
  { name: 'Richarlison', position: 'Centroavante', overall: 85, club: 'Tottenham', year: 2023, photoColor: '#ffffff' },
  { name: 'Antony', position: 'Ponta Direita', overall: 84, club: 'Manchester United', year: 2023, photoColor: '#dc2626' },
  { name: 'Raphinha', position: 'Ponta Esquerda', overall: 86, club: 'Barcelona', year: 2024, photoColor: '#a50044', stats: { pace: 88, shooting: 84, passing: 84, dribbling: 86, defending: 50, physical: 72 } },
  { name: 'Bruno Guimarães', position: 'Meio Campo', overall: 87, club: 'Newcastle', year: 2024, photoColor: '#000000' },
  { name: 'Casemiro', position: 'Volante', overall: 87, club: 'Manchester United', year: 2023, photoColor: '#dc2626' },
  { name: 'Fabinho', position: 'Volante', overall: 86, club: 'Al-Ittihad', year: 2024, photoColor: '#facc15' },
  { name: 'Lucas Paquetá', position: 'Meia Ofensivo', overall: 86, club: 'West Ham', year: 2024, photoColor: '#7c2d12' },
  { name: 'Fred', position: 'Meio Campo', overall: 84, club: 'Galatasaray', year: 2024, photoColor: '#dc2626' },
  { name: 'Éder Militão', position: 'Zagueiro', overall: 86, club: 'Real Madrid', year: 2024, photoColor: '#ffffff' },
  { name: 'Marquinhos', position: 'Zagueiro', overall: 89, club: 'PSG', year: 2024, photoColor: '#0284c7' },
  { name: 'Thiago Silva', position: 'Zagueiro', overall: 86, club: 'Chelsea', year: 2022, photoColor: '#0284c7' },
  { name: 'Thiago Silva', position: 'Zagueiro', overall: 84, club: 'Fluminense', year: 2024, photoColor: '#7c2d12' },
  { name: 'Gabriel Magalhães', position: 'Zagueiro', overall: 86, club: 'Arsenal', year: 2024, photoColor: '#dc2626' },
  { name: 'Bremer', position: 'Zagueiro', overall: 85, club: 'Juventus', year: 2024, photoColor: '#000000' },
  { name: 'Danilo', position: 'Lateral Direito', overall: 84, club: 'Juventus', year: 2024, photoColor: '#000000' },
  { name: 'Alex Sandro', position: 'Lateral Esquerdo', overall: 84, club: 'Juventus', year: 2022, photoColor: '#000000' },
  { name: 'Alex Telles', position: 'Lateral Esquerdo', overall: 83, club: 'Sevilla', year: 2023, photoColor: '#ffffff' },
  { name: 'Emerson Royal', position: 'Lateral Direito', overall: 83, club: 'Tottenham', year: 2023, photoColor: '#ffffff' },
  { name: 'Dani Alves', position: 'Lateral Direito', overall: 82, club: 'Barcelona', year: 2022, photoColor: '#a50044' },
  { name: 'Weverton', position: 'Goleiro', overall: 84, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Alisson', position: 'Goleiro', overall: 90, club: 'Liverpool', year: 2024, photoColor: '#dc2626' },
  { name: 'Ederson', position: 'Goleiro', overall: 88, club: 'Manchester City', year: 2024, photoColor: '#0284c7' },
  { name: 'Bento', position: 'Goleiro', overall: 83, club: 'Athletico Paranaense', year: 2024, photoColor: '#dc2626' },
  { name: 'João Pedro', position: 'Centroavante', overall: 84, club: 'Brighton', year: 2024, photoColor: '#0284c7' },
  { name: 'Matheus Cunha', position: 'Centroavante', overall: 84, club: 'Wolves', year: 2024, photoColor: '#facc15' },
  { name: 'Endrick', position: 'Centroavante', overall: 84, club: 'Real Madrid', year: 2024, photoColor: '#ffffff' },
  { name: 'Estêvão', position: 'Ponta Direita', overall: 84, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Vitor Roque', position: 'Centroavante', overall: 83, club: 'Barcelona', year: 2024, photoColor: '#a50044' },
  { name: 'Gabriel Martinelli', position: 'Ponta Esquerda', overall: 85, club: 'Arsenal', year: 2024, photoColor: '#dc2626' },
  { name: 'Andreas Pereira', position: 'Meia Ofensivo', overall: 83, club: 'Fulham', year: 2024, photoColor: '#000000' },
  { name: 'Joelinton', position: 'Meio Campo', overall: 84, club: 'Newcastle', year: 2024, photoColor: '#000000' },
  { name: 'André', position: 'Volante', overall: 84, club: 'Wolves', year: 2024, photoColor: '#facc15' },
  { name: 'Douglas Luiz', position: 'Volante', overall: 84, club: 'Juventus', year: 2024, photoColor: '#000000' },
  { name: 'Danilo', position: 'Volante', overall: 83, club: 'Nottingham Forest', year: 2024, photoColor: '#dc2626' },
  { name: 'Bruno Guimarães', position: 'Meio Campo', overall: 86, club: 'Newcastle', year: 2022, photoColor: '#000000' },
  { name: 'Casemiro', position: 'Volante', overall: 88, club: 'Manchester United', year: 2022, photoColor: '#dc2626' },
  { name: 'Casemiro', position: 'Volante', overall: 86, club: 'Manchester United', year: 2026, photoColor: '#dc2626' },
  { name: 'Vinícius Júnior', position: 'Ponta Esquerda', overall: 92, club: 'Real Madrid', year: 2026, photoColor: '#ffffff', stats: { pace: 96, shooting: 86, passing: 84, dribbling: 93, defending: 42, physical: 74 } },
  { name: 'Rodrygo', position: 'Ponta Direita', overall: 88, club: 'Real Madrid', year: 2026, photoColor: '#ffffff' },
  { name: 'Endrick', position: 'Centroavante', overall: 87, club: 'Real Madrid', year: 2026, photoColor: '#ffffff' },
  { name: 'Estêvão', position: 'Ponta Direita', overall: 87, club: 'Chelsea', year: 2026, photoColor: '#0284c7' },
  { name: 'Vitor Roque', position: 'Centroavante', overall: 85, club: 'Real Betis', year: 2026, photoColor: '#16a34a' },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 85, club: 'Santos', year: 2025, photoColor: '#ffffff' },
  { name: 'Raphinha', position: 'Ponta Esquerda', overall: 88, club: 'Barcelona', year: 2026, photoColor: '#a50044' },
  { name: 'Bruno Guimarães', position: 'Meio Campo', overall: 88, club: 'Newcastle', year: 2026, photoColor: '#000000' },
  { name: 'Lucas Paquetá', position: 'Meia Ofensivo', overall: 87, club: 'West Ham', year: 2026, photoColor: '#7c2d12' },
  { name: 'João Pedro', position: 'Centroavante', overall: 86, club: 'Chelsea', year: 2026, photoColor: '#0284c7' },
  { name: 'Matheus Cunha', position: 'Centroavante', overall: 85, club: 'Manchester United', year: 2026, photoColor: '#dc2626' },
  { name: 'Gabriel Martinelli', position: 'Ponta Esquerda', overall: 86, club: 'Arsenal', year: 2026, photoColor: '#dc2626' },
  { name: 'Gabriel Jesus', position: 'Centroavante', overall: 85, club: 'Arsenal', year: 2026, photoColor: '#dc2626' },
  { name: 'Gabriel Magalhães', position: 'Zagueiro', overall: 87, club: 'Arsenal', year: 2026, photoColor: '#dc2626' },
  { name: 'Marquinhos', position: 'Zagueiro', overall: 88, club: 'PSG', year: 2026, photoColor: '#0284c7' },
  { name: 'Éder Militão', position: 'Zagueiro', overall: 87, club: 'Real Madrid', year: 2026, photoColor: '#ffffff' },
  { name: 'Bremer', position: 'Zagueiro', overall: 86, club: 'Juventus', year: 2026, photoColor: '#000000' },
  { name: 'Alisson', position: 'Goleiro', overall: 89, club: 'Liverpool', year: 2026, photoColor: '#dc2626' },
  { name: 'Ederson', position: 'Goleiro', overall: 88, club: 'Manchester City', year: 2026, photoColor: '#0284c7' },
  { name: 'Bento', position: 'Goleiro', overall: 84, club: 'Al-Nassr', year: 2026, photoColor: '#facc15' },
  { name: 'André', position: 'Volante', overall: 85, club: 'Wolves', year: 2026, photoColor: '#facc15' },
  { name: 'Douglas Luiz', position: 'Volante', overall: 85, club: 'Juventus', year: 2026, photoColor: '#000000' },
  { name: 'Joelinton', position: 'Meio Campo', overall: 85, club: 'Newcastle', year: 2026, photoColor: '#000000' },
  { name: 'Andreas Pereira', position: 'Meia Ofensivo', overall: 84, club: 'Fulham', year: 2026, photoColor: '#000000' },
  { name: 'Antony', position: 'Ponta Direita', overall: 84, club: 'Real Betis', year: 2026, photoColor: '#16a34a' },
  { name: 'Savinho', position: 'Ponta Direita', overall: 84, club: 'Manchester City', year: 2026, photoColor: '#0284c7' },
  { name: 'Wesley', position: 'Lateral Direito', overall: 83, club: 'Aston Villa', year: 2026, photoColor: '#7c2d12' },
  { name: 'Vanderson', position: 'Lateral Direito', overall: 84, club: 'Monaco', year: 2026, photoColor: '#0284c7' },
  { name: 'Abner', position: 'Lateral Esquerdo', overall: 82, club: 'Real Betis', year: 2026, photoColor: '#16a34a' },
  { name: 'Carlos Augusto', position: 'Lateral Esquerdo', overall: 83, club: 'Inter de Milão', year: 2026, photoColor: '#1e3a8a' },
  { name: 'Pepê', position: 'Ponta Direita', overall: 83, club: 'Porto', year: 2024, photoColor: '#0284c7' },
  { name: 'Pepê', position: 'Ponta Direita', overall: 84, club: 'Porto', year: 2026, photoColor: '#0284c7' },
  { name: 'Galeno', position: 'Ponta Esquerda', overall: 84, club: 'Porto', year: 2024, photoColor: '#0284c7' },
  { name: 'Wendell', position: 'Lateral Esquerdo', overall: 82, club: 'Porto', year: 2024, photoColor: '#0284c7' },
  { name: 'Evanilson', position: 'Centroavante', overall: 84, club: 'Porto', year: 2024, photoColor: '#0284c7' },
  { name: 'Evanilson', position: 'Centroavante', overall: 86, club: 'Bournemouth', year: 2026, photoColor: '#000000' },
  { name: 'Igor Julio', position: 'Zagueiro', overall: 83, club: 'Brighton', year: 2024, photoColor: '#0284c7' },
  { name: 'Igor Julio', position: 'Zagueiro', overall: 84, club: 'Brighton', year: 2026, photoColor: '#0284c7' },
  { name: 'João Gomes', position: 'Volante', overall: 84, club: 'Wolves', year: 2026, photoColor: '#facc15' },
  { name: 'André Trindade', position: 'Volante', overall: 85, club: 'Wolves', year: 2026, photoColor: '#facc15' },
  { name: 'Gabriel Moscardo', position: 'Volante', overall: 83, club: 'Inter de Milão', year: 2026, photoColor: '#1e3a8a' },
  { name: 'Nathan Allan', position: 'Volante', overall: 82, club: 'Atalanta', year: 2024, photoColor: '#0284c7' },
  { name: 'Talles Magno', position: 'Ponta Esquerda', overall: 82, club: 'New York City', year: 2024, photoColor: '#0284c7' },
  { name: 'Matheus França', position: 'Meia Ofensivo', overall: 82, club: 'Crystal Palace', year: 2026, photoColor: '#0284c7' },
  { name: 'Marlon', position: 'Zagueiro', overall: 82, club: 'Shakhtar Donetsk', year: 2024, photoColor: '#dc2626' },
  { name: 'Wanderson', position: 'Ponta Esquerda', overall: 82, club: 'Lyon', year: 2024, photoColor: '#ffffff' },
  { name: 'Iury Castilho', position: 'Atacante', overall: 80, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Luiz Henrique', position: 'Ponta Direita', overall: 84, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Luiz Henrique', position: 'Ponta Direita', overall: 86, club: 'Zenit', year: 2026, photoColor: '#0284c7' },
  { name: 'Igor Jesus', position: 'Centroavante', overall: 83, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Patrick de Paula', position: 'Volante', overall: 82, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Gregore', position: 'Volante', overall: 82, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Hulk', position: 'Centroavante', overall: 83, club: 'Atlético Mineiro', year: 2024, photoColor: '#000000' },
  { name: 'Paulinho', position: 'Centroavante', overall: 84, club: 'Atlético Mineiro', year: 2024, photoColor: '#000000' },
  { name: 'Deyverson', position: 'Centroavante', overall: 82, club: 'Atlético Mineiro', year: 2024, photoColor: '#000000' },
  { name: 'Yuri Alberto', position: 'Centroavante', overall: 84, club: 'Corinthians', year: 2024, photoColor: '#000000' },
  { name: 'Yuri Alberto', position: 'Centroavante', overall: 85, club: 'Corinthians', year: 2026, photoColor: '#000000' },
  { name: 'Rodrigo Garro', position: 'Meia Ofensivo', overall: 84, club: 'Corinthians', year: 2024, photoColor: '#000000' },
  { name: 'Rodrigo Garro', position: 'Meia Ofensivo', overall: 85, club: 'Corinthians', year: 2026, photoColor: '#000000' },
  { name: 'Memphis Depay', position: 'Centroavante', overall: 84, club: 'Corinthians', year: 2025, photoColor: '#000000' },
  { name: 'Talles Magno', position: 'Ponta Esquerda', overall: 82, club: 'Corinthians', year: 2026, photoColor: '#000000' },
  { name: 'Pedro Henrique', position: 'Centroavante', overall: 83, club: 'Athletico Paranaense', year: 2024, photoColor: '#dc2626' },
  { name: 'Pablo', position: 'Centroavante', overall: 82, club: 'Athletico Paranaense', year: 2024, photoColor: '#dc2626' },
  { name: 'Vitor Roque', position: 'Centroavante', overall: 82, club: 'Athletico Paranaense', year: 2023, photoColor: '#dc2626' },
  { name: 'Estêvão', position: 'Ponta Direita', overall: 82, club: 'Palmeiras', year: 2023, photoColor: '#16a34a' },
  { name: 'Endrick', position: 'Centroavante', overall: 82, club: 'Palmeiras', year: 2023, photoColor: '#16a34a' },
  { name: 'Raphael Veiga', position: 'Meia Ofensivo', overall: 83, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Raphael Veiga', position: 'Meia Ofensivo', overall: 84, club: 'Palmeiras', year: 2026, photoColor: '#16a34a' },
  { name: 'Rafael Navarro', position: 'Centroavante', overall: 82, club: 'Palmeiras', year: 2026, photoColor: '#16a34a' },
  { name: 'Richard Ríos', position: 'Volante', overall: 83, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Richard Ríos', position: 'Volante', overall: 85, club: 'Palmeiras', year: 2026, photoColor: '#16a34a' },
  { name: 'Aníbal Moreno', position: 'Volante', overall: 82, club: 'Palmeiras', year: 2026, photoColor: '#16a34a' },
  { name: 'Gustavo Gómez', position: 'Zagueiro', overall: 83, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Murilo', position: 'Zagueiro', overall: 83, club: 'Palmeiras', year: 2024, photoColor: '#16a34a' },
  { name: 'Murilo', position: 'Zagueiro', overall: 85, club: 'Nottingham Forest', year: 2026, photoColor: '#dc2626' },
  { name: 'Weverton', position: 'Goleiro', overall: 84, club: 'Palmeiras', year: 2026, photoColor: '#16a34a' },
  { name: 'Pedro', position: 'Centroavante', overall: 84, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Pedro', position: 'Centroavante', overall: 85, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Gabriel Barbosa', position: 'Centroavante', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Bruno Henrique', position: 'Ponta Esquerda', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Arrascaeta', position: 'Meia Ofensivo', overall: 85, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Arrascaeta', position: 'Meia Ofensivo', overall: 86, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Gerson', position: 'Meio Campo', overall: 84, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Gerson', position: 'Meio Campo', overall: 85, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Pulgar', position: 'Volante', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'De La Cruz', position: 'Meia Ofensivo', overall: 85, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'De La Cruz', position: 'Meia Ofensivo', overall: 86, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Léo Pereira', position: 'Zagueiro', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Léo Pereira', position: 'Zagueiro', overall: 84, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Léo Ortiz', position: 'Zagueiro', overall: 84, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Wesley', position: 'Lateral Direito', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Ayrton Lucas', position: 'Lateral Esquerdo', overall: 83, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Rossi', position: 'Goleiro', overall: 84, club: 'Flamengo', year: 2024, photoColor: '#dc2626' },
  { name: 'Rossi', position: 'Goleiro', overall: 85, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Matheus Gonçalves', position: 'Ponta Direita', overall: 82, club: 'Flamengo', year: 2026, photoColor: '#dc2626' },
  { name: 'Michael', position: 'Ponta Direita', overall: 82, club: 'Flamengo', year: 2022, photoColor: '#dc2626' },
  { name: 'Everton Ribeiro', position: 'Meia Ofensivo', overall: 84, club: 'Flamengo', year: 2022, photoColor: '#dc2626' },
  { name: 'Dudu', position: 'Ponta Direita', overall: 83, club: 'Palmeiras', year: 2022, photoColor: '#16a34a' },
  { name: 'Rony', position: 'Ponta Esquerda', overall: 83, club: 'Palmeiras', year: 2022, photoColor: '#16a34a' },
  { name: 'Deyverson', position: 'Centroavante', overall: 82, club: 'Palmeiras', year: 2021, photoColor: '#16a34a' },
  { name: 'Rafael Veiga', position: 'Meia Ofensivo', overall: 83, club: 'Palmeiras', year: 2021, photoColor: '#16a34a' },
  { name: 'Gabriel Veron', position: 'Ponta Direita', overall: 82, club: 'Porto', year: 2022, photoColor: '#0284c7' },
  { name: 'Mateus Vital', position: 'Meia Ofensivo', overall: 81, club: 'Corinthians', year: 2022, photoColor: '#000000' },
  { name: 'Gustavo Mosquito', position: 'Ponta Direita', overall: 81, club: 'Corinthians', year: 2022, photoColor: '#000000' },
  { name: 'Roger Guedes', position: 'Centroavante', overall: 83, club: 'Corinthians', year: 2022, photoColor: '#000000' },
  { name: 'Yuri Alberto', position: 'Centroavante', overall: 83, club: 'Corinthians', year: 2022, photoColor: '#000000' },
  { name: 'Cássio', position: 'Goleiro', overall: 85, club: 'Corinthians', year: 2022, photoColor: '#000000' },
  { name: 'Cássio', position: 'Goleiro', overall: 84, club: 'Corinthians', year: 2024, photoColor: '#000000' },
  { name: 'Hugo Souza', position: 'Goleiro', overall: 83, club: 'Flamengo', year: 2022, photoColor: '#dc2626' },
  { name: 'Santos', position: 'Goleiro', overall: 82, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'John', position: 'Goleiro', overall: 82, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Lucas Perri', position: 'Goleiro', overall: 84, club: 'Botafogo', year: 2024, photoColor: '#000000' },
  { name: 'Lucas Perri', position: 'Goleiro', overall: 85, club: 'Sevilla', year: 2026, photoColor: '#ffffff' },
  { name: 'Éder', position: 'Zagueiro', overall: 82, club: 'Grêmio', year: 2024, photoColor: '#0284c7' },
  { name: 'Kannemann', position: 'Zagueiro', overall: 83, club: 'Grêmio', year: 2024, photoColor: '#0284c7' },
  { name: 'Geromel', position: 'Zagueiro', overall: 84, club: 'Grêmio', year: 2024, photoColor: '#0284c7' },
  { name: 'Soteldo', position: 'Ponta Esquerda', overall: 82, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Marquinhos', position: 'Ponta Direita', overall: 82, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Neymar', position: 'Ponta Esquerda', overall: 86, club: 'Santos', year: 2026, photoColor: '#ffffff' },
  { name: 'Gabriel Veron', position: 'Ponta Direita', overall: 82, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Deivid', position: 'Centroavante', overall: 80, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Guilherme', position: 'Ponta Direita', overall: 81, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Brazão', position: 'Goleiro', overall: 81, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'João Schmidt', position: 'Volante', overall: 82, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'João Schmidt', position: 'Volante', overall: 83, club: 'Santos', year: 2026, photoColor: '#ffffff' },
  { name: 'Jheydson', position: 'Ponta Esquerda', overall: 80, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Bautista', position: 'Ponta Direita', overall: 80, club: 'Santos', year: 2024, photoColor: '#ffffff' },
  { name: 'Guilherme Nunes', position: 'Ponta Esquerda', overall: 80, club: 'Santos', year: 2024, photoColor: '#ffffff' },
];

export function generateBrazilianLegends(): HistoricalPlayerData[] {
  return BRAZILIAN_LEGENDS.map(brazilianLegend);
}

// ============================================================
// Main exported generator
// ============================================================

const SEED = 20240101;
const PROCEDURAL_TARGET = 480; // curated (~60) + ~480 = ~540 teams

export function generateHistoricalDataset(): {
  teams: HistoricalTeamData[];
  players: HistoricalPlayerData[];
} {
  const rng = mulberry32(SEED);
  const teams: HistoricalTeamData[] = [];
  const players: HistoricalPlayerData[] = [];
  const usedKeys = new Set<string>();

  // 0) Prepend Brazilian legends (free agents) so they appear first in
  //    searches/drafts. teamId stays null on these records; the seed script
  //    will still try to attach any whose (club, year) matches a created team.
  players.push(...generateBrazilianLegends());

  // 1) Curated real historical teams
  for (const curated of CURATED) {
    const key = `${curated.name}|${curated.year}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const { stars, ...teamData } = curated;
    teams.push(teamData);
    players.push(...buildSquad(curated, rng));
  }

  // 2) Procedural generated teams
  let produced = 0;
  let attempts = 0;
  const maxAttempts = PROCEDURAL_TARGET * 4;
  while (produced < PROCEDURAL_TARGET && attempts < maxAttempts) {
    attempts++;
    const result = generateProceduralTeam(rng, usedKeys);
    if (!result) continue;
    teams.push(result.team);
    players.push(...result.players);
    produced++;
  }

  return { teams, players };
}

// Re-export positions for convenience
export { POSITIONS };
