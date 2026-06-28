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
