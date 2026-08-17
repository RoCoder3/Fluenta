/**
 * Hand-authored German corpus.
 *
 * Two jobs:
 *   1. Seeds the shared phrase table so a new account has real material
 *      immediately, before any generation happens.
 *   2. Backs the offline AI adapter, so the product is fully usable with no
 *      API key at all.
 *
 * Quality rules followed throughout (§29):
 *   - Every entry is something a native speaker would actually say.
 *   - No textbook German ("Ich heiße Hans und ich bin ein Student.").
 *   - Register is marked, because "Können Sie mir helfen?" and "Kannst du mir
 *     kurz helfen?" are not interchangeable.
 *   - Regional variants are tagged only where they genuinely differ. Swiss
 *     Standard German uses "ss" for "ß" and has its own everyday vocabulary
 *     (Velo, Znüni, Grüezi), which matters for a learner in Zurich.
 */

import type { CorpusDialogue, CorpusPhrase, OfflineContent, ScenarioTemplate } from './types'

export type { CorpusDialogue, CorpusPhrase, ScenarioTemplate } from './types'

/* ========================================================================== */
/* Work                                                                       */
/* ========================================================================== */

const work: CorpusPhrase[] = [
  {
    text: 'Ich arbeite als Softwareentwickler bei einer Bank.',
    translation: "I work as a software developer at a bank.",
    context: 'Explaining what you do when a colleague or new acquaintance asks.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    pronunciation: 'ich AR-bei-te als SOFT-ware-ent-wick-ler',
    lifeAreaKeys: ['work', 'social'],
    grammarPatterns: ['als_profession', 'bei_dative'],
    vocab: [
      { lemma: 'arbeiten', translation: 'to work', pos: 'verb' },
      { lemma: 'Softwareentwickler', translation: 'software developer', pos: 'noun', article: 'der', plural: 'Softwareentwickler' },
    ],
    examples: [
      { text: 'Ich arbeite als Projektleiterin in der Pharmabranche.', translation: 'I work as a project manager in the pharma industry.' },
      { text: 'Er arbeitet als Berater bei einer kleinen Firma.', translation: 'He works as a consultant at a small company.' },
    ],
    tags: ['introduction', 'job'],
  },
  {
    text: 'Ich kümmere mich um das Backend.',
    translation: "I take care of the backend.",
    literal: 'I concern myself around the backend.',
    context: 'Describing your slice of a project without over-explaining.',
    register: 'professional',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['reflexive_verb', 'um_accusative'],
    vocab: [{ lemma: 'sich kümmern um', translation: 'to take care of', pos: 'verb' }],
    examples: [
      { text: 'Wer kümmert sich um das Deployment?', translation: 'Who is handling the deployment?' },
      { text: 'Ich kümmere mich darum.', translation: "I'll take care of it.", note: 'Extremely common at work — worth having ready.' },
    ],
    tags: ['role', 'responsibility'],
  },
  {
    text: 'Können wir das kurz besprechen?',
    translation: 'Can we discuss that briefly?',
    context: 'Pulling a colleague aside, or asking for a few minutes in a meeting.',
    register: 'professional',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['modal_verb', 'verb_final_question'],
    vocab: [
      { lemma: 'besprechen', translation: 'to discuss', pos: 'verb' },
      { lemma: 'kurz', translation: 'briefly, short', pos: 'adverb' },
    ],
    examples: [
      { text: 'Hast du kurz Zeit?', translation: 'Do you have a moment?', note: 'The informal shortcut — most used version among colleagues.' },
      { text: 'Können wir das morgen besprechen?', translation: 'Can we discuss that tomorrow?' },
    ],
    tags: ['meetings', 'request'],
  },
  {
    text: 'Ich bin mir nicht ganz sicher, ob das funktioniert.',
    translation: "I'm not entirely sure whether that will work.",
    context: 'Raising a doubt in a meeting without shutting the idea down.',
    register: 'professional',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote: 'Softer and far more collegial than "Das funktioniert nicht.", which lands as a flat contradiction.',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['ob_subordinate', 'verb_final', 'reflexive_dative'],
    vocab: [{ lemma: 'funktionieren', translation: 'to work, to function', pos: 'verb' }],
    examples: [
      { text: 'Ich bin mir nicht sicher, ob wir das bis Freitag schaffen.', translation: "I'm not sure whether we'll manage that by Friday." },
    ],
    tags: ['opinion', 'hedging', 'meetings'],
  },
  {
    text: 'Das Deployment ist fehlgeschlagen, weil die Datenbank nicht erreichbar war.',
    translation: 'The deployment failed because the database was unreachable.',
    context: 'Explaining a technical problem to a colleague or in a standup.',
    register: 'professional',
    difficulty: 4,
    cefrHint: 'B1',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['weil_subordinate', 'verb_final', 'past_tense_war'],
    vocab: [
      { lemma: 'fehlschlagen', translation: 'to fail', pos: 'verb' },
      { lemma: 'erreichbar', translation: 'reachable, available', pos: 'adjective' },
    ],
    examples: [
      { text: 'Der Build ist fehlgeschlagen, weil ein Test nicht durchgelaufen ist.', translation: 'The build failed because a test did not pass.' },
    ],
    tags: ['technical', 'problem', 'explaining'],
  },
  {
    text: 'Könntest du mir das nochmal erklären?',
    translation: 'Could you explain that to me again?',
    context: "When you didn't follow something — the single most useful sentence at work.",
    register: 'professional',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['work', 'social'],
    grammarPatterns: ['konjunktiv_2_politeness', 'dative_pronoun'],
    vocab: [{ lemma: 'erklären', translation: 'to explain', pos: 'verb' }],
    examples: [
      { text: 'Entschuldigung, könnten Sie das nochmal wiederholen?', translation: 'Sorry, could you repeat that again?', note: 'Sie form, for clients or people you do not know.' },
      { text: 'Wie meinst du das genau?', translation: 'What exactly do you mean by that?' },
    ],
    tags: ['clarification', 'survival'],
  },
  {
    text: 'Ich melde mich, sobald ich mehr weiss.',
    translation: "I'll get back to you as soon as I know more.",
    context: 'Closing off a conversation when you cannot answer yet.',
    register: 'professional',
    regionTag: 'CH',
    naturalnessNote: 'Swiss spelling: "weiss" not "weiß". In Germany and Austria write "weiß".',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['sobald_subordinate', 'reflexive_verb', 'verb_final'],
    vocab: [{ lemma: 'sich melden', translation: 'to get in touch', pos: 'verb' }],
    examples: [
      { text: 'Ich melde mich nächste Woche bei dir.', translation: "I'll get in touch with you next week." },
    ],
    tags: ['email', 'follow-up'],
  },
  {
    text: 'Ich muss morgen eine Präsentation halten.',
    translation: 'I have to give a presentation tomorrow.',
    literal: 'I must tomorrow a presentation hold.',
    context: 'Talking about what is on your plate — a natural bridge into the rest of your week.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['work', 'social'],
    grammarPatterns: ['modal_verb', 'verb_final', 'time_manner_place'],
    vocab: [
      { lemma: 'Präsentation', translation: 'presentation', pos: 'noun', article: 'die', plural: 'Präsentationen' },
      { lemma: 'halten', translation: 'to hold, to give (a talk)', pos: 'verb' },
    ],
    examples: [
      { text: 'Nächste Woche muss ich zwei Präsentationen halten.', translation: 'Next week I have to give two presentations.' },
    ],
    tags: ['presentations', 'planning'],
  },
  {
    text: 'Leider schaffe ich das nicht bis Freitag.',
    translation: "Unfortunately I won't manage that by Friday.",
    context: 'Pushing back on a deadline honestly, without sounding defensive.',
    register: 'professional',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['verb_second', 'bis_temporal'],
    vocab: [{ lemma: 'schaffen', translation: 'to manage, to get done', pos: 'verb' }],
    examples: [
      { text: 'Schaffst du das bis heute Abend?', translation: 'Can you get that done by this evening?' },
    ],
    tags: ['deadlines', 'negotiation'],
  },
  {
    text: 'Ich hätte da einen Vorschlag.',
    translation: "I've got a suggestion, if I may.",
    context: 'Opening a suggestion in a meeting — the Konjunktiv makes it land gently.',
    register: 'professional',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote: '"Ich habe einen Vorschlag" is correct but blunter. The "hätte" softens it, and the little "da" is what makes it sound native.',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['konjunktiv_2_politeness'],
    vocab: [{ lemma: 'Vorschlag', translation: 'suggestion', pos: 'noun', article: 'der', plural: 'Vorschläge' }],
    examples: [
      { text: 'Ich hätte da eine Frage.', translation: 'I have a question, if I may.' },
    ],
    tags: ['meetings', 'suggestion'],
  },
]

