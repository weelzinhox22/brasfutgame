import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/seed -> status of database seeding
export async function GET() {
  const [teams, players, rooms, rankings] = await Promise.all([
    db.historicalTeam.count(),
    db.historicalPlayer.count(),
    db.room.count(),
    db.userRanking.count(),
  ])
  return NextResponse.json({ teams, players, rooms, rankings })
}
