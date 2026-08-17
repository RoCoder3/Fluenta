/**
 * Language display names.
 *
 * Dependency-free and outside `server-only` on purpose: prompts, the learner
 * model and client components all need to name a language, and this is the one
 * place that does it. The database `languages` table is the source of truth for
 * what exists; this is only for text that has to read naturally in a sentence.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  ca: 'Catalan',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
}

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase()
}