/* ========================================================================== */
/* Daily life                                                                 */
/* ========================================================================== */

const dailyLife: CorpusPhrase[] = [
  {
    text: 'Ich möchte einen Termin vereinbaren.',
    translation: "I'd like to make an appointment.",
    context: 'Calling a doctor, a hairdresser, or an office.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A2',
    pronunciation: 'ich MÖCH-te EI-nen TER-min fer-EIN-ba-ren',
    lifeAreaKeys: ['daily_life', 'healthcare', 'bureaucracy'],
    grammarPatterns: ['modal_verb', 'accusative_object', 'infinitive_final'],
    vocab: [
      { lemma: 'Termin', translation: 'appointment', pos: 'noun', article: 'der', plural: 'Termine' },
      { lemma: 'vereinbaren', translation: 'to arrange, to agree on', pos: 'verb' },
    ],
    examples: [
      { text: 'Haben Sie nächste Woche einen Termin frei?', translation: 'Do you have an appointment free next week?' },
      { text: 'Ich muss leider meinen Termin verschieben.', translation: 'Unfortunately I have to reschedule my appointment.' },
    ],
    tags: ['appointments', 'phone'],
  },
  {
    text: 'Entschuldigung, wo finde ich die Milch?',
    translation: 'Excuse me, where do I find the milk?',
    context: 'Lost in a supermarket aisle.',
    register: 'neutral',
    difficulty: 1,
    cefrHint: 'A1',
    lifeAreaKeys: ['daily_life', 'shopping'],
    grammarPatterns: ['question_word', 'verb_second'],
    vocab: [{ lemma: 'finden', translation: 'to find', pos: 'verb' }],
    examples: [
      { text: 'Entschuldigung, wo finde ich Reis?', translation: 'Excuse me, where do I find rice?' },
      { text: 'Wo ist die Kasse?', translation: 'Where is the checkout?' },
    ],
    tags: ['supermarket', 'survival'],
  },
  {
    text: 'Ich nehme das Gleiche wie letztes Mal.',
    translation: "I'll have the same as last time.",
    context: 'Ordering in a place you go to regularly.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['daily_life', 'food'],
    grammarPatterns: ['accusative_object', 'wie_comparison'],
    vocab: [{ lemma: 'das Gleiche', translation: 'the same thing' }],
    examples: [
      { text: 'Ich nehme einen Kaffee und ein Gipfeli.', translation: "I'll have a coffee and a croissant.", note: 'Gipfeli is Swiss; in Germany you would say Croissant or Hörnchen.' },
    ],
    tags: ['restaurant', 'ordering'],
  },
  {
    text: 'Könnten Sie mir bitte helfen? Ich suche das Kreisbüro.',
    translation: 'Could you help me please? I am looking for the district office.',
    context: 'Asking a stranger for directions to an official building.',
    register: 'formal',
    regionTag: 'CH',
    naturalnessNote: '"Kreisbüro" is Zurich-specific. In Germany you would look for the "Bürgeramt" or "Einwohnermeldeamt".',
    difficulty: 3,
    cefrHint: 'A2',
    lifeAreaKeys: ['daily_life', 'bureaucracy'],
    grammarPatterns: ['konjunktiv_2_politeness', 'dative_pronoun'],
    vocab: [{ lemma: 'suchen', translation: 'to look for', pos: 'verb' }],
    examples: [
      { text: 'Entschuldigung, wie komme ich zum Bahnhof?', translation: 'Excuse me, how do I get to the station?' },
    ],
    tags: ['directions', 'bureaucracy'],
  },
  {
    text: 'Ich muss noch Gemüse kaufen.',
    translation: 'I still need to buy vegetables.',
    context: 'Talking through what is left on your to-do list.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['daily_life', 'shopping', 'cooking'],
    grammarPatterns: ['modal_verb', 'noch_particle', 'infinitive_final'],
    vocab: [{ lemma: 'Gemüse', translation: 'vegetables', pos: 'noun', article: 'das' }],
    examples: [
      { text: 'Ich muss noch schnell einkaufen gehen.', translation: 'I still need to quickly go shopping.' },
    ],
    tags: ['errands', 'shopping'],
  },
  {
    text: 'Das Paket ist leider nicht angekommen.',
    translation: 'Unfortunately the package did not arrive.',
    context: 'Complaining to a shop or a delivery service.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['daily_life', 'shopping'],
    grammarPatterns: ['perfect_tense_sein', 'verb_final_participle'],
    vocab: [{ lemma: 'ankommen', translation: 'to arrive', pos: 'verb' }],
    examples: [
      { text: 'Die Lieferung ist letzte Woche nicht angekommen.', translation: 'The delivery did not arrive last week.' },
    ],
    tags: ['complaint', 'delivery'],
  },
]

