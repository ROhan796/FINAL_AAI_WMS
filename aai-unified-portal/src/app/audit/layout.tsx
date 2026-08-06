import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/shell/AppShell'
import React from 'react'
import { db } from '@/db/client'
import { appUsers } from '@/db/schema'
import { sql } from 'drizzle-orm'

export default async function AuditLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()
  if (!user) {
    redirect('/sign-in')
  }

  const email = user.emailAddresses?.[0]?.emailAddress || ''

  // Look up role in Neon DB
  const dbUser = await db.select().from(appUsers)
    .where(sql`LOWER(${appUsers.email}) = LOWER(${email})`)
    .limit(1)

  const role = dbUser[0]?.role || (user.publicMetadata as any)?.role

  if (!role || role !== 'AUDITOR') {
    redirect(`/unauthorized?required=AUDITOR&current=${role || 'NONE'}`)
  }

  return <AppShell role="AUDITOR">{children}</AppShell>
}
