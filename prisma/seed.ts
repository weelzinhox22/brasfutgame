// Seed script: populates the SQLite database with the historical teams & players
// dataset, and ensures a default demo user + ranking entry exist.
//
// Run with:  bun run prisma/seed.ts

import { generateHistoricalDataset } from '../src/lib/historical-data';
import { db } from '../src/lib/db';

async function main(): Promise<void> {
  console.log('→ Generating historical dataset...');
  const { teams, players } = generateHistoricalDataset();
  console.log(
    `  Generated ${teams.length} teams and ${players.length} players (in memory).`,
  );

  // 1) Clear existing data (players first because of FK relation to teams).
  console.log('→ Clearing existing HistoricalPlayer & HistoricalTeam rows...');
  await db.historicalPlayer.deleteMany();
  await db.historicalTeam.deleteMany();

  // 2) Insert all teams using createMany (bulk, fast for SQLite).
  console.log(`→ Inserting ${teams.length} teams...`);
  await db.historicalTeam.createMany({
    data: teams.map((t) => ({
      name: t.name,
      year: t.year,
      country: t.country,
      league: t.league,
      ovr: t.ovr,
      formation: t.formation,
      decade: t.decade,
      badgeColor: t.badgeColor,
      accentColor: t.accentColor,
      description: t.description,
    })),
  });

  // 3) Load the just-created teams to build a (name|year) -> id map.
  //    The generator guarantees uniqueness of (name, year) across the dataset.
  const createdTeams = await db.historicalTeam.findMany({
    select: { id: true, name: true, year: true },
  });
  const teamIdByKey = new Map<string, string>();
  for (const t of createdTeams) {
    teamIdByKey.set(`${t.name}|${t.year}`, t.id);
  }

  // 4) Map players to their team IDs and serialize stats as JSON strings.
  console.log(`→ Inserting ${players.length} players...`);
  const playerRows = players.map((p) => {
    const key = `${p.club}|${p.year}`;
    const teamId = teamIdByKey.get(key) ?? null;
    return {
      name: p.name,
      position: p.position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.stringify(p.stats),
      teamId,
    };
  });

  // Bulk insert. SQLite supports createMany via Prisma.
  await db.historicalPlayer.createMany({
    data: playerRows,
  });

  // 5) Ensure a default demo user + ranking entry exist (idempotent upsert).
  const demoUser = await db.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      country: 'Brasil',
      avatarColor: '#16a34a',
    },
  });

  await db.userRanking.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      username: 'demo',
      country: 'Brasil',
    },
  });

  // 6) Report final counts.
  const teamCount = await db.historicalTeam.count();
  const playerCount = await db.historicalPlayer.count();
  console.log(`\n✓ Seeded ${teamCount} teams and ${playerCount} players.`);
  console.log('✓ Demo user "demo" ensured with default ranking.');
}

main()
  .catch((err) => {
    console.error('✗ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