/* ========================================================================== */
/* Social                                                                     */
/* ========================================================================== */

const social: CorpusPhrase[] = [
  {
    text: 'Was steht heute bei dir an?',
    translation: "What's on for you today?",
    literal: 'What stands today with you on?',
    context: 'Casual morning small talk with a colleague or flatmate.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote: 'Much more natural than "Was machst du heute?", which sounds like a direct interrogation.',
    lifeAreaKeys: ['social', 'work'],
    grammarPatterns: ['separable_verb', 'bei_dative'],
    vocab: [{ lemma: 'anstehen', translation: 'to be coming up, to be on the agenda', pos: 'verb' }],
    examples: [
      { text: 'Bei mir steht heute nur ein Meeting an.', translation: "I've only got one meeting today." },
    ],
    tags: ['small_talk', 'greeting'],
  },
  {
    text: 'Wollen wir mal zusammen einen Kaffee trinken?',
    translation: 'Shall we grab a coffee together sometime?',
    context: 'Turning a friendly colleague into an actual friend.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote: 'The little "mal" is what makes this casual rather than a formal invitation. Leave it out and it sounds oddly serious.',
    lifeAreaKeys: ['social', 'friends'],
    grammarPatterns: ['modal_verb', 'mal_particle', 'infinitive_final'],
    vocab: [{ lemma: 'zusammen', translation: 'together', pos: 'adverb' }],
    examples: [
      { text: 'Wollen wir mal zusammen klettern gehen?', translation: 'Shall we go climbing together sometime?' },
    ],
    tags: ['making_friends', 'invitation'],
  },
  {
    text: 'Ehrlich gesagt sehe ich das ein bisschen anders.',
    translation: 'Honestly, I see that a bit differently.',
    context: 'Disagreeing without causing friction.',
    register: 'neutral',
    difficulty: 4,
    cefrHint: 'B2',
    naturalnessNote: 'Germans and Swiss both disagree directly, but this opener keeps it collegial. "Du hast unrecht" is a confrontation.',
    lifeAreaKeys: ['social', 'work'],
    grammarPatterns: ['verb_second_after_adverbial', 'fixed_expression'],
    vocab: [{ lemma: 'ehrlich gesagt', translation: 'honestly, to be honest' }],
    examples: [
      { text: 'Ehrlich gesagt bin ich mir da nicht so sicher.', translation: "Honestly, I'm not so sure about that." },
    ],
    tags: ['opinion', 'disagreement'],
  },
  {
    text: 'Wie war dein Wochenende?',
    translation: 'How was your weekend?',
    context: 'Monday morning, every office in the German-speaking world.',
    register: 'informal',
    difficulty: 1,
    cefrHint: 'A1',
    lifeAreaKeys: ['social', 'work'],
    grammarPatterns: ['past_tense_war', 'question_word'],
    vocab: [{ lemma: 'Wochenende', translation: 'weekend', pos: 'noun', article: 'das', plural: 'Wochenenden' }],
    examples: [
      { text: 'Und, wie war dein Wochenende?', translation: 'So, how was your weekend?', note: 'The leading "Und," is very natural here.' },
    ],
    tags: ['small_talk', 'greeting'],
  },
  {
    text: 'Ich war letztes Wochenende klettern.',
    translation: 'I went climbing last weekend.',
    literal: 'I was last weekend climbing.',
    context: 'Answering the weekend question with something real.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote: 'German uses "war ... klettern" for activities, not the perfect. "Ich bin klettern gegangen" also works but is heavier.',
    lifeAreaKeys: ['social', 'fitness', 'hobbies'],
    grammarPatterns: ['past_tense_war', 'time_manner_place'],
    vocab: [{ lemma: 'klettern', translation: 'to climb', pos: 'verb' }],
    examples: [
      { text: 'Ich war gestern schwimmen.', translation: 'I went swimming yesterday.' },
    ],
    tags: ['weekend', 'hobbies'],
  },
]

