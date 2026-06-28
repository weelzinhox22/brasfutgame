import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/rooms/[code] -> room info (for join preview)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const room = await db.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      participants: { orderBy: { joinedAt: 'asc' } },
      _count: { select: { participants: true } },
    },
  })
  if (!room) return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 })

  return NextResponse.json({
    id: room.id,
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    hasPassword: !!room.password,
    status: room.status,
    settings: JSON.parse(room.settings || '{}'),
    createdAt: room.createdAt,
    participantCount: room._count.participants,
    participants: room.participants.map((p) => ({
      id: p.id,
      username: p.username,
      isBot: p.isBot,
      isHost: p.isHost,
    })),
  })
}
