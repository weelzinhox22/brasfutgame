import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/players?position=Goleiro&minOvr=80&decade=1960&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const position = searchParams.get('position')
  const minOvr = searchParams.get('minOvr')
  const maxOvr = searchParams.get('maxOvr')
  const decade = searchParams.get('decade')
  const country = searchParams.get('country')
  const q = searchParams.get('q')?.toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  const where: any = {}
  if (position) where.position = position
  if (decade) where.decade = parseInt(decade)
  if (country) where.country = country
  if (q) where.name = { contains: q }
  if (minOvr || maxOvr) {
    where.overall = {}
    if (minOvr) where.overall.gte = parseInt(minOvr)
    if (maxOvr) where.overall.lte = parseInt(maxOvr)
  }

  const players = await db.historicalPlayer.findMany({
    where,
    orderBy: { overall: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      overall: p.overall,
      country: p.country,
      club: p.club,
      year: p.year,
      decade: p.decade,
      photoColor: p.photoColor,
      stats: JSON.parse(p.stats || '{}'),
    })),
  })
}