/* ========================================================================== */
/* Bureaucracy                                                                */
/* ========================================================================== */

const bureaucracy: CorpusPhrase[] = [
  {
    text: 'Ich möchte mich anmelden.',
    translation: "I'd like to register (my address).",
    context: 'The first thing you say at the residents registration office after moving.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['bureaucracy', 'housing'],
    grammarPatterns: ['reflexive_verb', 'modal_verb', 'infinitive_final'],
    vocab: [{ lemma: 'sich anmelden', translation: 'to register', pos: 'verb' }],
    examples: [
      { text: 'Ich möchte mich ummelden.', translation: "I'd like to change my registered address." },
      { text: 'Welche Unterlagen brauche ich dafür?', translation: 'Which documents do I need for that?' },
    ],
    tags: ['registration', 'moving'],
  },
  {
    text: 'Welche Unterlagen muss ich mitbringen?',
    translation: 'Which documents do I need to bring?',
    context: 'On the phone with any office, before wasting a trip.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'A2',
    lifeAreaKeys: ['bureaucracy'],
    grammarPatterns: ['modal_verb', 'separable_verb', 'question_word'],
    vocab: [
      { lemma: 'Unterlagen', translation: 'documents, paperwork', pos: 'noun', article: 'die' },
      { lemma: 'mitbringen', translation: 'to bring along', pos: 'verb' },
    ],
    examples: [
      { text: 'Muss ich meinen Pass mitbringen?', translation: 'Do I need to bring my passport?' },
    ],
    tags: ['documents', 'phone'],
  },
  {
    text: 'Ich verstehe das Formular nicht ganz. Können Sie mir helfen?',
    translation: "I don't fully understand the form. Can you help me?",
    context: 'At a counter, holding a piece of paper you cannot parse.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['bureaucracy'],
    grammarPatterns: ['modal_verb', 'dative_pronoun'],
    vocab: [{ lemma: 'Formular', translation: 'form', pos: 'noun', article: 'das', plural: 'Formulare' }],
    examples: [
      { text: 'Was muss ich hier genau eintragen?', translation: 'What exactly do I need to enter here?' },
    ],
    tags: ['forms', 'help'],
  },
]

/* ========================================================================== */
/* Food, fitness, travel, health, housing                                     */
/* ========================================================================== */

