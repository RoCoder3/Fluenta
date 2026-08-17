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
 * It is not a stub. Content is real German, personalized by the life areas and
 * level it can read out of the prompt. What it cannot do is invent language
 * about *this* learner's specific life — that is what the live model adds.
 */

import { DEFAULT_LIFE_AREAS, GERMAN_CORPUS, GERMAN_DIALOGUES, SCENARIOS, corpusForAreas, type CorpusPhrase } from '@/server/content/german-corpus'

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
}

const ALL_AREA_KEYS = DEFAULT_LIFE_AREAS.map((a) => a.key)
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function readHints(prompt: string): Hints {
  const lower = prompt.toLowerCase()

  const areaKeys = ALL_AREA_KEYS.filter((k) => lower.includes(k) || lower.includes(k.replace('_', ' ')))
  const level = LEVELS.find((l) => prompt.includes(l)) ?? 'A2'
  const scenario = SCENARIOS.find((s) => lower.includes(s.key) || lower.includes(s.title.toLowerCase()))

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
      return { phrases: corpusForAreas(h.areaKeys, 6).map(toPhraseOutput) }
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
      return buildAssessmentItems()
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
      'You need German that works in the situations you are actually in every week, rather than a general course. ' +
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
      'I can adjust between du and Sie without thinking about it.',
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
  const label = area?.name ?? 'Everyday German'

  return {
    title: `${label} — road to functional fluency`,
    summary: `What it takes to stop thinking about German while you are dealing with ${label.toLowerCase()}.`,
    stages: STAGE_BLUEPRINT.map((s) => ({
      name: s.name,
      tier: s.tier,
      description: s.description,
      objectives: s.objectives.map((canDo) => ({ canDo })),
    })),
  }
}

function buildDialogue(h: Hints) {
  const match =
    GERMAN_DIALOGUES.find((d) => d.lifeAreaKeys.some((k) => h.areaKeys.includes(k))) ??
    GERMAN_DIALOGUES[h.seed % GERMAN_DIALOGUES.length] ??
    GERMAN_DIALOGUES[0]!

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
  const pool = corpusForAreas(h.areaKeys, 10)
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
    productionPrompts: [
      {
        prompt: 'A colleague asks what you have on today. Answer them in two or three sentences.',
        mode: 'writing' as const,
        situation: 'Monday morning, standing by the coffee machine.',
        hints: ['Was steht heute bei dir an?', 'Ich muss …', 'Danach …'],
        sampleAnswer:
          'Heute muss ich eine Präsentation vorbereiten. Danach habe ich noch zwei Meetings. Und bei dir?',
      },
      {
        prompt: 'Say out loud what you did last weekend. Keep going for at least 30 seconds.',
        mode: 'speaking' as const,
        situation: 'Answering the standard Monday question.',
        hints: ['Ich war …', 'Am Samstag …', 'Am Sonntag habe ich …'],
        sampleAnswer:
          'Am Samstag war ich klettern, das war ziemlich anstrengend. Am Sonntag habe ich nur gekocht und gelesen. Ganz ruhig also.',
      },
    ],
  }
}

function buildConversationTurn(h: Hints) {
  const scenario = SCENARIOS.find((s) => s.key === h.scenarioKey) ?? SCENARIOS[h.seed % SCENARIOS.length]!
  const replies = [
    { reply: 'Alles klar. Und sonst noch etwas?', translation: 'All right. And anything else?' },
    { reply: 'Verstehe. Können Sie mir das kurz genauer erklären?', translation: 'I see. Could you explain that in a bit more detail?' },
    { reply: 'Gut, das machen wir so. Passt das für Sie?', translation: 'Good, let us do it that way. Does that work for you?' },
    { reply: 'Mhm, und wie sieht es zeitlich bei Ihnen aus?', translation: 'Mhm, and how are you placed for time?' },
  ]
  const pick = replies[h.seed % replies.length]!

  return {
    reply: pick.reply,
    translation: pick.translation,
    shouldEnd: false,
    ...(scenario ? {} : {}),
  }
}

