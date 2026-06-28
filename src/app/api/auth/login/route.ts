import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Simple username-based auth (demo). Creates user if not exists.
export async function POST(req: NextRequest) {
  try {
    const { username, country } = await req.json()
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return NextResponse.json({ error: 'Nome de usuário inválido.' }, { status: 400 })
    }
    const name = username.trim().slice(0, 24)
    const colors = ['#16a34a', '#dc2626', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#65a30d']
    const avatarColor = colors[Math.floor(Math.random() * colors.length)]

    const user = await db.user.upsert({
      where: { username: name },
      create: { username: name, avatarColor, country: country || 'Brasil' },
      update: {},
    })

    await db.userRanking.upsert({
      where: { userId: user.id },
      create: { userId: user.id, username: user.username, country: user.country },
      update: {},
    })

    return NextResponse.json({
      id: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      country: user.country,
    })
  } catch (e) {
    console.error('[auth/login]', e)
    return NextResponse.json({ error: 'Erro no login.' }, { status: 500 })
  }
}
