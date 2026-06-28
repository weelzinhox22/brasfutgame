import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/championship/[code] -> standings + matches history
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const room = await db.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      participants: true,
      matches: { orderBy: [{ round: 'asc' }, { playedAt: 'asc' }] },
      standings: { orderBy: [{ points: 'desc' }, { goalDifference: 'desc' }, { goalsFor: 'desc' }] },
    },
  })
  if (!room) return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 })

  return NextResponse.json({
    code: room.code,
    name: room.name,
    status: room.status,
    settings: JSON.parse(room.settings || '{}'),
    participants: room.participants.map((p) => ({
      id: p.id,
      username: p.username,
      isBot: p.isBot,
      teamName: p.teamName,
      teamOvr: p.teamOvr,
    })),
    standings: room.standings.map((s, i) => ({ ...s, position: i + 1 })),
    matches: room.matches.map((m) => ({
      id: m.id,
      round: m.round,
      homeName: m.homeName,
      awayName: m.awayName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      played: m.played,
      events: JSON.parse(m.events || '[]'),
      playedAt: m.playedAt,
    })),
  })
}