function buildConversationAnalysis(_h: Hints) {
  return {
    didWell: [
      'You stayed in German for the whole exchange instead of switching to English.',
      'Your opening was appropriate for the situation.',
    ],
    mistakes: [],
    naturalAlternatives: [
      { instead: 'Ich will einen Kaffee.', say: 'Ich hätte gern einen Kaffee.' },
    ],
    usefulPhrases: [
      { text: 'Könnten Sie das bitte wiederholen?', translation: 'Could you repeat that please?', context: 'When you miss something and need it again.' },
    ],
    missingVocabulary: [],
    fluency: { score: 55, comment: 'You kept going, with some pauses while planning the next sentence.' },
    comprehension: { score: 65, comment: 'You followed the main thread without needing a translation.' },
    taskSuccess: { achieved: true, comment: 'You got what you came for.' },
    nextStep: 'Run the same scenario again, but try to answer without pausing to plan.',
  }
}

/**
 * Offline evaluation. Rather than pretending to grade German it cannot parse,
 * it scores what is measurable — length, sentence variety, use of known
 * structures — and is explicit that deep correction needs the live model.
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
  for (const rule of OFFLINE_RULES) {
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

/** Mechanical checks that do not need a model. Deliberately conservative. */
const OFFLINE_RULES: Array<{
  pattern: RegExp
  correct: (m: RegExpMatchArray) => string
  why: string
  severity: 'minor' | 'notable' | 'blocking'
  errorType: string
}> = [
  {
    pattern: /\bzu der (\w+)/i,
    correct: (m) => `zur ${m[1]}`,
    why: '"zu der" is almost always contracted to "zur" in speech and writing.',
    severity: 'minor',
    errorType: 'preposition_contraction',
  },
  {
    pattern: /\bzu dem (\w+)/i,
    correct: (m) => `zum ${m[1]}`,
    why: '"zu dem" contracts to "zum".',
    severity: 'minor',
    errorType: 'preposition_contraction',
  },
  {
    pattern: /\bin dem (\w+)/i,
    correct: (m) => `im ${m[1]}`,
    why: '"in dem" contracts to "im" unless you are stressing "that particular one".',
    severity: 'minor',
    errorType: 'preposition_contraction',
  },
  {
    pattern: /\bich bin \d+ jahre alt\b/i,
    correct: () => 'ich bin … Jahre alt',
    why: 'Correct, but Germans usually just say the number: "Ich bin 34."',
    severity: 'minor',
    errorType: 'naturalness',
  },
]

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

  return {
    bridgeInsight: `Language from ${nameA} and ${nameB} combines into the sentences you actually say about your week.`,
    bridgePhrases: [
      {
        text: 'Morgen muss ich eine Präsentation halten, deshalb habe ich heute wenig Zeit.',
        translation: 'I have to give a presentation tomorrow, so I have little time today.',
        combines: [a, b],
        builtFrom: ['Ich muss morgen eine Präsentation halten.'],
      },
      {
        text: 'Nach der Arbeit gehe ich noch schnell einkaufen und danach ins Fitnessstudio.',
        translation: 'After work I am quickly going shopping and then to the gym.',
        combines: [a, b],
        builtFrom: ['Ich muss noch Gemüse kaufen.', 'Ich muss heute noch trainieren.'],
      },
    ],
    miniStory: {
      title: 'Ein ganz normaler Dienstag',
      text: 'Heute war viel los. Am Morgen hatte ich zwei Meetings, und danach musste ich noch eine Präsentation vorbereiten. Am Abend war ich kurz einkaufen, weil nichts mehr im Kühlschrank war. Trainieren habe ich nicht geschafft. Morgen dann.',
      translation:
        'A lot was going on today. In the morning I had two meetings, and after that I still had to prepare a presentation. In the evening I went shopping briefly because there was nothing left in the fridge. I did not manage to train. Tomorrow then.',
      newElements: ['weil nichts mehr im Kühlschrank war', 'Morgen dann.'],
    },
    speakingPrompt: {
      prompt: 'Describe your day in a way that connects work with what you do afterwards.',
      situation: 'A colleague asks how your week is going.',
      mustUse: ['Ich muss …', 'deshalb', 'danach'],
    },
  }
}

