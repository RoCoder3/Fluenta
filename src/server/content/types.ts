/**
 * Shapes shared by every language's corpus.
 *
 * Extracted from german-corpus.ts once a second language existed. Nothing here
 * is language-specific: a corpus is a list of phrases, dialogues and scenarios,
 * and the life areas are the same human concerns whichever language you need
 * them in.
 */

export type CorpusPhrase = {
  text: string
  translation: string
  literal?: string
  context: string
  register: 'informal' | 'neutral' | 'formal' | 'professional' | 'slang'
  /** Regional standard this phrasing belongs to: 'DE'|'AT'|'CH', 'ES-CT'|'ES-VC'|'ES-IB'. */
  regionTag?: string
  naturalnessNote?: string
  difficulty: number
  cefrHint: string
  pronunciation?: string
  lifeAreaKeys: string[]
  grammarPatterns: string[]
  vocab: Array<{ lemma: string; translation: string; pos?: string; article?: string; plural?: string }>
  examples: Array<{ text: string; translation: string; note?: string }>
  tags: string[]
}

export type CorpusDialogue = {
  key: string
  lifeAreaKeys: string[]
  title: string
  situation: string
  level: string
  speakers: Array<{ label: string; role: string }>
  lines: Array<{ speaker: string; text: string; translation: string; note?: string }>
}

export type ScenarioTemplate = {
  key: string
  title: string
  lifeAreaKey: string
  situation: string
  difficulty: number
  learnerObjective: string
  persona: {
    name: string
    role: string
    /**
     * How the persona addresses the learner, in that language's own terms:
     * 'du'/'Sie' in German, 'tu'/'vostè' in Catalan. Deliberately a string —
     * every language cuts formality differently, and forcing them all into one
     * two-value enum would make the prompt lie about at least one of them.
     */
    register: string
    region: string
    personality: string
    openingLine: string
  }
  usefulPhrases: Array<{ text: string; translation: string }>
}

/**
 * The language-specific material the offline adapter needs but that isn't a
 * phrase, a dialogue or a scenario.
 *
 * This exists so the offline adapter can be a language-neutral engine over
 * per-language data. Before Catalan there was one hardcoded German assessment
 * and one hardcoded German mission list buried in the adapter, which would
 * have quietly handed German content to every Catalan learner — and since the
 * offline adapter is what runs whenever no API key is set, that is the default
 * experience, not an edge case.
 */
export type OfflineContent = {
  /** Placement items. Prompts are in the explanation language, answers in the target. */
  assessmentItems: Array<{
    id: string
    skill: 'reading' | 'listening' | 'comprehension' | 'vocabulary' | 'production'
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
    prompt: string
    kind: 'multiple_choice' | 'free_production' | 'short_answer'
    options?: string[]
    answer?: string
    audioText?: string
  }>
  missions: Array<{
    title: string
    description: string
    tier: 'beginner' | 'intermediate' | 'advanced'
    successCriteria: string[]
    preparationPhrases: Array<{ text: string; translation: string }>
  }>
  /** Partner replies used when a conversation runs without a live model. */
  conversationReplies: Array<{ reply: string; translation: string }>
  /** Sample production tasks for a generated lesson. */
  productionPrompts: Array<{
    prompt: string
    mode: 'writing' | 'speaking'
    situation: string
    hints: string[]
    sampleAnswer: string
  }>
  /** One genuinely useful grammar answer, for when the tutor is asked offline. */
  grammar: {
    patternKey: string
    simple: string
    detailed: string
    examples: Array<{ text: string; translation: string; note?: string }>
    comparison: string
  }
  /** Recombination example for the cross-domain engine. */
  crossDomain: {
    bridgePhrases: Array<{ text: string; translation: string; builtFrom: string[] }>
    miniStory: { title: string; text: string; translation: string; newElements: string[] }
    speakingPrompt: { prompt: string; situation: string; mustUse: string[] }
  }
  /**
   * Mechanically detectable slips — no model needed. Deliberately conservative:
   * a false correction is worse than a missed one.
   */
  correctionRules: Array<{
    pattern: RegExp
    correct: (m: RegExpMatchArray) => string
    why: string
    severity: 'minor' | 'notable' | 'blocking'
    errorType: string
  }>
  /** The roadmap objective about switching register, in this language's terms. */
  registerObjective: string
  /** Sentence for the placement summary, naming the language naturally. */
  comprehensionGapNote: string
}

/** One language's complete built-in content. */
export type ContentPack = {
  languageCode: string
  phrases: CorpusPhrase[]
  dialogues: CorpusDialogue[]
  scenarios: ScenarioTemplate[]
  offline: OfflineContent
}

/**
 * Default life areas offered during onboarding before anything is personalized.
 *
 * Shared across languages on purpose: these are areas of a life, not of a
 * language. Someone learning Catalan in Barcelona and someone learning German
 * in Zurich both have to deal with a landlord.
 */
export const DEFAULT_LIFE_AREAS = [
  { key: 'work', name: 'Work', description: 'Meetings, colleagues, explaining what you do', subAreas: ['introducing yourself', 'meetings', 'small talk', 'explaining problems', 'emails'] },
  { key: 'daily_life', name: 'Daily life', description: 'Shops, appointments, phone calls, getting around', subAreas: ['supermarket', 'appointments', 'public transport', 'phone calls'] },
  { key: 'social', name: 'Social life', description: 'Making friends, small talk, opinions, stories', subAreas: ['introductions', 'making friends', 'telling stories', 'expressing opinions'] },
  { key: 'bureaucracy', name: 'Bureaucracy', description: 'Offices, forms, insurance, registration', subAreas: ['registration', 'forms', 'insurance', 'official letters'] },
  { key: 'food', name: 'Food & restaurants', description: 'Ordering, menus, dietary needs', subAreas: ['restaurants', 'cafés', 'ordering', 'dietary requirements'] },
  { key: 'housing', name: 'Housing', description: 'Landlords, repairs, neighbours', subAreas: ['landlord', 'repairs', 'neighbours', 'viewing a flat'] },
  { key: 'healthcare', name: 'Healthcare', description: 'Doctors, pharmacies, symptoms', subAreas: ['booking appointments', 'describing symptoms', 'pharmacy'] },
  { key: 'travel', name: 'Travel', description: 'Trains, hotels, directions', subAreas: ['train station', 'hotels', 'asking directions', 'airport'] },
  { key: 'fitness', name: 'Fitness & sport', description: 'Gyms, clubs, activities', subAreas: ['gym', 'classes', 'sports clubs'] },
  { key: 'dating', name: 'Dating', description: 'Meeting people, flirting, plans', subAreas: ['first messages', 'dates', 'talking about yourself'] },
  { key: 'hobbies', name: 'Hobbies', description: 'Your interests, clubs, weekend plans', subAreas: ['describing interests', 'joining a club', 'weekend plans'] },
  { key: 'finance', name: 'Money & admin', description: 'Banks, bills, contracts', subAreas: ['bank', 'bills', 'contracts', 'cancelling'] },
] as const
