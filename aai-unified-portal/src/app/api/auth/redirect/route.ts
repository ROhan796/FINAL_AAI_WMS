import { NextResponse } from 'next/server'
import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/db/client'
import { appUsers } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }

    const email = user.emailAddresses?.[0]?.emailAddress || ''
    const username = user.username || ''

    let role = (user.publicMetadata as any)?.role

    // 1. Try matching the user in our database by email (case-insensitive)
    if (email) {
      const dbUser = await db.select().from(appUsers)
        .where(sql`LOWER(${appUsers.email}) = LOWER(${email})`)
        .limit(1)
      if (dbUser[0]) {
        role = dbUser[0].role
      }
    }

    // 2. If not found in DB, fallback to email-based detection
    if (!role || !['ADMIN', 'TERMINAL', 'AUDITOR'].includes(role)) {
      const normEmail = email.toLowerCase()
      const normUser = username?.toLowerCase() || ''

      const ADMIN_EMAILS = ['rmxdeath@gmail.com', 'admin@aai.gov.in']
      const TERMINAL_EMAILS = ['mannarohan51@gmail.com', 'terminal@aai.gov.in']
      const AUDITOR_EMAILS = ['rohanmannas2021@gmail.com', 'auditor@aai.gov.in']

      if (
        ADMIN_EMAILS.includes(normEmail) ||
        normUser.includes('admin') ||
        normEmail.includes('admin')
      ) {
        role = 'ADMIN'
      } else if (
        TERMINAL_EMAILS.includes(normEmail) ||
        normUser.includes('terminal') ||
        normEmail.includes('terminal')
      ) {
        role = 'TERMINAL'
      } else if (
        AUDITOR_EMAILS.includes(normEmail) ||
        normUser.includes('audit') ||
        normEmail.includes('audit')
      ) {
        role = 'AUDITOR'
      } else {
        return NextResponse.redirect(
          new URL(`/unauthorized?required=ANY&current=NONE`, request.url)
        )
      }
    }

    // 3. Sync role to Clerk's publicMetadata for future session tokens
    if (role) {
      const client = await clerkClient()
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: { role }
      })
    }

    // 4. Redirect to the correct portal route
    if (role === 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    } else if (role === 'TERMINAL') {
      return NextResponse.redirect(new URL('/terminal', request.url))
    } else if (role === 'AUDITOR') {
      return NextResponse.redirect(new URL('/audit', request.url))
    }

    return NextResponse.redirect(
      new URL(`/unauthorized?required=ANY&current=${role || 'NONE'}`, request.url)
    )
  } catch (error) {
    console.error('Redirect handler error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.redirect(
      new URL('/sign-in?error=redirect_failed', request.url)
    )
  }
}
