import { NextResponse } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'

// Global cache for user roles to avoid repeated DB queries (5-minute TTL)
// This persists across requests as long as the module isn't reloaded
declare global {
  var __roleCache: Map<string, { role: string; expiresAt: number }> | undefined
}

if (!global.__roleCache) {
  global.__roleCache = new Map()
}

const ROLE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedRole(userId: string): string | null {
  const cached = global.__roleCache!.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.role
  }
  global.__roleCache!.delete(userId)
  return null
}

function setCachedRole(userId: string, role: string): void {
  global.__roleCache!.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL })
}

// Simple path matching instead of deprecated createRouteMatcher
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/api/webhooks/clerk') ||
    pathname.startsWith('/api/auth/redirect') ||
    pathname.startsWith('/api/da/') ||
    pathname.startsWith('/api/wms/') ||
    pathname.startsWith('/unauthorized') ||
    pathname.startsWith('/forbidden')
  )
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

function isTerminalPath(pathname: string): boolean {
  return pathname.startsWith('/terminal')
}

function isAuditPath(pathname: string): boolean {
  return pathname.startsWith('/audit')
}

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth()
  let currentRole = (sessionClaims?.metadata as { role?: string })?.role
  const pathname = new URL(req.url).pathname

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  if (!currentRole && userId) {
    // Check cache first
    const cachedRole = getCachedRole(userId)
    if (cachedRole) {
      currentRole = cachedRole
    } else {
      // Check in-flight to avoid duplicate concurrent queries for same user
      const existing = global.__roleCache!.get(`__inflight:${userId}`)
      if (existing && Date.now() < existing.expiresAt) {
        currentRole = existing.role
      } else {
        // Mark as in-flight with short TTL to prevent duplicates
        global.__roleCache!.set(`__inflight:${userId}`, { role: '', expiresAt: Date.now() + 5000 })
        try {
          const { db } = await import('./db/client')
          const { appUsers } = await import('./db/schema')
          const { eq } = await import('drizzle-orm')
          const [dbUser] = await db
            .select({ role: appUsers.role })
            .from(appUsers)
            .where(eq(appUsers.clerkId, userId))
            .limit(1)
          if (dbUser) {
            currentRole = dbUser.role
            setCachedRole(userId, dbUser.role)
          }
          global.__roleCache!.delete(`__inflight:${userId}`)
        } catch (e) {
          global.__roleCache!.delete(`__inflight:${userId}`)
          console.error('Failed to resolve role from database in middleware:', e)
        }
      }
    }
  }

  if (isAdminPath(pathname) && currentRole !== 'ADMIN') {
    return NextResponse.redirect(
      new URL(`/unauthorized?required=ADMIN&current=${currentRole || 'NONE'}`, req.url)
    )
  }

  if (isTerminalPath(pathname) && currentRole !== 'TERMINAL') {
    return NextResponse.redirect(
      new URL(`/unauthorized?required=TERMINAL&current=${currentRole || 'NONE'}`, req.url)
    )
  }

  if (isAuditPath(pathname) && currentRole !== 'AUDITOR') {
    return NextResponse.redirect(
      new URL(`/unauthorized?required=AUDITOR&current=${currentRole || 'NONE'}`, req.url)
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
