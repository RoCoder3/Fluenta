/** Verifies writes work through the POOLED connection (pgbouncer transaction mode). */
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'

async function main() {
  const { getDb } = await import('../../src/server/db')
  const db = await getDb()
  const email = `probe-${Date.now()}@example.invalid`

  const [created] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'probe-not-a-real-hash', name: 'Write Probe' })
    .returning()
  if (!created) throw new Error('insert returned nothing')
  console.log('  ✓ INSERT ok')

  const [read] = await db.select().from(schema.users).where(eq(schema.users.id, created.id)).limit(1)
  console.log(read?.email === email ? '  ✓ SELECT ok (read-after-write)' : '  ✗ SELECT mismatch')

  await db.update(schema.users).set({ name: 'Probe Updated' }).where(eq(schema.users.id, created.id))
  console.log('  ✓ UPDATE ok')

  await db.delete(schema.users).where(eq(schema.users.id, created.id))
  const rest = await db.select().from(schema.users).where(eq(schema.users.id, created.id))
  console.log(rest.length === 0 ? '  ✓ DELETE ok (cleaned up)' : '  ✗ row survived deletion')
}
main().then(() => process.exit(0)).catch((e) => { console.error('  ✗', e.message); process.exit(1) })