const misc: CorpusPhrase[] = [
  {
    text: 'Ich hätte gern die Rechnung, bitte.',
    translation: "I'd like the bill, please.",
    context: 'Ending a meal. In German-speaking countries you ask; nobody brings it unprompted.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A1',
    lifeAreaKeys: ['food', 'daily_life'],
    grammarPatterns: ['konjunktiv_2_politeness', 'accusative_object'],
    vocab: [{ lemma: 'Rechnung', translation: 'bill, invoice', pos: 'noun', article: 'die', plural: 'Rechnungen' }],
    examples: [
      { text: 'Zusammen oder getrennt?', translation: 'Together or separately?', note: 'The question you will be asked back — be ready for it.' },
      { text: 'Getrennt, bitte.', translation: 'Separately, please.' },
    ],
    tags: ['restaurant', 'paying'],
  },
  {
    text: 'Haben Sie etwas Vegetarisches?',
    translation: 'Do you have anything vegetarian?',
    context: 'Scanning a menu that is mostly meat.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'A2',
    lifeAreaKeys: ['food'],
    grammarPatterns: ['adjective_nominalization', 'etwas_plus_adjective'],
    vocab: [{ lemma: 'vegetarisch', translation: 'vegetarian', pos: 'adjective' }],
    examples: [
      { text: 'Ist da Fleisch drin?', translation: 'Is there meat in that?' },
    ],
    tags: ['restaurant', 'dietary'],
  },
  {
    text: 'Ich muss heute noch trainieren.',
    translation: 'I still need to train today.',
    context: 'Explaining why you cannot stay out — or why you are in a hurry.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['fitness', 'social'],
    grammarPatterns: ['modal_verb', 'noch_particle', 'infinitive_final'],
    vocab: [{ lemma: 'trainieren', translation: 'to train, to work out', pos: 'verb' }],
    examples: [
      { text: 'Ich gehe dreimal pro Woche ins Fitnessstudio.', translation: 'I go to the gym three times a week.' },
    ],
    tags: ['fitness', 'plans'],
  },
  {
    text: 'Ich habe seit ein paar Tagen Halsschmerzen.',
    translation: "I've had a sore throat for a few days.",
    context: 'Describing a symptom at the doctor. German uses the present tense with "seit" here.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote: 'English says "I have had"; German stays in the present with "seit". Saying "Ich hatte" changes the meaning to something that is now over.',
    lifeAreaKeys: ['healthcare'],
    grammarPatterns: ['seit_dative', 'present_for_duration'],
    vocab: [{ lemma: 'Halsschmerzen', translation: 'sore throat', pos: 'noun', article: 'die' }],
    examples: [
      { text: 'Ich habe seit gestern Kopfschmerzen.', translation: "I've had a headache since yesterday." },
    ],
    tags: ['doctor', 'symptoms'],
  },
  {
    text: 'Die Heizung funktioniert nicht richtig.',
    translation: 'The heating is not working properly.',
    context: 'Reporting a problem to your landlord or building management.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['housing'],
    grammarPatterns: ['verb_second', 'negation_nicht'],
    vocab: [{ lemma: 'Heizung', translation: 'heating', pos: 'noun', article: 'die', plural: 'Heizungen' }],
    examples: [
      { text: 'Der Wasserhahn tropft seit einer Woche.', translation: 'The tap has been dripping for a week.' },
    ],
    tags: ['landlord', 'problem'],
  },
  {
    text: 'Fährt dieser Zug direkt nach Bern?',
    translation: 'Does this train go directly to Bern?',
    context: 'On a platform, thirty seconds before departure.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    lifeAreaKeys: ['travel', 'transportation'],
    grammarPatterns: ['verb_first_yes_no', 'nach_directional'],
    vocab: [{ lemma: 'fahren', translation: 'to go, to travel (by vehicle)', pos: 'verb' }],
    examples: [
      { text: 'Muss ich umsteigen?', translation: 'Do I have to change trains?' },
      { text: 'Von welchem Gleis fährt der Zug?', translation: 'Which platform does the train leave from?' },
    ],
    tags: ['train', 'travel'],
  },
]

export const GERMAN_CORPUS: CorpusPhrase[] = [...work, ...dailyLife, ...social, ...bureaucracy, ...misc]


/* ========================================================================== */
/* Dialogues — used by lessons and by the offline adapter                     */
/* ========================================================================== */

