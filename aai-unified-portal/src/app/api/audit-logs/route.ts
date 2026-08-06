import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { systemLogs } from '@/db/schema'
import { desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    const logs = await db.select().from(systemLogs)
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit)

    return NextResponse.json(logs)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
