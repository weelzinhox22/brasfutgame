import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/teams?decade=1960&country=Brasil&q=santos&limit=60&sort=ovr
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const decade = searchParams.get('decade')
  const country = searchParams.get('country')
  const q = searchParams.get('q')?.toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '60'), 200)
  const sort = searchParams.get('sort') || 'ovr'

  const where: any = {}
  if (decade) where.decade = parseInt(decade)
  if (country) where.country = country
  if (q) where.name = { contains: q }

  const orderBy =
    sort === 'year' ? { year: 'asc' as const } :
    sort === 'name' ? { name: 'asc' as const } :
    { ovr: 'desc' as const }

  const teams = await db.historicalTeam.findMany({
    where,
    orderBy,
    take: limit,
    include: { _count: { select: { players: true } } },
  })

  return NextResponse.json({
    teams: teams.map((t) => ({
      id: t.id,
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
      playerCount: t._count.players,
    })),
  })
}
