import 'server-only'

/**
 * Session authentication.
 *
 * Deliberately in-house rather than next-auth: v5 has been in beta for two
 * years and we only need credentials. This is the whole surface:
 *
 *   - argon2id password hashing (memory-hard, OWASP-recommended parameters)
 *   - 256-bit opaque session tokens; only their SHA-256 is stored
 *   - HTTP-only, SameSite=Lax, Secure-in-production cookies
 *   - server-side revocation (delete the row and the session is dead)
 *
 * Adding OAuth later means adding an `accounts` table and a callback route;
 * the session layer below is unchanged.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { and, eq, gt, lt } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { config } from '@/server/config'
import { getDb } from '@/server/db'
import { authSessions, learnerProfiles, users, type User } from '@/server/db/schema'

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

// OWASP "second choice" argon2id profile: 19 MiB, 2 iterations, parallelism 1.
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTS)
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hashValue, password, ARGON_OPTS)
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Session tokens                                                             */
/* -------------------------------------------------------------------------- */

function newToken(): string {
  return randomBytes(32).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time compare so token lookups can't be timed. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const db = await getDb()
  const token = newToken()
  const expiresAt = new Date(Date.now() + config.auth.sessionDays * 24 * 60 * 60 * 1000)

  await db.insert(authSessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 300),
  })

  const jar = await cookies()
  jar.set(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(config.auth.cookieName)?.value
  if (token) {
    const db = await getDb()
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)))
  }
  jar.delete(config.auth.cookieName)
}

/**
 * The current user, or null. Cached per request via React's cache() at the
 * call sites that need it (see requireUser).
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(config.auth.cookieName)?.value
  if (!token) return null

  const db = await getDb()
  const rows = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  return rows[0]?.user ?? null
}

export type AuthedUser = User & { onboarded: boolean }

/** Throws if not signed in. Server Actions use this as their first line. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthError('Not authenticated')
  return { ...user, onboarded: user.onboardingCompletedAt !== null }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/* -------------------------------------------------------------------------- */
/* Registration & login                                                       */
/* -------------------------------------------------------------------------- */

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string }

export async function registerUser(input: {
  email: string
  password: string
  name: string
}): Promise<AuthResult> {
  const db = await getDb()
  const email = input.email.trim().toLowerCase()

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) {
    return { ok: false, error: 'An account with that email already exists.' }
  }

  const passwordHash = await hashPassword(input.password)
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, name: input.name.trim() })
    .returning({ id: users.id })

  if (!created) return { ok: false, error: 'Could not create the account.' }
  return { ok: true, userId: created.id }
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const db = await getDb()
  const email = input.email.trim().toLowerCase()

  const [found] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  // Hash even when the user is missing, so response time doesn't reveal
  // whether an email is registered.
  if (!found?.passwordHash) {
    await hashPassword(input.password)
    return { ok: false, error: 'Incorrect email or password.' }
  }

  const valid = await verifyPassword(found.passwordHash, input.password)
  if (!valid) return { ok: false, error: 'Incorrect email or password.' }

  return { ok: true, userId: found.id }
}

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

export async function pruneExpiredSessions(): Promise<number> {
  const db = await getDb()
  const deleted = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, new Date()))
    .returning({ id: authSessions.id })
  return deleted.length
}

/** True once the learner has a profile and has finished onboarding. */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const db = await getDb()
  const [row] = await db
    .select({ completedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row?.completedAt) return false

  const [profile] = await db
    .select({ userId: learnerProfiles.userId })
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, userId))
    .limit(1)
  return Boolean(profile)
}
