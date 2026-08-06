import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { whiHistory, washroomUnits } from '@/db/schema'
import { eq, and, avg, asc, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const terminal = searchParams.get('terminal') || 'T2'
  const daysStr = searchParams.get('days') || '7'
  const days = parseInt(daysStr)

  try {
    try {
      const daUrl = process.env.DA_ENGINE_URL || process.env.NEXT_PUBLIC_DA_ENGINE_URL || 'http://localhost:8001'
      const response = await fetch(`${daUrl}/api/trends?days=${days}`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) {
        const trends = await response.json()
        return NextResponse.json(trends.map((t: any) => ({
          date: t.date,
          avg_whi: t.avg_whi,
          terminal_id: terminal
        })))
      }
    } catch (e) {
      console.warn('DA Engine trends api unavailable, falling back to local database query.')
    }

    const result = await db
      .select({
        date: whiHistory.date,
        avg_whi: avg(whiHistory.avg_whi)
      })
      .from(whiHistory)
      .innerJoin(washroomUnits, eq(whiHistory.device_id, washroomUnits.device_id))
      .where(
        and(
          eq(washroomUnits.terminal_id, terminal),
          sql`${whiHistory.date} >= CURRENT_DATE - ${days} * INTERVAL '1 day'`
        )
      )
      .groupBy(whiHistory.date)
      .orderBy(asc(whiHistory.date))

    const mapped = result.map((r: any) => ({
      date: r.date,
      avg_whi: Math.round(Number(r.avg_whi) * 10) / 10,
      terminal_id: terminal
    }))

    return NextResponse.json(mapped)
  } catch (err) {
    console.error('Error fetching WHI history api:', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
