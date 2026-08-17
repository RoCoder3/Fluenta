/** Dev helper: a brand-new user with NO onboarding, to test the gate. */
import { createHash, randomBytes } from 'node:crypto'
import * as schema from '../../src/server/db/schema'

async function main() {
  const { getDb } = await import('../../src/server/db')
  const { hashPassword } = await import('../../src/server/auth')
  const db = await getDb()

  const [user] = await db
    .insert(schema.users)
    .values({
      email: `fresh-${Date.now()}@example.test`,
      passwordHash: await hashPassword('correct-horse-battery'),
      name: 'Fresh Learner',
    })
    .returning()
  if (!user) throw new Error('failed')

  const token = randomBytes(32).toString('base64url')
  await db.insert(schema.authSessions).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 86400000),
  })
  console.log(token)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
