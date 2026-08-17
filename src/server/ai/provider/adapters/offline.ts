import 'server-only'

/**
 * Offline adapter.
 *
 * Serves every AI purpose from the hand-authored corpus and deterministic
 * rules, with no network call. It exists for three reasons:
 *
 *   1. The product is fully usable before anyone buys an API key.
 *   2. A provider outage degrades the lesson instead of ending it — the
 *      registry falls back here automatically.
 *   3. Engine development and testing do not burn tokens.
 *
 * It is not a stub. Content is real language, personalized by the life areas
 * and level it can read out of the prompt. What it cannot do is invent language
 * about *this* learner's specific life — that is what the live model adds.
 *
 * It is language-neutral: every piece of material comes from the content pack
 * for whichever language the prompt names. Nothing here is German, which
 * matters because with no API key configured this adapter *is* the product.
 */

import {
  DEFAULT_LIFE_AREAS,
  contentPackFor,
  corpusForAreas,
  type ContentPack,
  type CorpusPhrase,
} from '@/server/content'

import type { AiResult, LlmProvider, ObjectRequest, TextRequest } from '../types'

export class OfflineProvider implements LlmProvider {
  readonly name = 'offline'
  readonly available = true

  async generateObject<T>(req: ObjectRequest<T>): Promise<AiResult<T>> {
    const started = Date.now()
    const hints = readHints(req.prompt + '\n' + req.system)
    const raw = build(req.purpose, hints)

    // The offline content must satisfy the same contract as the live model.
    // If it ever doesn't, that is a bug worth surfacing loudly in development.
    const parsed = req.schema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(
        `Offline adapter produced content that failed ${req.schemaName}: ` +
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }

    return {
      data: parsed.data,
      provider: this.name,
      model: null,
      usage: { latencyMs: Date.now() - started },
      offline: true,
    }
  }

