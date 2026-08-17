/**
 * The content registry.
 *
 * Every consumer of built-in content goes through `contentPackFor(code)` rather
 * than importing a corpus directly. That is the whole mechanism by which adding
 * a language is a data change: write a corpus, register it here, seed a
 * `languages` row. Nothing downstream needs to know the list.
 *
 * A language with no pack still works — it just has no built-in material, so
 * everything comes from live generation. That degrades honestly instead of
 * silently serving German phrases to a Catalan learner, which is what a single
 * hardcoded corpus would do.
 */

import { CATALAN_CORPUS, CATALAN_DIALOGUES, CATALAN_OFFLINE, CATALAN_SCENARIOS } from './catalan-corpus'
import { GERMAN_CORPUS, GERMAN_DIALOGUES, GERMAN_OFFLINE, GERMAN_SCENARIOS } from './german-corpus'
import type { ContentPack, CorpusPhrase } from './types'

export { DEFAULT_LIFE_AREAS } from './types'
export type {
  ContentPack,
  CorpusDialogue,
  CorpusPhrase,
  OfflineContent,
  ScenarioTemplate,
} from './types'

const PACKS: Record<string, ContentPack> = {
  de: {
    languageCode: 'de',
    phrases: GERMAN_CORPUS,
    dialogues: GERMAN_DIALOGUES,
    scenarios: GERMAN_SCENARIOS,
    offline: GERMAN_OFFLINE,
  },
  ca: {
    languageCode: 'ca',
    phrases: CATALAN_CORPUS,
    dialogues: CATALAN_DIALOGUES,
    scenarios: CATALAN_SCENARIOS,
    offline: CATALAN_OFFLINE,
  },
}

/**
 * The fallback pack for a language with no built-in content.
 *
 * Everything is empty rather than borrowed from another language. An empty
 * lesson is an obvious bug; a German lesson served to a Catalan learner is a
 * subtle one that could survive to production.
 */
const EMPTY_OFFLINE: ContentPack['offline'] = {
  assessmentItems: [],
  missions: [],
  conversationReplies: [],
  productionPrompts: [],
  grammar: { patternKey: 'none', simple: '', detailed: '', examples: [], comparison: '' },
  crossDomain: {
    bridgePhrases: [],
    miniStory: { title: '', text: '', translation: '', newElements: [] },
    speakingPrompt: { prompt: '', situation: '', mustUse: [] },
  },
  correctionRules: [],
  registerObjective: 'I can move between formal and informal address without thinking about it.',
  comprehensionGapNote: 'Your comprehension is ahead of your production. The plan weights speaking accordingly.',
}

const EMPTY: ContentPack = {
  languageCode: 'unknown',
  phrases: [],
  dialogues: [],
  scenarios: [],
  offline: EMPTY_OFFLINE,
}

/** Which languages ship with built-in content. */
export function languagesWithContent(): string[] {
  return Object.keys(PACKS)
}

export function contentPackFor(languageCode: string): ContentPack {
  return PACKS[languageCode] ?? { ...EMPTY, languageCode }
}

/** Phrases relevant to a set of life-area keys, best matches first. */
export function corpusForAreas(
  languageCode: string,
  areaKeys: string[],
  limit = 12,
): CorpusPhrase[] {
  const scored = contentPackFor(languageCode).phrases.map((phrase) => ({
    phrase,
    score: phrase.lifeAreaKeys.filter((k) => areaKeys.includes(k)).length,
  }))
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.phrase.difficulty - b.phrase.difficulty)
    .slice(0, limit)
    .map((s) => s.phrase)
}