function buildGrammar(h: Hints) {
  return {
    patternKey: 'preposition_contraction',
    simple:
      'German merges some prepositions with the article that follows: "zu dem" becomes "zum", "zu der" becomes "zur", "in dem" becomes "im". ' +
      'You do not need to memorize a rule — you will see these constantly and they will start to sound wrong uncontracted.',
    detailed:
      'The contraction happens with dative articles after common prepositions: an/bei/in/von/zu + dem → am, beim, im, vom, zum; zu + der → zur. ' +
      'German keeps the uncontracted form only when it is stressing a specific item — "Ich gehe zu dem Arzt, den du empfohlen hast" (that particular doctor). ' +
      'In every ordinary sentence, contract.',
    examples: [
      { text: 'Ich gehe zum Supermarkt.', translation: 'I am going to the supermarket.' },
      { text: 'Ich fahre zur Arbeit.', translation: 'I am driving to work.' },
      { text: 'Wir treffen uns im Büro.', translation: 'We are meeting in the office.' },
    ],
    comparison:
      'English has nothing like this, which is why learners keep writing "zu dem". It is the single most common giveaway in beginner German.',
  }
}

function buildAssessmentItems() {
  return {
    items: [
      {
        id: 'a1-read-1',
        skill: 'reading' as const,
        level: 'A1' as const,
        prompt: 'Was bedeutet: "Ich komme aus Italien."?',
        kind: 'multiple_choice' as const,
        options: ['I come from Italy.', 'I am going to Italy.', 'I live in Italy.'],
        answer: 'I come from Italy.',
      },
      {
        id: 'a2-read-1',
        skill: 'reading' as const,
        level: 'A2' as const,
        prompt: 'Was bedeutet: "Ich muss leider meinen Termin verschieben."?',
        kind: 'multiple_choice' as const,
        options: [
          'Unfortunately I have to reschedule my appointment.',
          'I would like to book an appointment.',
          'I have missed my appointment.',
        ],
        answer: 'Unfortunately I have to reschedule my appointment.',
      },
      {
        id: 'a2-listen-1',
        skill: 'listening' as const,
        level: 'A2' as const,
        prompt: 'Listen, then choose what was said.',
        audioText: 'Können wir das morgen kurz besprechen?',
        kind: 'multiple_choice' as const,
        options: [
          'Can we discuss that briefly tomorrow?',
          'Did we discuss that yesterday?',
          'We must decide that today.',
        ],
        answer: 'Can we discuss that briefly tomorrow?',
      },
      {
        id: 'b1-read-1',
        skill: 'comprehension' as const,
        level: 'B1' as const,
        prompt:
          'Was bedeutet: "Ich bin mir nicht ganz sicher, ob das bis Freitag klappt."?',
        kind: 'multiple_choice' as const,
        options: [
          "I'm not entirely sure whether that will work out by Friday.",
          'It definitely will not work by Friday.',
          'I promise it will be done by Friday.',
        ],
        answer: "I'm not entirely sure whether that will work out by Friday.",
      },
      {
        id: 'b1-listen-1',
        skill: 'listening' as const,
        level: 'B1' as const,
        prompt: 'Listen, then choose what was said.',
        audioText: 'Sag Bescheid, wenn du Hilfe brauchst — ich hab heute eh wenig zu tun.',
        kind: 'multiple_choice' as const,
        options: [
          'Let me know if you need help — I do not have much on today anyway.',
          'I need help today because I have a lot on.',
          'Tell me when you have finished the work.',
        ],
        answer: 'Let me know if you need help — I do not have much on today anyway.',
      },
      {
        id: 'b2-vocab-1',
        skill: 'vocabulary' as const,
        level: 'B2' as const,
        prompt: 'Which is the most natural way to disagree politely with a colleague?',
        kind: 'multiple_choice' as const,
        options: [
          'Ehrlich gesagt sehe ich das ein bisschen anders.',
          'Du hast unrecht.',
          'Das ist falsch.',
        ],
        answer: 'Ehrlich gesagt sehe ich das ein bisschen anders.',
      },
      {
        id: 'prod-1',
        skill: 'production' as const,
        level: 'A2' as const,
        prompt:
          'In German: tell a colleague what you have on today. Two or three sentences. Write what you can — imperfect is fine.',
        kind: 'free_production' as const,
      },
    ],
  }
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
    biggestGap: 'You understand German considerably better than you can speak it.',
    recommendedStartingStage: (base < 30 ? 'survival' : base < 60 ? 'functional' : 'comfortable') as
      | 'survival'
      | 'functional'
      | 'comfortable'
      | 'fluent',
    summary:
      'Your comprehension is ahead of your production, which is the usual pattern for people living in a German-speaking country without speaking much. The plan weights speaking accordingly.',
  }
}

