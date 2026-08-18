/** Dev helper: remove a test account and everything cascading from it. */
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'

async function main() {
  const userId = process.argv[2]
  if (!userId) throw new Error('usage: delete-user.ts <userId>')

  const { getDb } = await import('../../src/server/db')
  const db = await getDb()

  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (!user) {
    console.log('  user not found — nothing to do')
    process.exit(0)
  }
  if (!user.email.endsWith('@example.test')) {
    throw new Error(`refusing to delete ${user.email}: only @example.test accounts`)
  }

  // Every per-learner table cascades from users; phrases are shared and stay.
  await db.delete(schema.users).where(eq(schema.users.id, userId))
  console.log(`  deleted ${user.email}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message.slice(0, 200) : e)
  process.exit(1)
})
