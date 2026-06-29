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
    password: room.password,
    hasPassword: !!room.password,
    status: room.status,
    settings: JSON.parse(room.settings || '{}'),
    createdAt: room.createdAt,
    participantCount: room._count.participants,
    participants: room.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      isBot: p.isBot,
      isHost: p.isHost,
      teamName: p.teamName,
      teamOvr: p.teamOvr,
      formation: p.formation,
      online: true,
      squadSize: 0,
    })),
    squads: [],
    chat: [],
  })
}

// POST /api/rooms/[code] -> join room / add participant
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const { userId, username, password } = await req.json()

    if (!userId || !username) {
      return NextResponse.json({ error: 'Usuário necessário.' }, { status: 400 })
    }

    const room = await db.room.findUnique({
      where: { code: code.toUpperCase() },
      include: { participants: true },
    })
    if (!room) return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 })

    if (room.password && room.password !== password) {
      return NextResponse.json({ error: 'Senha incorreta.' }, { status: 403 })
    }

    // Check if already a participant
    const existing = room.participants.find((p) => p.userId === userId)
    if (existing) {
      return NextResponse.json({
        participantId: existing.id,
        code: room.code,
        alreadyJoined: true,
      })
    }

    // Check capacity
    const humans = room.participants.filter((p) => !p.isBot).length
    const settings = JSON.parse(room.settings || '{}')
    if (humans >= (settings.maxPlayers || 20)) {
      return NextResponse.json({ error: 'Sala cheia.' }, { status: 400 })
    }

    // Add participant
    const participant = await db.roomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        username,
        isBot: false,
        isHost: false,
      },
    })

    return NextResponse.json({
      participantId: participant.id,
      code: room.code,
      alreadyJoined: false,
    })
  } catch (e) {
    console.error('[rooms POST by code]', e)
    return NextResponse.json({ error: 'Erro ao entrar na sala.' }, { status: 500 })
  }
}
