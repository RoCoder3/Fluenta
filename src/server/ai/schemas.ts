import { z } from 'zod'

/**
 * Structured-output contracts for every AI engine.
 *
 * These are the interface between the model and the database. They are kept
 * deliberately plain (objects, arrays, scalars, enums, .describe()) because
 * they are converted to JSON Schema and handed to the model as a tool
 * definition — refinements and transforms would not survive the trip.
 *
 * The `.describe()` calls are not documentation. They are the prompt.
 */

/* -------------------------------------------------------------------------- */
/* Shared fragments                                                           */
/* -------------------------------------------------------------------------- */

export const cefrLevel = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export const registerEnum = z
  .enum(['informal', 'neutral', 'formal', 'professional', 'slang'])
  .describe('informal = du with friends; formal/professional = Sie at work or with officials')

export const severityEnum = z.enum(['minor', 'notable', 'blocking'])

export const vocabItemSchema = z.object({
  lemma: z.string().describe('Dictionary form of the word'),
  translation: z.string(),
  pos: z.string().optional().describe('noun, verb, adjective, …'),
  article: z.string().optional().describe('For German nouns: der, die or das'),
  plural: z.string().optional(),
})

/** The atomic unit of the whole product. Never generate a bare word list. */
export const phraseSchema = z.object({
  text: z.string().describe('The phrase in the target language, as a native speaker would really say it'),
  translation: z.string().describe('Natural meaning in the explanation language — not word-for-word'),
  literal: z.string().optional().describe('Word-for-word gloss, only when it helps reveal structure'),
  context: z
    .string()
    .describe('The concrete situation where you would say this. Specific to the learner, never generic.'),
  register: registerEnum,
  regionTag: z
    .string()
    .optional()
    .describe("'DE', 'AT' or 'CH' when phrasing is region-specific; omit when pan-regional"),
  naturalnessNote: z
    .string()
    .optional()
    .describe('Set when a learner would likely say something grammatical but stilted instead'),
  difficulty: z.number().int().min(1).max(5),
  cefrHint: cefrLevel.optional(),
  pronunciation: z.string().optional().describe('Syllables with stress marked, e.g. ver-EIN-ba-ren'),
  lifeAreaKeys: z.array(z.string()).describe('Which of the learner\'s life areas this serves'),
  grammarPatterns: z
    .array(z.string())
    .describe('Slugs like dative_after_mit, verb_second, modal_verb — recorded, not drilled'),
  vocab: z.array(vocabItemSchema).describe('Supporting words carried by this phrase'),
  examples: z
    .array(z.object({ text: z.string(), translation: z.string(), note: z.string().optional() }))
    .describe('The same expression in one or two different situations'),
})

export type GeneratedPhrase = z.infer<typeof phraseSchema>

/* -------------------------------------------------------------------------- */
/* Intake — free text → structured learner profile (§7)                       */
/* -------------------------------------------------------------------------- */

export const intakeExtractionSchema = z.object({
  motivationSummary: z
    .string()
    .describe('One paragraph, second person, describing why this person needs the language'),
  city: z.string().optional(),
  country: z.string().optional(),
  regionPreference: z
    .string()
    .optional()
    .describe("'DE', 'AT' or 'CH' — which standard is actually useful where they live"),
  profession: z.string().optional(),
  industry: z.string().optional(),
  interests: z.array(z.string()),
  dailyActivities: z.array(z.string()),
  estimatedLevel: cefrLevel.optional().describe('Rough guess from how they describe themselves'),
  selfReportedStrengths: z.array(z.string()),
  selfReportedWeaknesses: z.array(z.string()),
  suggestedLifeAreas: z
    .array(
      z.object({
        key: z.string().describe('snake_case slug, e.g. work, daily_life, bureaucracy'),
        name: z.string(),
        description: z.string().describe('What functioning in this area means for this specific person'),
        priority: z.number().int().min(1).max(5).describe('1 = most urgent'),
        subAreas: z.array(z.string()).describe('Concrete situations inside this area'),
      }),
    )
    .describe('Between 3 and 7 areas, drawn from what the person actually described'),
  inferredFacts: z
    .array(z.object({ fact: z.string(), confidence: z.number().min(0).max(1) }))
    .describe('Things implied but not stated outright — used to personalize without interrogating'),
})

