import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/ranking?scope=global|country
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

  const where = country ? { country } : {}
  const rankings = await db.userRanking.findMany({
    where,
    orderBy: [{ points: 'desc' }, { championships: 'desc' }, { wins: 'desc' }],
    take: limit,
  })

  return NextResponse.json({
    rankings: rankings.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      username: r.username,
      country: r.country,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      championships: r.championships,
      points: r.points,
      matchesPlayed: r.matchesPlayed,
    })),
  })
}
