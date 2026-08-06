import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/db/client'
import { appUsers } from '@/db/schema'
import { eq } from 'drizzle-orm'

function detectRole(username: string | null | undefined, email: string): string {
  if (username) {
    if (/^AP-\d{3,}$/i.test(username))  return 'ADMIN'
    if (/^TP-\d{3,}$/i.test(username))  return 'TERMINAL'
    if (/^ALP-\d{3,}$/i.test(username)) return 'AUDITOR'
  }
  if (email) {
    const ADMIN_EMAILS = ['rmxdeath@gmail.com', 'admin@aai.gov.in']
    const TERMINAL_EMAILS = ['mannarohan51@gmail.com', 'terminal@aai.gov.in']
    const AUDITOR_EMAILS = ['rohanmannas2021@gmail.com', 'auditor@aai.gov.in']
    const lower = email.toLowerCase()
    if (ADMIN_EMAILS.includes(lower))     return 'ADMIN'
    if (TERMINAL_EMAILS.includes(lower))  return 'TERMINAL'
    if (AUDITOR_EMAILS.includes(lower))   return 'AUDITOR'
  }
  return 'TERMINAL'
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET not set')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  // Verify svix signature
  const headerPayload  = await headers()
  const svixId         = headerPayload.get('svix-id')
  const svixTimestamp  = headerPayload.get('svix-timestamp')
  const svixSignature  = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    )
  }

  const payload = await req.text()

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: any

  try {
    evt = wh.verify(payload, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  const eventType = evt.type
  const data      = evt.data

  console.log(`[Clerk Webhook] Event: ${eventType}`, { userId: data?.id })

  // ── EVENT: user.created ────────────────────────────────
  if (eventType === 'user.created') {
    const {
      id: clerkId,
      username,
      first_name,
      last_name,
      email_addresses,
      image_url,
      created_at,
    } = data

    const fullName    = [first_name, last_name].filter(Boolean).join(' ') || username || 'Unknown User'
    const primaryEmail = email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address
      ?? email_addresses?.[0]?.email_address
      ?? ''

    // Detect role from username/email pattern
    let role = detectRole(username, primaryEmail)

    // If no pattern match, assign TERMINAL as default
    // (Admin can update role manually from Clerk Dashboard)
    if (!role) role = 'TERMINAL'

    // Set role in Clerk publicMetadata
    try {
      await (await clerkClient()).users.updateUserMetadata(clerkId, {
        publicMetadata: { role }
      })
      console.log(`[Clerk Webhook] Role "${role}" set for user ${clerkId}`)
    } catch (err) {
      console.error('[Clerk Webhook] Failed to set Clerk metadata:', err)
    }

    // Upsert into Neon DB app_users
    try {
      await db.insert(appUsers).values({
        id:        username ?? clerkId,
        name:      fullName,
        email:     primaryEmail,
        role,
        clerkId,
        status:    'ACTIVE',
        lastLogin: new Date(created_at),
        createdAt: new Date(created_at),
      }).onConflictDoUpdate({
        target: appUsers.clerkId,
        set: {
          name:  fullName,
          email: primaryEmail,
          role,
        }
      })
      console.log(`[Clerk Webhook] User ${clerkId} upserted into app_users`)
    } catch (err) {
      console.error('[Clerk Webhook] Failed to insert user into DB:', err)
    }
  }

  // ── EVENT: user.updated ────────────────────────────────
  if (eventType === 'user.updated') {
    const {
      id: clerkId,
      username,
      first_name,
      last_name,
      email_addresses,
      public_metadata,
    } = data

    const fullName    = [first_name, last_name].filter(Boolean).join(' ') || username || 'Unknown User'
    const primaryEmail = email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address
      ?? email_addresses?.[0]?.email_address

    const role = (public_metadata?.role as string) ?? detectRole(username, primaryEmail ?? '') ?? 'TERMINAL'

    try {
      await db.update(appUsers)
        .set({
          name:  fullName,
          email: primaryEmail ?? '',
          role,
        })
        .where(eq(appUsers.clerkId, clerkId))
      console.log(`[Clerk Webhook] User ${clerkId} updated in app_users`)
    } catch (err) {
      console.error('[Clerk Webhook] Failed to update user in DB:', err)
    }
  }

  // ── EVENT: session.created (track last login) ──────────
  if (eventType === 'session.created') {
    const { user_id: clerkId } = data

    try {
      await db.update(appUsers)
        .set({ lastLogin: new Date() })
        .where(eq(appUsers.clerkId, clerkId))
      console.log(`[Clerk Webhook] Last login updated for ${clerkId}`)
    } catch (err) {
      // Non-critical — don't fail the webhook
      console.warn('[Clerk Webhook] Could not update lastLogin:', err)
    }
  }

  // ── EVENT: user.deleted ────────────────────────────────
  if (eventType === 'user.deleted') {
    const { id: clerkId } = data

    try {
      await db.update(appUsers)
        .set({ status: 'INACTIVE' })
        .where(eq(appUsers.clerkId, clerkId))
      console.log(`[Clerk Webhook] User ${clerkId} marked INACTIVE`)
    } catch (err) {
      console.error('[Clerk Webhook] Failed to deactivate user:', err)
    }
  }

  return NextResponse.json({ success: true, event: eventType })
}