export const GERMAN_DIALOGUES: CorpusDialogue[] = [
  {
    key: 'work_monday_standup',
    lifeAreaKeys: ['work'],
    title: 'Monday morning at the desk',
    situation: 'A colleague stops by your desk before the standup.',
    level: 'A2',
    speakers: [
      { label: 'Nadia', role: 'colleague' },
      { label: 'Du', role: 'you' },
    ],
    lines: [
      { speaker: 'Nadia', text: 'Morgen! Wie war dein Wochenende?', translation: 'Morning! How was your weekend?' },
      { speaker: 'Du', text: 'Ganz gut, danke. Ich war klettern. Und deins?', translation: 'Pretty good, thanks. I went climbing. And yours?' },
      { speaker: 'Nadia', text: 'Auch gut, ziemlich ruhig. Was steht heute bei dir an?', translation: 'Good too, pretty quiet. What have you got on today?', note: '"Was steht an?" is the standard way colleagues ask this.' },
      { speaker: 'Du', text: 'Ich muss morgen eine Präsentation halten, also bereite ich die heute vor.', translation: 'I have to give a presentation tomorrow, so I am preparing it today.' },
      { speaker: 'Nadia', text: 'Ah, viel Erfolg! Sag Bescheid, wenn du Hilfe brauchst.', translation: 'Ah, good luck! Let me know if you need help.', note: '"Sag Bescheid" — let me know. Extremely common, worth memorizing whole.' },
    ],
  },
  {
    key: 'daily_appointment_call',
    lifeAreaKeys: ['daily_life', 'healthcare', 'bureaucracy'],
    title: 'Calling to book an appointment',
    situation: 'You phone a doctor’s practice to get an appointment.',
    level: 'A2',
    speakers: [
      { label: 'Praxis', role: 'receptionist' },
      { label: 'Du', role: 'you' },
    ],
    lines: [
      { speaker: 'Praxis', text: 'Praxis Dr. Berger, guten Tag.', translation: 'Dr. Berger’s practice, hello.' },
      { speaker: 'Du', text: 'Guten Tag, ich möchte einen Termin vereinbaren.', translation: 'Hello, I would like to make an appointment.' },
      { speaker: 'Praxis', text: 'Gerne. Waren Sie schon einmal bei uns?', translation: 'Of course. Have you been to us before?' },
      { speaker: 'Du', text: 'Nein, ich bin neu hier.', translation: 'No, I am new here.' },
      { speaker: 'Praxis', text: 'Kein Problem. Hätten Sie am Donnerstag um 14 Uhr Zeit?', translation: 'No problem. Would Thursday at 2pm work for you?' },
      { speaker: 'Du', text: 'Donnerstag passt gut. Welche Unterlagen muss ich mitbringen?', translation: 'Thursday works well. Which documents do I need to bring?' },
      { speaker: 'Praxis', text: 'Nur Ihre Versichertenkarte. Bis Donnerstag!', translation: 'Just your insurance card. See you Thursday!' },
    ],
  },
  {
    key: 'social_coffee_invite',
    lifeAreaKeys: ['social', 'friends'],
    title: 'Turning a colleague into a friend',
    situation: 'You have been chatting with a colleague for weeks and want to suggest meeting outside work.',
    level: 'B1',
    speakers: [
      { label: 'Marco', role: 'colleague' },
      { label: 'Du', role: 'you' },
    ],
    lines: [
      { speaker: 'Du', text: 'Du, hast du kurz Zeit?', translation: 'Hey, do you have a moment?', note: 'The opening "Du," is a soft attention-getter, like "hey".' },
      { speaker: 'Marco', text: 'Klar, was gibt’s?', translation: 'Sure, what’s up?' },
      { speaker: 'Du', text: 'Wollen wir mal zusammen einen Kaffee trinken? Ausserhalb vom Büro, meine ich.', translation: 'Shall we grab a coffee sometime? Outside the office, I mean.' },
      { speaker: 'Marco', text: 'Ja, gerne! Wie sieht’s bei dir nächste Woche aus?', translation: 'Yes, gladly! How does next week look for you?' },
      { speaker: 'Du', text: 'Mittwoch würde bei mir gut passen.', translation: 'Wednesday would work well for me.' },
      { speaker: 'Marco', text: 'Perfekt, machen wir. Ich schreib dir.', translation: 'Perfect, let’s do that. I’ll text you.' },
    ],
  },
]

/* ========================================================================== */
/* Scenario library for the conversation simulator                            */
/* ========================================================================== */