/* -------------------------------------------------------------------------- */
/* Roadmap (§5)                                                               */
/* -------------------------------------------------------------------------- */

export const roadmapSchema = z.object({
  title: z.string(),
  summary: z.string().describe('What being functional in this area looks like for this person'),
  stages: z
    .array(
      z.object({
        name: z.string(),
        tier: z.enum(['survival', 'functional', 'comfortable', 'fluent']),
        description: z.string(),
        objectives: z
          .array(
            z.object({
              canDo: z
                .string()
                .describe('A first-person can-do statement: "I can explain why a deploy failed."'),
            }),
          )
          .describe('3 to 6 concrete, testable abilities'),
      }),
    )
    .describe('Exactly four stages, survival through fluent'),
})

/* -------------------------------------------------------------------------- */
/* Lesson content (§10)                                                       */
/* -------------------------------------------------------------------------- */

export const dialogueSchema = z.object({
  title: z.string(),
  situation: z.string().describe('One line setting the scene, in the explanation language'),
  speakers: z.array(z.object({ label: z.string(), role: z.string() })),
  lines: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      translation: z.string(),
      note: z.string().optional().describe('Only when something is idiomatic or regionally marked'),
    }),
  ),
})

export const comprehensionSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe('Asked in the target language when the learner can handle it'),
      questionTranslation: z.string(),
      kind: z.enum(['multiple_choice', 'short_answer']),
      options: z.array(z.string()).optional(),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
})

export const lessonSchema = z.object({
  title: z.string(),
  rationale: z.string().describe('One sentence to the learner explaining why this, right now'),
  dialogue: dialogueSchema,
  comprehension: comprehensionSchema,
  phrases: z.array(phraseSchema).describe('New phrases introduced by this lesson'),
  expansionPhrases: z.array(phraseSchema).describe('Related variations on the same function'),
  productionPrompts: z.array(
    z.object({
      prompt: z.string().describe('In the explanation language — what to say or write'),
      mode: z.enum(['writing', 'speaking']),
      situation: z.string(),
      hints: z.array(z.string()),
      sampleAnswer: z.string().describe('One good answer, revealed only after they try'),
    }),
  ),
})

/* -------------------------------------------------------------------------- */
/* Feedback on learner output (§12, §13)                                      */
/* -------------------------------------------------------------------------- */

export const productionEvaluationSchema = z.object({
  correctness: z.number().min(0).max(100),
  naturalness: z.number().min(0).max(100).describe('Would a native actually phrase it this way?'),
  vocabularyRange: z.number().min(0).max(100),
  taskCompletion: z.number().min(0).max(100).describe('Did they achieve the communicative goal?'),
  toneMatch: z.number().min(0).max(100).optional().describe('du/Sie and formality appropriateness'),
  fluency: z.number().min(0).max(100).optional().describe('Speaking only'),
  overallComment: z
    .string()
    .describe('Warm, specific, two or three sentences. Lead with what worked.'),
  corrections: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        why: z.string().describe('Plain language. No grammar jargon unless the learner asked for it.'),
        severity: severityEnum,
        errorType: z
          .string()
          .describe('Stable slug for the error memory: dative_accusative, verb_second, article_gender, …'),
      }),
    )
    .describe('Only errors worth mentioning. Do not correct every deviation.'),
  betterPhrasings: z
    .array(z.object({ instead: z.string(), say: z.string(), why: z.string() }))
    .describe('Grammatically fine but unidiomatic — the difference between correct and natural'),
  strengths: z.array(z.string()),
  phrasesToLearn: z
    .array(z.object({ text: z.string(), translation: z.string(), context: z.string() }))
    .describe('Language they reached for and did not have'),
})

/* -------------------------------------------------------------------------- */
/* Conversation simulator (§11)                                               */
/* -------------------------------------------------------------------------- */

export const conversationSetupSchema = z.object({
  scenarioTitle: z.string(),
  situation: z.string().describe('What is happening, in the explanation language'),
  persona: z.object({
    name: z.string(),
    role: z.string(),
    register: z.enum(['du', 'Sie']),
    region: z.string().describe('DE, AT or CH'),
    personality: z.string().describe('Brief; keeps the character consistent across turns'),
    openingLine: z.string().describe('Their first line, in the target language'),
  }),
  learnerObjective: z.string().describe('What the learner is trying to accomplish'),
  usefulPhrases: z.array(z.object({ text: z.string(), translation: z.string() })),
})

