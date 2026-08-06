import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { db } from '@/db/client'
import { systemSettings, appUsers } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = await db.select().from(systemSettings).limit(1)
    if (settings.length === 0) {
      const inserted = await db.insert(systemSettings).values({}).returning()
      return NextResponse.json(inserted[0])
    }
    return NextResponse.json(settings[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user role - only ADMIN can modify settings
    const email = user.emailAddresses?.[0]?.emailAddress || ''
    const dbUser = await db.select().from(appUsers)
      .where(sql`LOWER(${appUsers.email}) = LOWER(${email})`)
      .limit(1)
    
    const role = dbUser[0]?.role || (user.publicMetadata as any)?.role
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only administrators can modify system settings' }, { status: 403 })
    }

    const body = await request.json()

    const settings = await db.select().from(systemSettings).limit(1)
    if (settings.length === 0) {
      const inserted = await db.insert(systemSettings).values({
        ammoniaThreshold: body.ammoniaThreshold,
        whiAlertThreshold: body.whiAlertThreshold,
        pingIntervalSeconds: body.pingIntervalSeconds,
        emailAlerts: body.emailAlerts,
        smsAlerts: body.smsAlerts,
        autoEscalation: body.autoEscalation,
        trafficLimitPerHour: body.trafficLimitPerHour,
        updatedBy: user?.id || 'unknown',
      }).returning()
      return NextResponse.json(inserted[0])
    }

    const updated = await db.update(systemSettings)
      .set({
        ammoniaThreshold: body.ammoniaThreshold ?? settings[0].ammoniaThreshold,
        whiAlertThreshold: body.whiAlertThreshold ?? settings[0].whiAlertThreshold,
        pingIntervalSeconds: body.pingIntervalSeconds ?? settings[0].pingIntervalSeconds,
        emailAlerts: body.emailAlerts ?? settings[0].emailAlerts,
        smsAlerts: body.smsAlerts ?? settings[0].smsAlerts,
        autoEscalation: body.autoEscalation ?? settings[0].autoEscalation,
        trafficLimitPerHour: body.trafficLimitPerHour ?? settings[0].trafficLimitPerHour,
        updatedAt: new Date(),
        updatedBy: user?.id || 'unknown',
      })
      .where(eq(systemSettings.id, settings[0].id))
      .returning()
    return NextResponse.json(updated[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
