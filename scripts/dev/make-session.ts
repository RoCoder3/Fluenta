/** Dev helper: mints a session cookie for the most recent user, for HTTP testing. */
import { createHash, randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'

async function main() {
  const { getDb } = await import('../../src/server/db')
  const db = await getDb()

  const [user] = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt)).limit(1)
  if (!user) throw new Error('no user found — run npm run smoke first')

  await db
    .update(schema.users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(schema.users.id, user.id))

  const token = randomBytes(32).toString('base64url')
  await db.insert(schema.authSessions).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 86400000),
  })
  console.log(token)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