export const conversationTurnSchema = z.object({
  reply: z.string().describe('In character, in the target language. Never break character.'),
  translation: z.string(),
  /** Set only when the learner is genuinely stuck — not on every turn. */
  nudge: z.string().optional().describe('A gentle hint, only if they appear blocked'),
  shouldEnd: z.boolean().describe('True when the scenario has reached a natural close'),
})

export const conversationAnalysisSchema = z.object({
  didWell: z.array(z.string()),
  mistakes: z.array(
    z.object({
      said: z.string(),
      better: z.string(),
      why: z.string(),
      severity: severityEnum,
      errorType: z.string(),
    }),
  ),
  naturalAlternatives: z.array(z.object({ instead: z.string(), say: z.string() })),
  usefulPhrases: z.array(z.object({ text: z.string(), translation: z.string(), context: z.string() })),
  missingVocabulary: z.array(z.object({ lemma: z.string(), translation: z.string(), whyUseful: z.string() })),
  fluency: z.object({ score: z.number().min(0).max(100), comment: z.string() }),
  comprehension: z.object({ score: z.number().min(0).max(100), comment: z.string() }),
  taskSuccess: z.object({ achieved: z.boolean(), comment: z.string() }),
  nextStep: z.string(),
})

/* -------------------------------------------------------------------------- */
/* Cross-domain fluency engine (§6)                                           */
/* -------------------------------------------------------------------------- */

export const crossDomainSchema = z.object({
  bridgeInsight: z
    .string()
    .describe('One line naming the connection being made between the learner\'s areas'),
  bridgePhrases: z.array(
    z.object({
      text: z.string().describe('A sentence combining language from two or more different areas'),
      translation: z.string(),
      combines: z.array(z.string()).describe('Which life-area keys it draws together'),
      builtFrom: z.array(z.string()).describe('The known phrases it recombines'),
    }),
  ),
  miniStory: z
    .object({
      title: z.string(),
      text: z.string().describe('4–8 sentences about this learner\'s actual life, reusing known language'),
      translation: z.string(),
      newElements: z.array(z.string()).describe('The few genuinely new pieces'),
    })
    .optional(),
  speakingPrompt: z.object({
    prompt: z.string(),
    situation: z.string(),
    mustUse: z.array(z.string()).describe('Known phrases the learner should work in'),
  }),
})

/* -------------------------------------------------------------------------- */
/* Error memory (§16)                                                         */
/* -------------------------------------------------------------------------- */

export const errorExtractionSchema = z.object({
  errors: z.array(
    z.object({
      type: z.string().describe('Stable slug so repeat occurrences merge into one pattern'),
      category: z.enum([
        'grammar',
        'vocabulary',
        'word_order',
        'pronunciation',
        'register',
        'literal_translation',
        'naturalness',
      ]),
      label: z.string().describe('Short human name, e.g. "Dative after mit"'),
      explanation: z.string().describe('Why it matters for being understood — not a rule recitation'),
      severity: severityEnum,
      said: z.string(),
      corrected: z.string(),
    }),
  ),
})

/* -------------------------------------------------------------------------- */
/* Grammar, on request only (§17)                                             */
/* -------------------------------------------------------------------------- */

export const grammarExplanationSchema = z.object({
  patternKey: z.string(),
  simple: z.string().describe('Two or three sentences, no jargon. This is what shows first.'),
  detailed: z.string().describe('The fuller picture, revealed only if they ask for more'),
  examples: z.array(z.object({ text: z.string(), translation: z.string(), note: z.string().optional() })),
  comparison: z
    .string()
    .optional()
    .describe('Contrast with the learner\'s native language, when that is what actually causes the confusion'),
})

/* -------------------------------------------------------------------------- */
/* Placement assessment (§8)                                                  */
/* -------------------------------------------------------------------------- */