export const GERMAN_SCENARIOS: ScenarioTemplate[] = [
  {
    key: 'restaurant_order',
    title: 'Ordering dinner',
    lifeAreaKey: 'food',
    situation: 'You are at a busy restaurant. The server comes to take your order.',
    difficulty: 2,
    learnerObjective: 'Order a drink and a main course, and ask one question about the menu.',
    persona: {
      name: 'Serviceperson',
      role: 'restaurant server',
      register: 'Sie',
      region: 'CH',
      personality: 'Friendly but busy. Speaks at a normal pace and does not simplify much.',
      openingLine: 'Guten Abend! Haben Sie schon gewählt?',
    },
    usefulPhrases: [
      { text: 'Ich hätte gern …', translation: "I'd like …" },
      { text: 'Was empfehlen Sie?', translation: 'What do you recommend?' },
      { text: 'Ist da Fleisch drin?', translation: 'Is there meat in that?' },
    ],
  },
  {
    key: 'work_standup',
    title: 'Explaining a blocker in standup',
    lifeAreaKey: 'work',
    situation: 'Your team lead asks for your update. Something is blocked and you need to explain it.',
    difficulty: 4,
    learnerObjective: 'Explain what you did, what is blocking you, and what you need from the team.',
    persona: {
      name: 'Sabine',
      role: 'team lead',
      register: 'du',
      region: 'DE',
      personality: 'Direct and efficient. Asks a follow-up question when something is vague.',
      openingLine: 'Guten Morgen zusammen. Magst du anfangen? Wie sieht es bei dir aus?',
    },
    usefulPhrases: [
      { text: 'Ich bin gerade blockiert, weil …', translation: "I'm currently blocked because …" },
      { text: 'Ich kümmere mich um …', translation: "I'm taking care of …" },
      { text: 'Könntest du mir dabei helfen?', translation: 'Could you help me with that?' },
    ],
  },
  {
    key: 'neighbour_hallway',
    title: 'Small talk with a neighbour',
    lifeAreaKey: 'social',
    situation: 'You meet your neighbour in the stairwell. They are chatty.',
    difficulty: 3,
    learnerObjective: 'Hold a friendly two-minute exchange and leave politely.',
    persona: {
      name: 'Herr Widmer',
      role: 'neighbour, mid-60s',
      register: 'Sie',
      region: 'CH',
      personality: 'Warm, talkative, mentions the weather and the recycling schedule.',
      openingLine: 'Grüezi! Sie sind neu hier, oder?',
    },
    usefulPhrases: [
      { text: 'Ja, ich bin vor Kurzem eingezogen.', translation: 'Yes, I moved in recently.' },
      { text: 'Schönen Tag noch!', translation: 'Have a nice day!' },
    ],
  },
  {
    key: 'registration_office',
    title: 'Registering your address',
    lifeAreaKey: 'bureaucracy',
    situation: 'You are at the registration office to register your new address.',
    difficulty: 4,
    learnerObjective: 'Explain why you are there, answer questions, and find out what happens next.',
    persona: {
      name: 'Frau Meier',
      role: 'municipal clerk',
      register: 'Sie',
      region: 'CH',
      personality: 'Correct and procedural. Uses official vocabulary without explaining it.',
      openingLine: 'Grüezi. Was kann ich für Sie tun?',
    },
    usefulPhrases: [
      { text: 'Ich möchte mich anmelden.', translation: 'I would like to register.' },
      { text: 'Welche Unterlagen brauchen Sie?', translation: 'Which documents do you need?' },
      { text: 'Wie lange dauert das?', translation: 'How long does that take?' },
    ],
  },
  {
    key: 'job_interview',
    title: 'Job interview',
    lifeAreaKey: 'work',
    situation: 'A first-round interview for a role in your field.',
    difficulty: 5,
    learnerObjective: 'Introduce yourself, describe your experience, and ask one good question.',
    persona: {
      name: 'Herr Bauer',
      role: 'hiring manager',
      register: 'Sie',
      region: 'DE',
      personality: 'Professional and probing. Follows up on anything vague.',
      openingLine: 'Schön, dass Sie da sind. Erzählen Sie doch kurz etwas über sich.',
    },
    usefulPhrases: [
      { text: 'Ich arbeite seit … Jahren als …', translation: "I've been working as a … for … years" },
      { text: 'Meine Stärke ist …', translation: 'My strength is …' },
      { text: 'Ich hätte auch eine Frage.', translation: 'I have a question as well.' },
    ],
  },
  {
    key: 'supermarket_checkout',
    title: 'At the supermarket checkout',
    lifeAreaKey: 'shopping',
    situation: 'You are at the till. The cashier asks the usual questions, quickly.',
    difficulty: 2,
    learnerObjective: 'Handle the checkout without switching to English.',
    persona: {
      name: 'Kassierer',
      role: 'cashier',
      register: 'Sie',
      region: 'CH',
      personality: 'Fast, efficient, mildly impatient. Uses short questions.',
      openingLine: 'Grüezi. Haben Sie eine Cumulus-Karte?',
    },
    usefulPhrases: [
      { text: 'Nein, danke.', translation: 'No, thank you.' },
      { text: 'Kann ich mit Karte zahlen?', translation: 'Can I pay by card?' },
      { text: 'Eine Tüte, bitte.', translation: 'A bag, please.' },
    ],
  },
]


/* ========================================================================== */
/* Offline content — the language-specific material the offline adapter needs */
/* ========================================================================== */