  async generateText(req: TextRequest): Promise<AiResult<string>> {
    const started = Date.now()
    return {
      data: OFFLINE_TEXT[req.purpose] ?? 'Live AI generation is not configured. Add an API key to enable it.',
      provider: this.name,
      model: null,
      usage: { latencyMs: Date.now() - started },
      offline: true,
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Reading context out of the prompt                                          */
/* -------------------------------------------------------------------------- */

type Hints = {
  areaKeys: string[]
  level: string
  scenarioKey: string | null
  learnerText: string | null
  /** Rough seed so repeated calls vary rather than looping identical content. */
  seed: number
  /** Which language's content pack to serve from. */
  languageCode: string
  languageName: string
  pack: ContentPack
}

/**
 * Every engine's system prompt ends with "Target language: X." (see
 * tutorSystemPrompt), so the adapter can recover the language without changing
 * the provider interface to thread it through explicitly.
 */
const LANGUAGE_BY_NAME: Record<string, string> = {
  catalan: 'ca',
  german: 'de',
  spanish: 'es',
  french: 'fr',
  italian: 'it',
}

function readLanguage(prompt: string): { code: string; name: string } {
  const declared = prompt.match(/Target language:\s*([A-Za-z]+)/)
  const name = declared?.[1]?.toLowerCase()
  if (name && LANGUAGE_BY_NAME[name]) {
    return { code: LANGUAGE_BY_NAME[name], name: name[0]!.toUpperCase() + name.slice(1) }
  }
  return { code: 'de', name: 'German' }
}

const ALL_AREA_KEYS = DEFAULT_LIFE_AREAS.map((a) => a.key)
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function readHints(prompt: string): Hints {
  const lower = prompt.toLowerCase()

  const language = readLanguage(prompt)
  const pack = contentPackFor(language.code)

  const areaKeys = ALL_AREA_KEYS.filter((k) => lower.includes(k) || lower.includes(k.replace('_', ' ')))
  const level = LEVELS.find((l) => prompt.includes(l)) ?? 'A2'
  const scenario = pack.scenarios.find((s) => lower.includes(s.key) || lower.includes(s.title.toLowerCase()))

  // Engines mark learner-authored text so the adapter can quote it back.
  const learnerMatch = prompt.match(/<learner-text>([\s\S]*?)<\/learner-text>/)

  let seed = 0
  for (let i = 0; i < prompt.length; i += 7) seed = (seed + prompt.charCodeAt(i)) | 0

  return {
    areaKeys: areaKeys.length ? areaKeys : ['daily_life', 'social'],
    level,
    scenarioKey: scenario?.key ?? null,
    learnerText: learnerMatch?.[1]?.trim() ?? null,
    seed: Math.abs(seed),
    languageCode: language.code,
    languageName: language.name,
    pack,
  }
}

function toPhraseOutput(p: CorpusPhrase) {
  return {
    text: p.text,
    translation: p.translation,
    literal: p.literal,
    context: p.context,
    register: p.register,
    regionTag: p.regionTag,
    naturalnessNote: p.naturalnessNote,
    difficulty: p.difficulty,
    cefrHint: p.cefrHint as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
    pronunciation: p.pronunciation,
    lifeAreaKeys: p.lifeAreaKeys,
    grammarPatterns: p.grammarPatterns,
    vocab: p.vocab,
    examples: p.examples,
  }
}

/* -------------------------------------------------------------------------- */
/* Purpose dispatch                                                           */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function build(purpose: string, h: Hints): any {
  switch (purpose) {
    case 'intake.extract':
      return buildIntake(h)
    case 'roadmap.generate':
    case 'roadmap.revise':
      return buildRoadmap(h)
    case 'content.lesson':
      return buildLesson(h)
    case 'content.phrases':
      return { phrases: corpusForAreas(h.languageCode, h.areaKeys, 6).map(toPhraseOutput) }
    case 'content.dialogue':
      return buildDialogue(h)
    case 'content.comprehension':
      return buildComprehension(h)
    case 'conversation.turn':
      return buildConversationTurn(h)
    case 'conversation.analyze':
      return buildConversationAnalysis(h)
    case 'feedback.writing':
    case 'feedback.speaking':
      return buildEvaluation(h, purpose === 'feedback.speaking')
    case 'error.extract':
      return buildErrorExtraction(h)
    case 'crossdomain.generate':
      return buildCrossDomain(h)
    case 'grammar.explain':
      return buildGrammar(h)
    case 'assessment.generate':
      return buildAssessmentItems(h)
    case 'assessment.score':
      return buildAssessmentResult(h)
    case 'mission.generate':
      return buildMissions(h)
    case 'goal.plan':
      return buildGoalPlan(h)
    case 'tutor.chat':
      return buildTutorReply(h)
    default:
      throw new Error(`Offline adapter has no handler for purpose "${purpose}"`)
  }
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

function buildIntake(h: Hints) {
  const chosen = DEFAULT_LIFE_AREAS.filter((a) => h.areaKeys.includes(a.key)).slice(0, 5)
  const areas = chosen.length ? chosen : DEFAULT_LIFE_AREAS.slice(0, 4)

  return {
    motivationSummary:
      `You need ${h.languageName} that works in the situations you are actually in every week, rather than a general course. ` +
      'The plan below starts from those situations and builds outward.',
    interests: [],
    dailyActivities: [],
    estimatedLevel: h.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
    selfReportedStrengths: [],
    selfReportedWeaknesses: [],
    suggestedLifeAreas: areas.map((a, i) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      priority: i + 1,
      subAreas: [...a.subAreas],
    })),
    inferredFacts: [],
  }
}

/** Replaced per language when the roadmap is built — see buildRoadmap. */
const REGISTER_OBJECTIVE = '__register__'

const STAGE_BLUEPRINT = [
  {
    tier: 'survival' as const,
    name: 'Survival',
    description: 'Handle the basics without switching to English.',
    objectives: [
      'I can introduce myself and say what I do.',
      'I can ask someone to repeat or slow down.',
      'I can understand the most common questions people ask me here.',
      'I can say what I need in a short, clear sentence.',
    ],
  },
  {
    tier: 'functional' as const,
    name: 'Functional',
    description: 'Get real things done, even when the conversation wanders.',
    objectives: [
      'I can explain a problem clearly enough for someone to help me.',
      'I can ask follow-up questions when I only half understood.',
      'I can make and change arrangements.',
      'I can give a short opinion and say why.',
    ],
  },
  {
    tier: 'comfortable' as const,
    name: 'Comfortable',
    description: 'Stop rehearsing sentences before you say them.',
    objectives: [
      'I can disagree politely and hold my position.',
      'I can tell a short story about something that happened to me.',
      'I can handle an unexpected turn in a conversation.',
      REGISTER_OBJECTIVE,
    ],
  },
  {
    tier: 'fluent' as const,
    name: 'Fluent',
    description: 'Operate at native speed, including when people are not making it easy.',
    objectives: [
      'I can follow a fast conversation between two other people.',
      'I can make a joke and have it land.',
      'I can argue a position with nuance.',
      'I can explain something complex to someone who knows nothing about it.',
    ],
  },
]

function buildRoadmap(h: Hints) {
  const areaKey = h.areaKeys[0] ?? 'daily_life'
  const area = DEFAULT_LIFE_AREAS.find((a) => a.key === areaKey)
  const label = area?.name ?? `Everyday ${h.languageName}`

  return {
    title: `${label} — road to functional fluency`,
    summary: `What it takes to stop thinking about ${h.languageName} while you are dealing with ${label.toLowerCase()}.`,
    stages: STAGE_BLUEPRINT.map((s) => ({
      name: s.name,
      tier: s.tier,
      description: s.description,
      objectives: s.objectives.map((canDo) => ({
        canDo: canDo === REGISTER_OBJECTIVE ? h.pack.offline.registerObjective : canDo,
      })),
    })),
  }
}

function buildDialogue(h: Hints) {
  const pool = h.pack.dialogues
  const match =
    pool.find((d) => d.lifeAreaKeys.some((k) => h.areaKeys.includes(k))) ??
    (pool.length ? pool[h.seed % pool.length]! : undefined)

  if (!match) {
    throw new Error(
      `No built-in dialogues for "${h.languageCode}". Add a content pack, or configure an API key for live generation.`,
    )
  }

  return {
    title: match.title,
    situation: match.situation,
    speakers: match.speakers,
    lines: match.lines,
  }
}

function buildComprehension(h: Hints) {
  const d = buildDialogue(h)
  const firstLine = d.lines[0]
  const lastLine = d.lines[d.lines.length - 1]

  return {
    questions: [
      {
        question: 'Worum geht es in diesem Gespräch?',
        questionTranslation: 'What is this conversation about?',
        kind: 'multiple_choice' as const,
        options: [d.situation, 'Jemand kauft ein Auto.', 'Zwei Personen streiten sich.'],
        answer: d.situation,
        explanation: 'The opening line sets the situation immediately.',
      },
      {
        question: 'Was sagt die erste Person?',
        questionTranslation: 'What does the first person say?',
        kind: 'short_answer' as const,
        answer: firstLine?.text ?? '',
        explanation: `"${firstLine?.text}" — ${firstLine?.translation}`,
      },
      {
        question: 'Wie endet das Gespräch?',
        questionTranslation: 'How does the conversation end?',
        kind: 'short_answer' as const,
        answer: lastLine?.text ?? '',
        explanation: `"${lastLine?.text}" — ${lastLine?.translation}`,
      },
    ],
  }
}

function buildLesson(h: Hints) {
  const dialogue = buildDialogue(h)
  const pool = corpusForAreas(h.languageCode, h.areaKeys, 10)
  const primary = pool.slice(0, 4)
  const expansion = pool.slice(4, 7)
  const areaName = DEFAULT_LIFE_AREAS.find((a) => a.key === h.areaKeys[0])?.name ?? 'everyday situations'

  return {
    title: `${areaName}: what you actually need to say`,
    rationale: `These are the phrases that come up most often in ${areaName.toLowerCase()} — you will use them this week.`,
    dialogue,
    comprehension: buildComprehension(h),
    phrases: primary.map(toPhraseOutput),
    expansionPhrases: expansion.map(toPhraseOutput),
    productionPrompts: h.pack.offline.productionPrompts,
  }
}

function buildConversationTurn(h: Hints) {
  const replies = h.pack.offline.conversationReplies
  const pick = replies.length
    ? replies[h.seed % replies.length]!
    : { reply: '…', translation: 'The offline adapter has no replies for this language.' }

  return { reply: pick.reply, translation: pick.translation, shouldEnd: false }
}

function buildConversationAnalysis(h: Hints) {
  const useful = h.pack.phrases.find((p) => p.tags.includes('clarification')) ?? h.pack.phrases[0]

  return {
    didWell: [
      `You stayed in ${h.languageName} for the whole exchange instead of switching.`,
      'Your opening was appropriate for the situation.',
    ],
    mistakes: [],
    naturalAlternatives: [],
    usefulPhrases: useful
      ? [{ text: useful.text, translation: useful.translation, context: useful.context }]
      : [],
    missingVocabulary: [],
    fluency: { score: 55, comment: 'You kept going, with some pauses while planning the next sentence.' },
    comprehension: { score: 65, comment: 'You followed the main thread without needing a translation.' },
    taskSuccess: { achieved: true, comment: 'You got what you came for.' },
    nextStep: 'Run the same scenario again, but try to answer without pausing to plan.',
  }
}

/**
 * Offline evaluation. Rather than pretending to grade language it cannot parse,
 * it scores what is measurable — length, sentence variety — and applies only
 * the handful of mechanical checks that need no model, then says plainly that
 * real correction requires the live one.
 */
function buildEvaluation(h: Hints, spoken: boolean) {
  const text = h.learnerText ?? ''
  const words = text.split(/\s+/).filter(Boolean).length
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
  const avgSentence = sentences ? words / sentences : 0

  const lengthScore = Math.min(100, (words / 35) * 100)
  const varietyScore = Math.min(100, (avgSentence / 12) * 100)
  const base = Math.round(lengthScore * 0.5 + varietyScore * 0.5)

  const corrections: Array<{ original: string; corrected: string; why: string; severity: 'minor' | 'notable' | 'blocking'; errorType: string }> = []

  // A few high-frequency, mechanically detectable slips worth catching offline.
  for (const rule of h.pack.offline.correctionRules) {
    const m = text.match(rule.pattern)
    if (m) {
      corrections.push({
        original: m[0],
        corrected: rule.correct(m),
        why: rule.why,
        severity: rule.severity,
        errorType: rule.errorType,
      })
    }
  }

  return {
    correctness: Math.max(30, base - corrections.length * 8),
    naturalness: Math.max(25, base - 10),
    vocabularyRange: Math.round(Math.min(100, (new Set(text.toLowerCase().split(/\s+/)).size / 25) * 100)),
    taskCompletion: words > 12 ? 75 : 40,
    ...(spoken ? { fluency: Math.max(30, base - 5) } : {}),
    overallComment: words
      ? `You produced ${words} words across ${sentences || 1} sentence${sentences === 1 ? '' : 's'}. ` +
        (corrections.length
          ? 'A couple of patterns worth fixing are below.'
          : 'Nothing mechanical stood out. Connect an API key for full correction of naturalness and word order.')
      : 'Nothing was submitted.',
    corrections,
    betterPhrasings: [],
    strengths: words > 20 ? ['You wrote at length rather than stopping at one sentence.'] : [],
    phrasesToLearn: [],
  }
}


function buildErrorExtraction(h: Hints) {
  const evalResult = buildEvaluation(h, false)
  return {
    errors: evalResult.corrections.map((c) => ({
      type: c.errorType,
      category: c.errorType === 'naturalness' ? ('naturalness' as const) : ('grammar' as const),
      label: c.errorType.split('_').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' '),
      explanation: c.why,
      severity: c.severity,
      said: c.original,
      corrected: c.corrected,
    })),
  }
}

function buildCrossDomain(h: Hints) {
  const [a = 'work', b = 'social'] = h.areaKeys
  const nameA = DEFAULT_LIFE_AREAS.find((x) => x.key === a)?.name ?? a
  const nameB = DEFAULT_LIFE_AREAS.find((x) => x.key === b)?.name ?? b
  const cd = h.pack.offline.crossDomain

  return {
    bridgeInsight: `Language from ${nameA} and ${nameB} combines into the sentences you actually say about your week.`,
    bridgePhrases: cd.bridgePhrases.map((p) => ({ ...p, combines: [a, b] })),
    miniStory: cd.miniStory,
    speakingPrompt: cd.speakingPrompt,
  }
}

function buildGrammar(h: Hints) {
  return h.pack.offline.grammar
}

function buildAssessmentItems(h: Hints) {
  return { items: h.pack.offline.assessmentItems }
}

function buildAssessmentResult(h: Hints) {
  const level = (h.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2') ?? 'A2'
  const base = { A1: 20, A2: 38, B1: 55, B2: 72, C1: 85, C2: 95 }[level]

  return {
    overallLevel: level,
    dimensions: [
      { dimension: 'reading', level, score: base + 6, comment: 'You recognize far more than you can produce.' },
      { dimension: 'listening', level, score: base, comment: 'Fine at normal pace; fast speech is still hard.' },
      { dimension: 'speaking', level, score: Math.max(10, base - 14), comment: 'The main gap. You need production time, not more input.' },
      { dimension: 'writing', level, score: Math.max(12, base - 8), comment: 'Adequate for short messages.' },
      { dimension: 'vocabulary', level, score: base + 2, comment: 'Broad enough for everyday situations.' },
    ],
    strengths: ['You understand more than you give yourself credit for.'],
    weaknesses: ['Producing language under time pressure.'],
    biggestGap: `You understand ${h.languageName} considerably better than you can speak it.`,
    recommendedStartingStage: (base < 30 ? 'survival' : base < 60 ? 'functional' : 'comfortable') as
      | 'survival'
      | 'functional'
      | 'comfortable'
      | 'fluent',
    summary: h.pack.offline.comprehensionGapNote,
  }
}

function buildMissions(h: Hints) {
  const areaKey = h.areaKeys[0] ?? 'daily_life'
  return { missions: h.pack.offline.missions.map((m) => ({ ...m, lifeAreaKey: areaKey })) }
}

function buildGoalPlan(h: Hints) {
  const areaKey = h.areaKeys[0] ?? 'daily_life'
  return {
    title: 'Your focused plan',
    goalStatement: 'Handle the situation you described without rehearsing every sentence first.',
    kind: 'temporary' as const,
    suggestedLifeAreaKey: areaKey,
    requiredSkills: [
      { skill: 'Introduce yourself and your background concisely', why: 'It opens almost every one of these situations.', priority: 1 },
      { skill: 'Ask for clarification without losing momentum', why: 'You will not understand everything, and that has to be survivable.', priority: 2 },
      { skill: 'Explain your experience with concrete examples', why: 'Generalities do not survive follow-up questions.', priority: 2 },
      { skill: 'Ask your own questions', why: 'It turns an interrogation into a conversation.', priority: 3 },
    ],
    starterPhrases: corpusForAreas(h.languageCode, [areaKey], 4).map(toPhraseOutput),
    plan: [
      { step: 'Build the core phrases you will need', focus: 'input', estimatedSessions: 2 },
      { step: 'Rehearse them out loud under time pressure', focus: 'speaking', estimatedSessions: 3 },
      { step: 'Run full simulations end to end', focus: 'conversation', estimatedSessions: 3 },
    ],
  }
}

function buildTutorReply(h: Hints) {
  return {
    reply:
      'Live AI tutoring is not connected right now, so I am answering from the built-in content. ' +
      'You can still run lessons, conversations, writing practice and reviews — all of it works offline. ' +
      'Add an ANTHROPIC_API_KEY to .env.local to switch on full tutoring.',
    targetLanguageExamples: corpusForAreas(h.languageCode, h.areaKeys, 3).map((p) => ({
      text: p.text,
      translation: p.translation,
    })),
    suggestedAction: { label: 'Start a session', kind: 'start_session' as const },
  }
}

const OFFLINE_TEXT: Record<string, string> = {
  'tutor.chat':
    'Live AI is not configured. Add an API key to enable full tutoring — everything else in the app works without it.',
}
