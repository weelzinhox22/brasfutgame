import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_SETTINGS } from '@/lib/types'
import type { RoomSettings } from '@/lib/types'

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// POST /api/rooms -> create room
export async function POST(req: NextRequest) {
  try {
    const { name, userId, username, password, settings } = await req.json()
    if (!userId || !username) {
      return NextResponse.json({ error: 'Usuário necessário.' }, { status: 400 })
    }

    let code = genCode()
    // ensure unique
    while (await db.room.findUnique({ where: { code } })) code = genCode()

    const finalSettings: RoomSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) }

    const room = await db.room.create({
      data: {
        code,
        name: (name || `Sala de ${username}`).slice(0, 40),
        hostId: userId,
        password: password || null,
        settings: JSON.stringify(finalSettings),
        status: 'waiting',
        participants: {
          create: {
            userId,
            username,
            isBot: false,
            isHost: true,
          },
        },
      },
      include: { participants: true },
    })

    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      hasPassword: !!room.password,
      status: room.status,
      settings: finalSettings,
      createdAt: room.createdAt,
      participantCount: room.participants.length,
    })
  } catch (e) {
    console.error('[rooms POST]', e)
    return NextResponse.json({ error: 'Erro ao criar sala.' }, { status: 500 })
  }
}

// GET /api/rooms -> list public waiting rooms
export async function GET() {
  const rooms = await db.room.findMany({
    where: { status: 'waiting', password: null },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { _count: { select: { participants: true } } },
  })
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      hasPassword: false,
      status: r.status,
      settings: JSON.parse(r.settings || '{}'),
      createdAt: r.createdAt,
      participantCount: r._count.participants,
    })),
  })
}
