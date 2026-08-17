/**
 * Seeds the language rows and every built-in phrase corpus.
 *
 * Idempotent — safe to re-run. New corpus entries are added, existing ones are
 * left alone. Corpora are read from the content registry rather than imported
 * one by one, so registering a language there is all it takes to seed it.
 */

import { eq, sql } from 'drizzle-orm'

import { connect, schema } from '../src/server/db/connect'
import { contentPackFor, languagesWithContent } from '../src/server/content'

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:„"“”'’\-–—()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const LANGUAGES = [
  { code: 'de', name: 'German', nativeName: 'Deutsch', speechTag: 'de-DE', isTarget: true, isExplanation: true, variants: ['DE', 'AT', 'CH'] },
  // ES-CT Central · ES-VC Valencian · ES-IB Balearic. These differ in everyday
  // morphology, not just vocabulary, so content is tagged with which it follows.
  { code: 'ca', name: 'Catalan', nativeName: 'Català', speechTag: 'ca-ES', isTarget: true, isExplanation: false, variants: ['ES-CT', 'ES-VC', 'ES-IB'] },
  { code: 'en', name: 'English', nativeName: 'English', speechTag: 'en-GB', isTarget: false, isExplanation: true, variants: ['GB', 'US'] },
  // Present so the multi-language architecture is exercised, not just claimed.
  { code: 'es', name: 'Spanish', nativeName: 'Español', speechTag: 'es-ES', isTarget: false, isExplanation: true, variants: ['ES', 'MX'] },
  { code: 'fr', name: 'French', nativeName: 'Français', speechTag: 'fr-FR', isTarget: false, isExplanation: true, variants: ['FR', 'CH'] },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', speechTag: 'it-IT', isTarget: false, isExplanation: true, variants: ['IT', 'CH'] },
]

async function main() {
  const { db, kind, close } = await connect()
  console.log(`→ seeding (${kind})`)

  for (const language of LANGUAGES) {
    await db
      .insert(schema.languages)
      .values(language)
      .onConflictDoUpdate({
        target: schema.languages.code,
        set: {
          name: language.name,
          nativeName: language.nativeName,
          speechTag: language.speechTag,
          isTarget: language.isTarget,
          isExplanation: language.isExplanation,
          variants: language.variants,
        },
      })
  }
  console.log(`  languages: ${LANGUAGES.length}`)

  let inserted = 0
  let skipped = 0

  for (const languageCode of languagesWithContent()) {
    const pack = contentPackFor(languageCode)
    let insertedHere = 0

    for (const entry of pack.phrases) {
      const normalized = normalizePhrase(entry.text)

      const existing = await db
        .select({ id: schema.phrases.id })
        .from(schema.phrases)
        .where(
          sql`${schema.phrases.languageCode} = ${languageCode} and ${schema.phrases.normalized} = ${normalized}`,
        )
        .limit(1)

      if (existing.length) {
        skipped++
        continue
      }

      const [created] = await db
        .insert(schema.phrases)
        .values({
          languageCode,
          translationLanguageCode: 'en',
          text: entry.text,
          normalized,
          translation: entry.translation,
          literal: entry.literal ?? null,
          context: entry.context,
          register: entry.register,
          regionTag: entry.regionTag ?? null,
          naturalnessNote: entry.naturalnessNote ?? null,
          difficulty: entry.difficulty,
          cefrHint: entry.cefrHint,
          pronunciation: entry.pronunciation ?? null,
          lifeAreaKeys: entry.lifeAreaKeys,
          grammarPatterns: entry.grammarPatterns,
          vocab: entry.vocab,
          tags: entry.tags,
          source: 'seed',
        })
        .returning({ id: schema.phrases.id })

      if (created && entry.examples.length) {
        await db.insert(schema.phraseExamples).values(
          entry.examples.map((e) => ({
            phraseId: created.id,
            text: e.text,
            translation: e.translation,
            note: e.note ?? null,
          })),
        )
      }

      inserted++
      insertedHere++
    }

    console.log(`  ${languageCode}: ${insertedHere} inserted of ${pack.phrases.length} in corpus`)
  }

  console.log(`  phrases: ${inserted} inserted, ${skipped} already present`)

  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.phrases)
  console.log(`✓ seed complete — ${count?.n ?? 0} phrases in corpus`)

  await close()
}

main().catch((error) => {
  console.error('✗ seed failed:', error)
  process.exit(1)
})
