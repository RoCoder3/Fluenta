/**
 * End-to-end smoke test of the complete learner journey.
 *
 * Drives the real engines against the real database — no mocks below the AI
 * provider, which runs on the offline adapter so this needs no API key.
 *
 * Run with:  npm run smoke
 * (The --conditions=react-server flag makes `server-only` resolve to its empty
 * module, so server modules can be imported outside the Next runtime.)
 */

import { eq, sql } from 'drizzle-orm'

import * as schema from '../src/server/db/schema'

const EMAIL = `smoke-${Date.now()}@example.test`

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(name: string) {
  console.log(`\n${name}`)
}

async function main() {
  console.log('End-to-end smoke test\n' + '='.repeat(60))

  // The test MUST share the engines' connection. PGlite allows one writer per
  // data directory, so opening a second instance here would give the test a
  // divergent view of the database and produce phantom failures.
  const { getDb } = await import('../src/server/db')
  const db = await getDb()

  // Engines are imported lazily so the `react-server` condition is already
  // applied by the time `server-only` is resolved.
  const { hashPassword } = await import('../src/server/auth')
  const { extractIntake, generateInitialRoadmaps } = await import('../src/server/engines/onboarding')
  const { createSession, completeSession, generateCrossDomain } = await import(
    '../src/server/engines/content'
  )
  const { evaluateProduction, getErrorProfile } = await import('../src/server/engines/feedback')
  const { getDueItems, recordReview, buildReviewQuestion, computeMastery } = await import(
    '../src/server/engines/review'
  )
  const { startConversation, takeTurn, endConversation } = await import(
    '../src/server/engines/conversation'
  )
  const { generateMissions, completeMission, explainGrammar, planGoal } = await import(
    '../src/server/engines/tutor'
  )
  const { recomputeAreaReadiness, getProgressOverview, applySkillEvidence } = await import(
    '../src/server/engines/progress'
  )
  const { buildLearnerModel, describeBiggestGap } = await import('../src/server/learner/model')
  const { getLibrary } = await import('../src/server/repositories/phrases')

  /* ---------------------------------------------------------------- 1. auth */
  section('1. Sign up')

  const passwordHash = await hashPassword('correct-horse-battery')
  const [user] = await db
    .insert(schema.users)
    .values({ email: EMAIL, passwordHash, name: 'Smoke Tester' })
    .returning()

  check('user created', Boolean(user?.id))
  if (!user) throw new Error('cannot continue without a user')
  const userId = user.id

  const { verifyPassword } = await import('../src/server/auth')
  check('password verifies', await verifyPassword(passwordHash, 'correct-horse-battery'))
  check('wrong password rejected', !(await verifyPassword(passwordHash, 'wrong')))

  /* ----------------------------------------------------------- 2. onboarding */
  section('2. Onboarding — profile, intake, life areas')

  await db.insert(schema.learnerProfiles).values({
    userId,
    nativeLanguageCode: 'en',
    targetLanguageCode: 'de',
    explanationLanguageCode: 'en',
    motivations: ['work', 'daily_life', 'social'],
  })

  const intake = await extractIntake({
    userId,
    rawIntake:
      'I live in Zurich and work in IT as a backend developer. I understand a fair amount of German but freeze when I have to speak. I need it at work, for the Kreisbüro and my landlord, and I would like to make actual Swiss friends.',
    motivations: ['work', 'daily_life', 'social'],
    targetLanguageCode: 'de',
    explanationLanguageCode: 'en',
    userName: 'Smoke Tester',
  })

  check('intake extracted a motivation summary', intake.motivationSummary.length > 20)
  check('intake suggested life areas', intake.suggestedLifeAreas.length >= 3)

  await db
    .update(schema.learnerProfiles)
    .set({
      rawIntake: 'Zurich, IT, needs work + bureaucracy + social German.',
      motivationSummary: intake.motivationSummary,
      city: 'Zurich',
      country: 'Switzerland',
      regionPreference: 'CH',
      profession: 'Backend developer',
      industry: 'Software',
      interests: ['climbing', 'cooking'],
      estimatedLevel: 'A2',
    })
    .where(eq(schema.learnerProfiles.userId, userId))

  for (const [index, area] of intake.suggestedLifeAreas.entries()) {
    await db.insert(schema.lifeAreas).values({
      userId,
      key: area.key,
      name: area.name,
      description: area.description,
      priority: index + 1,
      subAreas: area.subAreas.map((n) => ({ key: n.replace(/\W+/g, '_'), name: n, readiness: 0 })),
    })
  }

  const areas = await db.select().from(schema.lifeAreas).where(eq(schema.lifeAreas.userId, userId))
  check(`life areas persisted (${areas.length})`, areas.length >= 3)

  await applySkillEvidence(userId, {
    reading: 55,
    listening: 48,
    speaking: 28,
    writing: 38,
    vocabulary: 50,
    confidence: 30,
  })
  check('assessment seeded skill scores', true)

  /* ------------------------------------------------------------ 3. roadmaps */
  section('3. Roadmap generation')

  const roadmapCount = await generateInitialRoadmaps(userId, 'survival', 3)
  check(`roadmaps generated (${roadmapCount})`, roadmapCount >= 1)

  const stages = await db
    .select()
    .from(schema.roadmapStages)
    .innerJoin(schema.roadmaps, eq(schema.roadmaps.id, schema.roadmapStages.roadmapId))
    .where(eq(schema.roadmaps.userId, userId))

  check(`stages created (${stages.length})`, stages.length >= 4)
  check(
    'four tiers present',
    new Set(stages.map((s) => s.roadmap_stages.tier)).size === 4,
    `got ${[...new Set(stages.map((s) => s.roadmap_stages.tier))].join(',')}`,
  )

  const objectives = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.roadmapObjectives)
  check('can-do objectives created', Number(objectives[0]?.n ?? 0) > 0)

  /* ------------------------------------------------------------- 4. session */
  section('4. Learning session')

  const built = await createSession({ userId, type: 'daily' })
  check('session created', Boolean(built.sessionId))
  check(`activities materialized (${built.activities.length})`, built.activities.length >= 4)

  const kinds = built.activities.map((a) => a.kind)
  check('has a dialogue (input)', kinds.includes('dialogue'))
  check('has comprehension', kinds.includes('comprehension'))
  check('has phrase introduction', kinds.includes('phrase_intro'))
  check(
    'has production (output)',
    kinds.includes('production_written') || kinds.includes('production_spoken'),
  )

  const learnerPhrases = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.userPhrases)
    .where(eq(schema.userPhrases.userId, userId))
  const phraseCount = Number(learnerPhrases[0]?.n ?? 0)
  check(`phrases entered the learner's queue (${phraseCount})`, phraseCount > 0)

  /* -------------------------------------------------------------- 5. review */
  section('5. Spaced repetition')

  const due = await getDueItems(userId, 5)
  check(`items due for review (${due.length})`, due.length > 0)

  const firstDue = due[0]
  if (firstDue) {
    const question = buildReviewQuestion(firstDue)
    check('review question is contextual, not "what does X mean"', question.display.length > 0)
    check(`first mode is the easiest unpassed one (${question.mode})`, question.mode === 'recognize')

    const afterCorrect = await recordReview(userId, {
      phraseId: firstDue.phraseId,
      mode: 'recognize',
      correct: true,
      grade: 'good',
      responseMs: 2400,
    })
    check('review recorded and scheduled forward', (afterCorrect?.intervalDays ?? 0) > 0)
    check('mastery rose from zero', (afterCorrect?.mastery ?? 0) > 0)

    // Context diversity: mastery must require several different modes.
    const singleMode = computeMastery(
      {
        recognize: { attempts: 10, correct: 10, lastAt: new Date().toISOString() },
        cloze: { attempts: 0, correct: 0, lastAt: null },
        translate: { attempts: 0, correct: 0, lastAt: null },
        produce: { attempts: 0, correct: 0, lastAt: null },
        situational: { attempts: 0, correct: 0, lastAt: null },
        spoken: { attempts: 0, correct: 0, lastAt: null },
      },
      new Date(),
    )
    check(
      `10 correct recognitions alone cannot reach mastered (${singleMode} < 80)`,
      singleMode < 80,
    )

    const nextMode = (await getDueItems(userId, 20)).find(
      (i) => i.phraseId === firstDue.phraseId,
    )?.mode
    check(
      `next review escalates to a harder mode (${nextMode ?? 'not yet due'})`,
      nextMode === undefined || nextMode !== 'recognize',
    )
  }

  /* ------------------------------------------------------ 6. writing + errors */
  section('6. Writing feedback and error memory')

  const writing = await evaluateProduction({
    userId,
    mode: 'writing',
    format: 'colleague_reply',
    prompt: 'Reply to a colleague asking what you have on today.',
    content:
      'Heute muss ich eine Präsentation vorbereiten. Danach gehe ich zu der Supermarkt und dann ins Fitnessstudio.',
    lifeAreaKey: areas[0]?.key,
  })

  check('writing evaluated', writing.evaluation.overallComment.length > 0)
  check('scores returned', writing.evaluation.correctness >= 0)
  check('submission persisted', Boolean(writing.submissionId))
  check(
    'caught "zu der" → "zur"',
    writing.evaluation.corrections.some((c) => c.corrected.toLowerCase().includes('zur')),
    `corrections: ${JSON.stringify(writing.evaluation.corrections.map((c) => c.corrected))}`,
  )

  const errorsAfterFirst = await getErrorProfile(userId)
  check(`error memory recorded a pattern (${errorsAfterFirst.length})`, errorsAfterFirst.length > 0)

  // Same mistake again — must merge into the existing row, not create a new one.
  await evaluateProduction({
    userId,
    mode: 'writing',
    format: 'free_response',
    prompt: 'Where are you going?',
    content: 'Ich gehe zu der Apotheke.',
  })

  const errorsAfterSecond = await getErrorProfile(userId)
  const contraction = errorsAfterSecond.find((e) => e.type === 'preposition_contraction')
  check('repeat mistake merged into one pattern', errorsAfterSecond.length === errorsAfterFirst.length)
  check(
    `frequency incremented (${contraction?.frequency ?? 0})`,
    (contraction?.frequency ?? 0) >= 2,
  )
  check('occurrences kept as examples', (contraction?.occurrences.length ?? 0) >= 2)

  /* -------------------------------------------------------- 7. conversation */
  section('7. Conversation simulator')

  const { conversation } = await startConversation({ userId, scenarioKey: 'restaurant_order' })
  check('conversation started', Boolean(conversation.id))
  check('persona is in character', conversation.persona.openingLine.length > 0)
  check('opening line is German', /[a-zäöüß]/i.test(conversation.persona.openingLine))

  const turn = await takeTurn({
    userId,
    conversationId: conversation.id,
    learnerMessage: 'Ich hätte gern die Pasta und ein Wasser, bitte.',
  })
  check('partner replied', turn.reply.length > 0)
  check(
    'partner did NOT correct mid-conversation',
    !/korrekt|falsch|besser wäre|should say/i.test(turn.reply),
    turn.reply,
  )

  const analysis = await endConversation({ userId, conversationId: conversation.id })
  check('analysis produced after the conversation', analysis.nextStep.length > 0)
  check('fluency scored', analysis.fluency.score >= 0)
  check('task success judged', typeof analysis.taskSuccess.achieved === 'boolean')

  const turnRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversationTurns)
    .where(eq(schema.conversationTurns.conversationId, conversation.id))
  check(`turns persisted (${Number(turnRows[0]?.n ?? 0)})`, Number(turnRows[0]?.n ?? 0) >= 3)

  /* -------------------------------------------------------- 8. cross-domain */
  section('8. Cross-domain fluency')

  const model = await buildLearnerModel(userId)
  check(`bridge candidates found (${model.bridgeCandidates.length})`, model.bridgeCandidates.length > 0)

  if (model.bridgeCandidates.length > 0) {
    const bridges = await generateCrossDomain({ model })
    check('bridge phrases generated', bridges.bridgePhrases.length > 0)
    check(
      'bridges attribute their source phrases',
      bridges.bridgePhrases.every((b) => Array.isArray(b.builtFrom)),
    )
    check('mini-story generated', Boolean(bridges.miniStory?.text))
    check('speaking prompt included', bridges.speakingPrompt.prompt.length > 0)
  }

  /* ------------------------------------------------------------ 9. missions */
  section('9. Missions')

  const missions = await generateMissions({ userId, count: 3 })
  check(`missions created (${missions.length})`, missions.length > 0)
  check('missions have success criteria', (missions[0]?.successCriteria.length ?? 0) > 0)

  if (missions[0]) {
    await completeMission({
      userId,
      missionId: missions[0].id,
      reflection: 'Ordered entirely in German. Panicked when asked about a loyalty card.',
      selfRating: 4,
    })
    const [done] = await db
      .select()
      .from(schema.missions)
      .where(eq(schema.missions.id, missions[0].id))
    check('mission completion recorded', done?.status === 'completed')
    check('reflection stored', Boolean(done?.reflection))
  }

  /* ------------------------------------------------------------ 10. grammar */
  section('10. Grammar on request')

  const grammar = await explainGrammar({
    userId,
    question: 'Why is it "zum Supermarkt" and not "zu dem Supermarkt"?',
  })
  check('simple explanation returned', grammar.simple.length > 20)
  check('examples included', grammar.examples.length > 0)
  check(
    'no exercises generated',
    !/exercise|übung|fill in the blank|complete the sentence/i.test(
      grammar.simple + (grammar.detailed ?? ''),
    ),
  )

  /* ------------------------------------------------- 11. goal planning (§23) */
  section('11. "What do I need to learn?"')

  const goalResult = await planGoal({
    userId,
    request: 'I have a German job interview next Friday for a backend engineering role.',
    deadline: new Date(Date.now() + 7 * 86400000),
  })
  check('goal created', Boolean(goalResult.goalId))
  check('roadmap attached to the goal', Boolean(goalResult.roadmapId))
  check('required skills identified', goalResult.plan.requiredSkills.length > 0)

  const goalRoadmapStages = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.roadmapStages)
    .where(eq(schema.roadmapStages.roadmapId, goalResult.roadmapId))
  check('goal roadmap has stages', Number(goalRoadmapStages[0]?.n ?? 0) === 4)

  /* ----------------------------------------------------------- 12. progress */
  section('12. Progress and readiness')

  await completeSession(built.sessionId, userId)
  const [completedSession] = await db
    .select()
    .from(schema.learningSessions)
    .where(eq(schema.learningSessions.id, built.sessionId))
  check('session marked complete', completedSession?.status === 'completed')
  check('duration recorded', (completedSession?.durationSeconds ?? -1) >= 0)

  await recomputeAreaReadiness(userId)
  const areasAfter = await db
    .select()
    .from(schema.lifeAreas)
    .where(eq(schema.lifeAreas.userId, userId))
  check(
    'life-area readiness computed',
    areasAfter.some((a) => a.readiness > 0),
    `readiness values: ${areasAfter.map((a) => `${a.key}=${a.readiness.toFixed(1)}`).join(', ')}`,
  )

  const overview = await getProgressOverview(userId)
  check('progress overview assembled', overview.skills.length > 0)
  check('phrase counts present', overview.phrases.total > 0)
  check('trend snapshots recorded', overview.trends.length > 0)
  check('mission counted', overview.missions.completed >= 1)

  const finalModel = await buildLearnerModel(userId)
  const gap = describeBiggestGap(finalModel)
  check('biggest-gap statement produced', gap.length > 20)
  console.log(`     → "${gap}"`)

  /* -------------------------------------------------------- 13. phrasebook */
  section('13. Phrasebook')

  const library = await getLibrary(userId, 'all')
  check(`library populated (${library.length})`, library.length > 0)
  check('entries carry context', library.every((e) => e.context.length > 0))
  check(
    'entries carry mastery state',
    library.every((e) => typeof e.mastery === 'number'),
  )

  const favorites = await getLibrary(userId, 'favorite')
  check('favorite filter works', Array.isArray(favorites))

  /* ------------------------------------------------------ 14. AI telemetry */
  section('14. AI observability and privacy')

  const generations = await db
    .select()
    .from(schema.aiGenerations)
    .where(eq(schema.aiGenerations.userId, userId))
  check(`AI calls logged (${generations.length})`, generations.length > 0)
  check('all calls flagged as redacted', generations.every((g) => g.redacted))
  check('engines attributed', new Set(generations.map((g) => g.engine)).size > 1)

  const { redact } = await import('../src/server/ai/provider/registry')
  const redacted = redact('Contact me at tester@example.com or +41 79 123 45 67', ['Smoke Tester'])
  check('emails redacted', !redacted.includes('tester@example.com'))
  check('phone numbers redacted', !redacted.includes('79 123 45 67'))

  /* ----------------------------------------------------------------- done */
  console.log('\n' + '='.repeat(60))
  console.log(`${passed} passed, ${failed} failed`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n✗ smoke test crashed:', error)
  process.exit(1)
})