export const GERMAN_OFFLINE: OfflineContent = {
  assessmentItems: [
    {
      id: 'a1-read-1',
      skill: 'reading',
      level: 'A1',
      prompt: 'Was bedeutet: "Ich komme aus Italien."?',
      kind: 'multiple_choice',
      options: ['I come from Italy.', 'I am going to Italy.', 'I live in Italy.'],
      answer: 'I come from Italy.',
    },
    {
      id: 'a2-read-1',
      skill: 'reading',
      level: 'A2',
      prompt: 'Was bedeutet: "Ich muss leider meinen Termin verschieben."?',
      kind: 'multiple_choice',
      options: [
        'Unfortunately I have to reschedule my appointment.',
        'I would like to book an appointment.',
        'I have missed my appointment.',
      ],
      answer: 'Unfortunately I have to reschedule my appointment.',
    },
    {
      id: 'a2-listen-1',
      skill: 'listening',
      level: 'A2',
      prompt: 'Listen, then choose what was said.',
      audioText: 'Können wir das morgen kurz besprechen?',
      kind: 'multiple_choice',
      options: [
        'Can we discuss that briefly tomorrow?',
        'Did we discuss that yesterday?',
        'We must decide that today.',
      ],
      answer: 'Can we discuss that briefly tomorrow?',
    },
    {
      id: 'b1-read-1',
      skill: 'comprehension',
      level: 'B1',
      prompt: 'Was bedeutet: "Ich bin mir nicht ganz sicher, ob das bis Freitag klappt."?',
      kind: 'multiple_choice',
      options: [
        "I'm not entirely sure whether that will work out by Friday.",
        'It definitely will not work by Friday.',
        'I promise it will be done by Friday.',
      ],
      answer: "I'm not entirely sure whether that will work out by Friday.",
    },
    {
      id: 'b1-listen-1',
      skill: 'listening',
      level: 'B1',
      prompt: 'Listen, then choose what was said.',
      audioText: 'Sag Bescheid, wenn du Hilfe brauchst — ich hab heute eh wenig zu tun.',
      kind: 'multiple_choice',
      options: [
        'Let me know if you need help — I do not have much on today anyway.',
        'I need help today because I have a lot on.',
        'Tell me when you have finished the work.',
      ],
      answer: 'Let me know if you need help — I do not have much on today anyway.',
    },
    {
      id: 'b2-vocab-1',
      skill: 'vocabulary',
      level: 'B2',
      prompt: 'Which is the most natural way to disagree politely with a colleague?',
      kind: 'multiple_choice',
      options: ['Ehrlich gesagt sehe ich das ein bisschen anders.', 'Du hast unrecht.', 'Das ist falsch.'],
      answer: 'Ehrlich gesagt sehe ich das ein bisschen anders.',
    },
    {
      id: 'prod-1',
      skill: 'production',
      level: 'A2',
      prompt:
        'In German: tell a colleague what you have on today. Two or three sentences. Write what you can — imperfect is fine.',
      kind: 'free_production',
    },
  ],

  missions: [
    {
      title: 'Order your coffee entirely in German',
      description:
        'Go to a café and complete the whole exchange in German, including paying. Do not switch, even if they do.',
      tier: 'beginner',
      successCriteria: [
        'You ordered without English',
        'You understood the price',
        'You responded to at least one unexpected question',
      ],
      preparationPhrases: [
        { text: 'Einen Kaffee, bitte.', translation: 'A coffee, please.' },
        { text: 'Zum Mitnehmen, bitte.', translation: 'To take away, please.' },
      ],
    },
    {
      title: 'Ask a colleague how their weekend was — and follow up twice',
      description:
        'Start the conversation and keep it going with two follow-up questions rather than letting it die.',
      tier: 'intermediate',
      successCriteria: ['You opened in German', 'You asked two follow-ups', 'The exchange lasted over a minute'],
      preparationPhrases: [
        { text: 'Wie war dein Wochenende?', translation: 'How was your weekend?' },
        { text: 'Und was hast du da gemacht?', translation: 'And what did you do there?' },
      ],
    },
    {
      title: 'Make a phone call to book something',
      description:
        'Phone a doctor, hairdresser or restaurant and book an appointment. Phone calls remove all the visual cues — this is the real test.',
      tier: 'intermediate',
      successCriteria: ['You stated your purpose', 'You agreed a time', 'You confirmed what to bring'],
      preparationPhrases: [
        { text: 'Ich möchte einen Termin vereinbaren.', translation: 'I would like to make an appointment.' },
        { text: 'Könnten Sie das bitte wiederholen?', translation: 'Could you repeat that, please?' },
      ],
    },
    {
      title: 'Explain a work problem in German',
      description:
        'In your next standup or one-to-one, explain one thing that is blocked and what you need — in German.',
      tier: 'advanced',
      successCriteria: ['You explained the cause', 'You said what you need', 'You handled a follow-up question'],
      preparationPhrases: [
        { text: 'Ich bin gerade blockiert, weil …', translation: "I'm currently blocked because …" },
        { text: 'Könntest du mir dabei helfen?', translation: 'Could you help me with that?' },
      ],
    },
  ],

  conversationReplies: [
    { reply: 'Alles klar. Und sonst noch etwas?', translation: 'All right. And anything else?' },
    { reply: 'Verstehe. Können Sie mir das kurz genauer erklären?', translation: 'I see. Could you explain that in a bit more detail?' },
    { reply: 'Gut, das machen wir so. Passt das für Sie?', translation: 'Good, let us do it that way. Does that work for you?' },
    { reply: 'Mhm, und wie sieht es zeitlich bei Ihnen aus?', translation: 'Mhm, and how are you placed for time?' },
  ],

  productionPrompts: [
    {
      prompt: 'A colleague asks what you have on today. Answer them in two or three sentences.',
      mode: 'writing',
      situation: 'Monday morning, standing by the coffee machine.',
      hints: ['Was steht heute bei dir an?', 'Ich muss …', 'Danach …'],
      sampleAnswer:
        'Heute muss ich eine Präsentation vorbereiten. Danach habe ich noch zwei Meetings. Und bei dir?',
    },
    {
      prompt: 'Say out loud what you did last weekend. Keep going for at least 30 seconds.',
      mode: 'speaking',
      situation: 'Answering the standard Monday question.',
      hints: ['Ich war …', 'Am Samstag …', 'Am Sonntag habe ich …'],
      sampleAnswer:
        'Am Samstag war ich klettern, das war ziemlich anstrengend. Am Sonntag habe ich nur gekocht und gelesen. Ganz ruhig also.',
    },
  ],

  grammar: {
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
  },

  crossDomain: {
    bridgePhrases: [
      {
        text: 'Morgen muss ich eine Präsentation halten, deshalb habe ich heute wenig Zeit.',
        translation: 'I have to give a presentation tomorrow, so I have little time today.',
        builtFrom: ['Ich muss morgen eine Präsentation halten.'],
      },
      {
        text: 'Nach der Arbeit gehe ich noch schnell einkaufen und danach ins Fitnessstudio.',
        translation: 'After work I am quickly going shopping and then to the gym.',
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
  },

  correctionRules: [
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
  ],

  registerObjective: 'I can adjust between du and Sie without thinking about it.',
  comprehensionGapNote:
    'Your comprehension is ahead of your production, which is the usual pattern for people living in a German-speaking country without speaking much. The plan weights speaking accordingly.',
}