function buildMissions(h: Hints) {
  const areaKey = h.areaKeys[0] ?? 'daily_life'
  const catalogue = [
    {
      title: 'Order your coffee entirely in German',
      description: 'Go to a café and complete the whole exchange in German, including paying. Do not switch, even if they do.',
      tier: 'beginner' as const,
      successCriteria: ['You ordered without English', 'You understood the price', 'You responded to at least one unexpected question'],
      preparationPhrases: [
        { text: 'Einen Kaffee, bitte.', translation: 'A coffee, please.' },
        { text: 'Zum Mitnehmen, bitte.', translation: 'To take away, please.' },
      ],
    },
    {
      title: 'Ask a colleague how their weekend was — and follow up twice',
      description: 'Start the conversation and keep it going with two follow-up questions rather than letting it die.',
      tier: 'intermediate' as const,
      successCriteria: ['You opened in German', 'You asked two follow-ups', 'The exchange lasted over a minute'],
      preparationPhrases: [
        { text: 'Wie war dein Wochenende?', translation: 'How was your weekend?' },
        { text: 'Und was hast du da gemacht?', translation: 'And what did you do there?' },
      ],
    },
    {
      title: 'Make a phone call to book something',
      description: 'Phone a doctor, hairdresser or restaurant and book an appointment. Phone calls remove all the visual cues — this is the real test.',
      tier: 'intermediate' as const,
      successCriteria: ['You stated your purpose', 'You agreed a time', 'You confirmed what to bring'],
      preparationPhrases: [
        { text: 'Ich möchte einen Termin vereinbaren.', translation: 'I would like to make an appointment.' },
        { text: 'Könnten Sie das bitte wiederholen?', translation: 'Could you repeat that, please?' },
      ],
    },
    {
      title: 'Explain a work problem in German',
      description: 'In your next standup or one-to-one, explain one thing that is blocked and what you need — in German.',
      tier: 'advanced' as const,
      successCriteria: ['You explained the cause', 'You said what you need', 'You handled a follow-up question'],
      preparationPhrases: [
        { text: 'Ich bin gerade blockiert, weil …', translation: "I'm currently blocked because …" },
        { text: 'Könntest du mir dabei helfen?', translation: 'Could you help me with that?' },
      ],
    },
  ]

  return { missions: catalogue.map((m) => ({ ...m, lifeAreaKey: areaKey })) }
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
    starterPhrases: corpusForAreas([areaKey], 4).map(toPhraseOutput),
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
    targetLanguageExamples: corpusForAreas(h.areaKeys, 3).map((p) => ({
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