export const assessmentItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      skill: z.enum(['reading', 'listening', 'vocabulary', 'comprehension', 'production']),
      level: cefrLevel,
      prompt: z.string(),
      promptTranslation: z.string().optional(),
      /** For listening items this text is what gets spoken aloud. */
      audioText: z.string().optional(),
      kind: z.enum(['multiple_choice', 'short_answer', 'free_production']),
      options: z.array(z.string()).optional(),
      answer: z.string().optional(),
    }),
  ),
})

export const assessmentResultSchema = z.object({
  overallLevel: cefrLevel,
  /** Per-dimension, because one letter is not enough (§8). */
  dimensions: z.array(
    z.object({
      dimension: z.string().describe('reading, listening, speaking, writing, vocabulary, or a life-area key'),
      level: cefrLevel,
      score: z.number().min(0).max(100),
      comment: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  /** The headline the dashboard shows: the gap that matters most. */
  biggestGap: z.string(),
  recommendedStartingStage: z.enum(['survival', 'functional', 'comfortable', 'fluent']),
  summary: z.string(),
})

/* -------------------------------------------------------------------------- */
/* Missions (§21)                                                             */
/* -------------------------------------------------------------------------- */

export const missionsSchema = z.object({
  missions: z.array(
    z.object({
      title: z.string(),
      description: z.string().describe('A real thing to go and do away from the screen'),
      tier: z.enum(['beginner', 'intermediate', 'advanced']),
      lifeAreaKey: z.string(),
      successCriteria: z.array(z.string()),
      preparationPhrases: z.array(z.object({ text: z.string(), translation: z.string() })),
    }),
  ),
})

/* -------------------------------------------------------------------------- */
/* "What do I need to learn?" (§23)                                           */
/* -------------------------------------------------------------------------- */

export const goalPlanSchema = z.object({
  title: z.string(),
  goalStatement: z.string().describe('The concrete outcome, e.g. "Handle a 45-minute interview"'),
  kind: z.enum(['permanent', 'temporary']),
  suggestedLifeAreaKey: z.string(),
  requiredSkills: z.array(
    z.object({
      skill: z.string(),
      why: z.string(),
      priority: z.number().int().min(1).max(5),
    }),
  ),
  starterPhrases: z.array(phraseSchema),
  plan: z.array(
    z.object({
      step: z.string(),
      focus: z.string(),
      estimatedSessions: z.number().int().min(1),
    }),
  ),
})

/* -------------------------------------------------------------------------- */
/* AI tutor free chat                                                         */
/* -------------------------------------------------------------------------- */

export const tutorReplySchema = z.object({
  reply: z.string().describe('Answer in the explanation language unless asked otherwise'),
  targetLanguageExamples: z.array(z.object({ text: z.string(), translation: z.string() })),
  /** Set when the exchange revealed something worth remembering about the learner. */
  learnedAboutUser: z.array(z.string()).optional(),
  suggestedAction: z
    .object({
      label: z.string(),
      kind: z.enum(['start_session', 'start_conversation', 'create_goal', 'practice_writing', 'review']),
    })
    .optional(),
})

export type IntakeExtraction = z.infer<typeof intakeExtractionSchema>
export type GeneratedRoadmap = z.infer<typeof roadmapSchema>
export type GeneratedLesson = z.infer<typeof lessonSchema>
export type GeneratedEvaluation = z.infer<typeof productionEvaluationSchema>
export type GeneratedConversationSetup = z.infer<typeof conversationSetupSchema>
export type GeneratedConversationTurn = z.infer<typeof conversationTurnSchema>
export type GeneratedConversationAnalysis = z.infer<typeof conversationAnalysisSchema>
export type GeneratedCrossDomain = z.infer<typeof crossDomainSchema>
export type GeneratedErrors = z.infer<typeof errorExtractionSchema>
export type GeneratedGrammar = z.infer<typeof grammarExplanationSchema>
export type GeneratedAssessmentItems = z.infer<typeof assessmentItemsSchema>
export type GeneratedAssessmentResult = z.infer<typeof assessmentResultSchema>
export type GeneratedMissions = z.infer<typeof missionsSchema>
export type GeneratedGoalPlan = z.infer<typeof goalPlanSchema>
export type GeneratedTutorReply = z.infer<typeof tutorReplySchema>
export type GeneratedDialogue = z.infer<typeof dialogueSchema>
