import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const team = await db.historicalTeam.findUnique({
    where: { id },
    include: { players: { orderBy: { overall: 'desc' } } },
  })
  if (!team) return NextResponse.json({ error: 'Time não encontrado.' }, { status: 404 })
  return NextResponse.json({
    id: team.id,
    name: team.name,
    year: team.year,
    country: team.country,
    league: team.league,
    ovr: team.ovr,
    formation: team.formation,
    decade: team.decade,
    badgeColor: team.badgeColor,
    accentColor: team.accentColor,
    description: team.description,
    players: team.players.map((p) => ({
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
