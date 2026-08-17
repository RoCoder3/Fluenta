/**
 * Hand-authored Catalan corpus.
 *
 * Same two jobs as the German one: it seeds the shared phrase table so a new
 * Catalan learner has real material on day one, and it backs the offline AI
 * adapter so the product works with no API key.
 *
 * Quality rules followed throughout (§29):
 *   - Everything here is what a Catalan speaker would actually say. No
 *     textbook Catalan, and in particular no Spanish sentences with Catalan
 *     words swapped in — that is the single most common failure mode in
 *     Catalan learning material.
 *   - The periphrastic preterite (`vaig anar`, not `aní`) is used throughout,
 *     because that is what people say. The simple preterite is literary.
 *   - Weak pronouns (`n'hi ha`, `me'n vaig`, `què et sembla`) appear from the
 *     start. They are hard, they are unavoidable, and material that avoids
 *     them teaches a Catalan nobody speaks.
 *   - Variants are tagged only where they genuinely differ:
 *       ES-CT  Central (Barcelona, Girona) — the default here
 *       ES-VC  Valencian — different 1sg present (`parle` not `parlo`),
 *              `este`/`eixe`, `bon vesprada`, `per favor` over `si us plau`
 *       ES-IB  Balearic — salat article (`sa casa`), 1sg with no ending
 *              (`jo parl`), `al·lot` for `noi`
 *     A learner in València being taught `parlo` sounds wrong to everyone
 *     around them, which is exactly the failure this tagging prevents.
 */

import type { CorpusDialogue, CorpusPhrase, OfflineContent, ScenarioTemplate } from './types'

/* ========================================================================== */
/* Work                                                                       */
/* ========================================================================== */

const work: CorpusPhrase[] = [
  {
    text: 'Treballo de programador en una empresa d’assegurances.',
    translation: 'I work as a developer at an insurance company.',
    context: 'Answering "i tu, a què et dediques?" at a work lunch or a party.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    pronunciation: 'tre-BA-llu de pru-gra-ma-DOR en U-na em-PRE-za da-se-gu-RAN-ses',
    regionTag: 'ES-CT',
    naturalnessNote:
      'Valencian would say "treballe". Note "de programador", not "com a programador" — "com a" exists but sounds like a job title on a contract.',
    lifeAreaKeys: ['work', 'social'],
    grammarPatterns: ['treballar_de', 'en_locative'],
    vocab: [
      { lemma: 'treballar', translation: 'to work', pos: 'verb' },
      { lemma: 'empresa', translation: 'company', pos: 'noun', article: 'una', plural: 'empreses' },
    ],
    examples: [
      { text: 'Treballo d’infermera a l’Hospital Clínic.', translation: 'I work as a nurse at the Clínic hospital.' },
      { text: 'Fa vuit anys que treballo aquí.', translation: "I've been working here for eight years.", note: '"Fa X que + present" is how duration works. Not the perfect.' },
    ],
    tags: ['introductions', 'profession'],
  },
  {
    text: 'Que tens un moment? Et volia comentar una cosa.',
    translation: 'Do you have a moment? I wanted to run something by you.',
    context: 'Catching a colleague at their desk before raising something.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      'The "Que" opener is pure spoken Catalan — it softens a question into an approach. Dropping it is grammatical but abrupt. "Volia" (imperfect) rather than "vull" is the politeness move, exactly like English "I wanted to".',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['que_interrogative', 'imperfect_politeness', 'weak_pronoun_et'],
    vocab: [
      { lemma: 'comentar', translation: 'to mention, to run by', pos: 'verb' },
      { lemma: 'moment', translation: 'moment', pos: 'noun', article: 'un', plural: 'moments' },
    ],
    examples: [
      { text: 'Que puc passar un segon?', translation: 'Can I come in for a second?' },
      { text: 'Et volia demanar una cosa.', translation: 'I wanted to ask you something.' },
    ],
    tags: ['colleagues', 'softeners'],
  },
  {
    text: 'No ho acabo de veure clar, la veritat.',
    translation: "I'm honestly not convinced.",
    context: 'Disagreeing with a proposal in a meeting without blocking it outright.',
    register: 'professional',
    difficulty: 4,
    cefrHint: 'B2',
    naturalnessNote:
      '"Acabar de + infinitive" negated means "not quite" — it is the standard hedge. "No hi estic d’acord" is correct but lands as a confrontation in a meeting.',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['acabar_de_negated', 'weak_pronoun_ho'],
    vocab: [
      { lemma: 'acabar de', translation: 'to have just / to quite', pos: 'verb' },
      { lemma: 'veritat', translation: 'truth', pos: 'noun', article: 'la', plural: 'veritats' },
    ],
    examples: [
      { text: 'No acabo d’entendre per què ho fem així.', translation: "I don't quite understand why we're doing it this way." },
      { text: 'Ho veig, però tinc dubtes.', translation: 'I see it, but I have doubts.' },
    ],
    tags: ['meetings', 'disagreement', 'register'],
  },
  {
    text: 'A quina hora plegues avui?',
    translation: 'What time do you finish work today?',
    context: 'Asking a colleague, usually while making plans for after work.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      '"Plegar" means specifically to knock off work and has no clean Spanish or English equivalent. Learners who translate "acabar de treballar" are understood but instantly marked as non-local.',
    lifeAreaKeys: ['work', 'social'],
    grammarPatterns: ['present_tense_questions'],
    vocab: [
      { lemma: 'plegar', translation: 'to finish work, knock off', pos: 'verb' },
      { lemma: 'hora', translation: 'hour, time', pos: 'noun', article: 'la', plural: 'hores' },
    ],
    examples: [
      { text: 'Avui plego a les sis.', translation: 'I finish at six today.' },
      { text: 'Plego i marxo cap a casa.', translation: "I'm knocking off and heading home." },
    ],
    tags: ['colleagues', 'very-catalan'],
  },
  {
    text: 'Ho enviaré aquesta tarda sense falta.',
    translation: "I'll send it this afternoon without fail.",
    context: 'Committing to a deadline over email or in a stand-up.',
    register: 'professional',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['work'],
    grammarPatterns: ['future_tense', 'weak_pronoun_ho'],
    vocab: [
      { lemma: 'enviar', translation: 'to send', pos: 'verb' },
      { lemma: 'tarda', translation: 'afternoon', pos: 'noun', article: 'la', plural: 'tardes' },
    ],
    examples: [
      { text: 'T’ho passo abans de plegar.', translation: "I'll pass it to you before I finish." },
      { text: 'Demà al matí ho tindràs.', translation: "You'll have it tomorrow morning." },
    ],
    tags: ['deadlines', 'emails'],
    naturalnessNote:
      'Valencian says "vesprada" for the afternoon; "tarda" there tends to mean early evening. Worth knowing if you work with a València office.',
  },
  {
    text: 'Perdona, no t’he entès. M’ho pots repetir?',
    translation: "Sorry, I didn't catch that. Can you say it again?",
    context: 'The single most useful sentence in any meeting held in a language you are still learning.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      'Note "m’ho" — two weak pronouns stacked ("to me" + "it"). This combination is everywhere in speech and is the thing most worth drilling into your ear early.',
    lifeAreaKeys: ['work', 'daily_life', 'social'],
    grammarPatterns: ['weak_pronoun_combination', 'perfect_tense'],
    vocab: [
      { lemma: 'entendre', translation: 'to understand', pos: 'verb' },
      { lemma: 'repetir', translation: 'to repeat', pos: 'verb' },
    ],
    examples: [
      { text: 'Pots parlar una mica més a poc a poc, si us plau?', translation: 'Could you speak a bit more slowly, please?' },
      { text: 'Com has dit? No ho he sentit.', translation: "What did you say? I didn't hear it." },
    ],
    tags: ['survival', 'clarification'],
  },
]

/* ========================================================================== */
/* Daily life                                                                 */
/* ========================================================================== */

const dailyLife: CorpusPhrase[] = [
  {
    text: 'Que en teniu, de pa de motlle?',
    translation: 'Do you have any sliced bread?',
    context: 'Asking a shop assistant for something you cannot see on the shelf.',
    register: 'neutral',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      'The doubled "en … de" construction is very spoken Catalan. "Teniu pa de motlle?" is fine too, but the "en" version is what you will actually hear and it is worth being able to parse.',
    lifeAreaKeys: ['daily_life', 'food'],
    grammarPatterns: ['weak_pronoun_en', 'que_interrogative'],
    vocab: [
      { lemma: 'pa', translation: 'bread', pos: 'noun', article: 'el', plural: 'pans' },
      { lemma: 'tenir', translation: 'to have', pos: 'verb' },
    ],
    examples: [
      { text: 'Que en teniu, de més petites?', translation: 'Do you have any smaller ones?' },
      { text: 'No, ja no ens en queda.', translation: "No, we've none left." },
    ],
    tags: ['shopping', 'weak-pronouns'],
  },
  {
    text: 'Que va, home! Si encara és aviat.',
    translation: "Come off it — it's still early!",
    context: 'Waving away something someone said, warmly. Between friends.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      '"Home" here is a particle, not "man" — it is used to women too, and it softens the contradiction into something friendly. "Si" at the start of a clause means "but look —", not "if". Both are the kind of thing that separates fluent Catalan from correct Catalan.',
    lifeAreaKeys: ['social', 'daily_life'],
    grammarPatterns: ['discourse_particles', 'si_emphatic'],
    vocab: [
      { lemma: 'aviat', translation: 'early, soon', pos: 'adverb' },
      { lemma: 'home', translation: 'man; (as particle) come on', pos: 'noun' },
    ],
    examples: [
      { text: 'Que va! No pot ser.', translation: "No way! That can't be right." },
      { text: 'Dona, no t’hi amoïnis.', translation: "Come on, don't worry about it.", note: '"Dona" is the same particle addressed to a woman.' },
    ],
    tags: ['particles', 'very-catalan'],
  },
  {
    text: 'M’he deixat les claus a dins.',
    translation: "I've locked my keys inside.",
    context: 'On the phone to a flatmate, or explaining yourself to a neighbour.',
    register: 'neutral',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      '"Deixar-se" — reflexive — is how Catalan says "leave something behind by mistake". "He deixat les claus" without the pronoun means you left them deliberately.',
    lifeAreaKeys: ['daily_life', 'housing'],
    grammarPatterns: ['reflexive_accidental', 'perfect_tense'],
    vocab: [
      { lemma: 'clau', translation: 'key', pos: 'noun', article: 'la', plural: 'claus' },
      { lemma: 'deixar-se', translation: 'to leave behind (accidentally)', pos: 'verb' },
    ],
    examples: [
      { text: 'M’he deixat el mòbil a la feina.', translation: "I've left my phone at work." },
      { text: 'Se m’ha oblidat completament.', translation: 'It completely slipped my mind.' },
    ],
    tags: ['problems', 'reflexives'],
  },
  {
    text: 'Que sí, que ja hi vaig!',
    translation: "Yes, alright — I'm going!",
    context: 'Answering someone who has asked you three times. Affectionate exasperation.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      'Doubling "que" is emphatic agreement, not a question. "Hi" replaces "there" and is obligatory — "ja vaig" alone sounds unfinished to a native ear.',
    lifeAreaKeys: ['social', 'daily_life'],
    grammarPatterns: ['weak_pronoun_hi', 'que_emphatic'],
    vocab: [{ lemma: 'anar', translation: 'to go', pos: 'verb' }],
    examples: [
      { text: 'Hi vaig ara mateix.', translation: "I'm going right now." },
      { text: 'No hi he anat mai.', translation: "I've never been there." },
    ],
    tags: ['particles', 'weak-pronouns'],
  },
  {
    text: 'Quant costa la T-usual?',
    translation: 'How much is the monthly travel card?',
    context: 'At a metro station ticket window in Barcelona.',
    register: 'neutral',
    difficulty: 1,
    cefrHint: 'A1',
    regionTag: 'ES-CT',
    naturalnessNote: 'The T-usual is Barcelona-specific. In València you would ask about the "SUMA", in Palma the "targeta ciutadana".',
    lifeAreaKeys: ['daily_life', 'travel'],
    grammarPatterns: ['quant_questions'],
    vocab: [
      { lemma: 'costar', translation: 'to cost', pos: 'verb' },
      { lemma: 'bitllet', translation: 'ticket', pos: 'noun', article: 'el', plural: 'bitllets' },
    ],
    examples: [
      { text: 'Que em pot recarregar la targeta?', translation: 'Can you top up my card?' },
      { text: 'Quina línia he d’agafar per anar a Sants?', translation: 'Which line do I take to get to Sants?' },
    ],
    tags: ['transport', 'barcelona'],
  },
  {
    text: 'Ho sento, m’he equivocat.',
    translation: "Sorry, I've made a mistake.",
    context: 'Owning a small error — a wrong number, the wrong queue, the wrong form.',
    register: 'neutral',
    difficulty: 1,
    cefrHint: 'A1',
    lifeAreaKeys: ['daily_life', 'work', 'bureaucracy'],
    grammarPatterns: ['reflexive_verbs', 'perfect_tense'],
    vocab: [
      { lemma: 'equivocar-se', translation: 'to be wrong, to make a mistake', pos: 'verb' },
      { lemma: 'sentir', translation: 'to feel, to hear', pos: 'verb' },
    ],
    examples: [
      { text: 'Perdoni, m’he equivocat de porta.', translation: "Sorry, I've got the wrong door." },
      { text: 'Disculpa, culpa meva.', translation: 'Sorry, my fault.' },
    ],
    tags: ['survival', 'apologies'],
  },
]

/* ========================================================================== */
/* Social                                                                     */
/* ========================================================================== */

const social: CorpusPhrase[] = [
  {
    text: 'Déu n’hi do, quina setmana!',
    translation: 'Blimey, what a week!',
    context: 'Reacting to something impressive, excessive or exhausting. Extremely common.',
    register: 'informal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      '"Déu n’hi do" is untranslatable and utterly Catalan — it marks that something is a lot, admiringly or wearily depending on tone. Using it correctly is one of the fastest ways to sound like you actually live here. It has no Spanish equivalent, which is why Spanish speakers rarely acquire it.',
    lifeAreaKeys: ['social', 'work'],
    grammarPatterns: ['fixed_expressions'],
    vocab: [{ lemma: 'setmana', translation: 'week', pos: 'noun', article: 'la', plural: 'setmanes' }],
    examples: [
      { text: 'Déu n’hi do el que has fet avui.', translation: "That's quite a lot you've done today." },
      { text: 'Déu n’hi do, com plou!', translation: "Blimey, it's really coming down!" },
    ],
    tags: ['very-catalan', 'reactions'],
  },
  {
    text: 'Quedem dijous, doncs? Va bé?',
    translation: 'Thursday then? Does that work?',
    context: 'Pinning down plans over WhatsApp.',
    register: 'informal',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      '"Quedar" = to arrange to meet. "Anar bé" is the standard way to ask whether something suits someone — much more common than "et va bé el dijous?" written out in full.',
    lifeAreaKeys: ['social', 'dating'],
    grammarPatterns: ['quedar_arrangements', 'anar_be'],
    vocab: [
      { lemma: 'quedar', translation: 'to arrange to meet', pos: 'verb' },
      { lemma: 'dijous', translation: 'Thursday', pos: 'noun', article: 'el' },
    ],
    examples: [
      { text: 'Et va bé a les vuit?', translation: 'Does eight work for you?' },
      { text: 'Quedem directament allà.', translation: "Let's just meet there." },
    ],
    tags: ['plans', 'whatsapp'],
  },
  {
    text: 'La setmana passada vaig anar a veure la meva germana a Girona.',
    translation: 'Last week I went to see my sister in Girona.',
    context: 'Telling someone about your weekend. The bread-and-butter past tense.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      'This is the periphrastic preterite: "vaig" + infinitive. It looks like "I go to go" and means "I went". Catalan’s single most distinctive feature — the simple preterite ("aní") exists but is literary and will sound like you are reciting poetry.',
    lifeAreaKeys: ['social'],
    grammarPatterns: ['periphrastic_preterite', 'possessives'],
    vocab: [
      { lemma: 'germana', translation: 'sister', pos: 'noun', article: 'la', plural: 'germanes' },
      { lemma: 'anar', translation: 'to go', pos: 'verb' },
    ],
    examples: [
      { text: 'Ahir vam sopar fora.', translation: 'We ate out last night.' },
      { text: 'Què vas fer el cap de setmana?', translation: 'What did you do at the weekend?' },
    ],
    tags: ['past-tense', 'core-grammar'],
  },
  {
    text: 'A mi em sembla que sí, però no n’estic segur.',
    translation: 'I think so, but I’m not sure.',
    context: 'Giving a hedged opinion when someone asks you something you half know.',
    register: 'neutral',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      '"A mi em sembla" doubles the pronoun for emphasis — standard, not redundant. "N’estic" carries "en" referring back to the whole idea; dropping it is a common learner tell.',
    lifeAreaKeys: ['social', 'work'],
    grammarPatterns: ['semblar_opinions', 'weak_pronoun_en', 'pronoun_doubling'],
    vocab: [
      { lemma: 'semblar', translation: 'to seem', pos: 'verb' },
      { lemma: 'segur', translation: 'sure, certain', pos: 'adjective' },
    ],
    examples: [
      { text: 'Què et sembla?', translation: 'What do you think?' },
      { text: 'No n’estic gens convençut.', translation: "I'm not at all convinced." },
    ],
    tags: ['opinions', 'hedging'],
  },
  {
    text: 'Ens veiem demà, adéu!',
    translation: 'See you tomorrow, bye!',
    context: 'Leaving. The default goodbye between people who will meet again.',
    register: 'informal',
    difficulty: 1,
    cefrHint: 'A1',
    naturalnessNote:
      '"Adéu" works for both hello and goodbye in passing, like "ciao". "A reveure" is noticeably more formal and mostly written or said to shopkeepers.',
    lifeAreaKeys: ['social', 'daily_life'],
    grammarPatterns: ['reciprocal_verbs'],
    vocab: [
      { lemma: 'veure’s', translation: 'to see each other', pos: 'verb' },
      { lemma: 'demà', translation: 'tomorrow', pos: 'adverb' },
    ],
    examples: [
      { text: 'Fins ara!', translation: 'See you in a bit!', note: 'Only if you will genuinely see them within hours.' },
      { text: 'Fins dilluns.', translation: 'See you Monday.' },
    ],
    tags: ['greetings', 'survival'],
  },
]

/* ========================================================================== */
/* Bureaucracy                                                                */
/* ========================================================================== */

const bureaucracy: CorpusPhrase[] = [
  {
    text: 'Vinc a empadronar-me. Tinc cita prèvia a les deu.',
    translation: "I'm here to register my address. I have an appointment at ten.",
    context: 'Arriving at the Ajuntament — the first bureaucratic errand of anyone moving to Catalonia.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'B1',
    regionTag: 'ES-CT',
    naturalnessNote:
      '"Empadronar-se" (registering on the padró) has no English equivalent and gates almost everything else — healthcare, schools, residency paperwork. "Cita prèvia" is the appointment you must book in advance; turning up without one generally means being sent home.',
    lifeAreaKeys: ['bureaucracy'],
    grammarPatterns: ['venir_a_purpose', 'reflexive_infinitive'],
    vocab: [
      { lemma: 'empadronar-se', translation: 'to register on the municipal roll', pos: 'verb' },
      { lemma: 'cita prèvia', translation: 'prior appointment', pos: 'noun', article: 'la' },
    ],
    examples: [
      { text: 'On he de demanar la cita prèvia?', translation: 'Where do I request the appointment?' },
      { text: 'Necessito el certificat d’empadronament.', translation: 'I need the certificate of registration.' },
    ],
    tags: ['ajuntament', 'moving'],
  },
  {
    text: 'Quins papers he de portar?',
    translation: 'What documents do I need to bring?',
    context: 'The question to ask at the end of every bureaucratic phone call, before you hang up.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote: '"Papers" is what people actually say for documents. "Documentació" is what the sign says.',
    lifeAreaKeys: ['bureaucracy'],
    grammarPatterns: ['haver_de_obligation', 'quin_questions'],
    vocab: [
      { lemma: 'paper', translation: 'paper, document', pos: 'noun', article: 'el', plural: 'papers' },
      { lemma: 'portar', translation: 'to bring, to carry', pos: 'verb' },
    ],
    examples: [
      { text: 'Cal portar l’original o n’hi ha prou amb una còpia?', translation: 'Do I need the original or is a copy enough?' },
      { text: 'Amb el passaport n’hi ha prou?', translation: 'Is the passport enough?' },
    ],
    tags: ['documents', 'questions'],
  },
  {
    text: 'Que em podria dir a quina finestreta he d’anar?',
    translation: 'Could you tell me which window I need to go to?',
    context: 'Lost in a government office. Said to whoever is nearest a desk.',
    register: 'formal',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      'Conditional "podria" is the politeness register for strangers in an official setting. "Em pot dir" is fine but flatter; "digui’m" is an order.',
    lifeAreaKeys: ['bureaucracy', 'daily_life'],
    grammarPatterns: ['conditional_politeness', 'indirect_questions'],
    vocab: [
      { lemma: 'finestreta', translation: 'counter, service window', pos: 'noun', article: 'la', plural: 'finestretes' },
      { lemma: 'poder', translation: 'to be able to', pos: 'verb' },
    ],
    examples: [
      { text: 'Que hi ha d’agafar número?', translation: 'Do I need to take a number?' },
      { text: 'És aquí la cua per a estrangeria?', translation: 'Is this the queue for the immigration office?' },
    ],
    tags: ['offices', 'politeness'],
  },
]

/* ========================================================================== */
/* Food, health, housing                                                      */
/* ========================================================================== */

const misc: CorpusPhrase[] = [
  {
    text: 'Ens porta el compte, si us plau?',
    translation: 'Could you bring us the bill, please?',
    context: 'Ending a meal. As in Germany, nobody brings it unprompted — you ask.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    regionTag: 'ES-CT',
    naturalnessNote:
      'Present tense as a request is normal and polite here — no conditional needed. Valencian speakers more often say "per favor" than "si us plau".',
    lifeAreaKeys: ['food'],
    grammarPatterns: ['present_as_request', 'weak_pronoun_ens'],
    vocab: [
      { lemma: 'compte', translation: 'bill, account', pos: 'noun', article: 'el', plural: 'comptes' },
      { lemma: 'portar', translation: 'to bring', pos: 'verb' },
    ],
    examples: [
      { text: 'Que ens pot posar dues canyes?', translation: 'Could we get two beers?' },
      { text: 'Ho paguem junt.', translation: "We'll pay together." },
    ],
    tags: ['restaurant', 'survival'],
  },
  {
    text: 'Sóc al·lèrgic als fruits secs. És greu?',
    translation: "I'm allergic to nuts. Is that a problem?",
    context: 'Checking a dish with a waiter. Worth being able to say without hesitating.',
    register: 'neutral',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      '"Fruits secs" covers nuts generally. Note "sóc" not "estic" — allergies are inherent, and this is one of the places Catalan and Spanish ser/estar intuitions do line up.',
    lifeAreaKeys: ['food', 'healthcare'],
    grammarPatterns: ['ser_vs_estar', 'a_preposition'],
    vocab: [
      { lemma: 'al·lèrgic', translation: 'allergic', pos: 'adjective' },
      { lemma: 'fruits secs', translation: 'nuts', pos: 'noun', article: 'els' },
    ],
    examples: [
      { text: 'Porta llet, això?', translation: 'Does this have milk in it?' },
      { text: 'Que ho poden fer sense gluten?', translation: 'Can you make it gluten-free?' },
    ],
    tags: ['dietary', 'restaurant'],
  },
  {
    text: 'Fa tres dies que em fa mal el coll.',
    translation: "My throat has been hurting for three days.",
    context: 'Describing a symptom at the CAP or the pharmacy.',
    register: 'neutral',
    difficulty: 3,
    cefrHint: 'B1',
    naturalnessNote:
      'Two things at once: "fa X que + present" for ongoing duration (never the perfect), and "em fa mal" — literally "it makes pain to me". English speakers reach for "el meu coll fa mal", which is wrong.',
    lifeAreaKeys: ['healthcare'],
    grammarPatterns: ['fa_que_duration', 'fer_mal'],
    vocab: [
      { lemma: 'coll', translation: 'neck, throat', pos: 'noun', article: 'el', plural: 'colls' },
      { lemma: 'fer mal', translation: 'to hurt', pos: 'verb' },
    ],
    examples: [
      { text: 'Em fa mal el cap des d’ahir.', translation: "I've had a headache since yesterday." },
      { text: 'Fa una setmana que no dormo bé.', translation: "I haven't slept well for a week." },
    ],
    tags: ['symptoms', 'doctor'],
  },
  {
    text: 'L’escalfador no funciona i no surt aigua calenta.',
    translation: "The boiler isn't working and there's no hot water.",
    context: 'Messaging the landlord. Be concrete: the symptom, not the diagnosis.',
    register: 'neutral',
    difficulty: 3,
    cefrHint: 'B1',
    lifeAreaKeys: ['housing'],
    grammarPatterns: ['present_tense', 'negation'],
    vocab: [
      { lemma: 'escalfador', translation: 'boiler, water heater', pos: 'noun', article: "l'", plural: 'escalfadors' },
      { lemma: 'aigua', translation: 'water', pos: 'noun', article: "l'", plural: 'aigües' },
    ],
    examples: [
      { text: 'Quan podrà venir algú a mirar-ho?', translation: 'When can someone come and look at it?' },
      { text: 'Fa dies que va malament.', translation: "It's been playing up for days." },
    ],
    tags: ['landlord', 'repairs'],
  },
  {
    text: 'Perdoni, que parla anglès? És que encara estic aprenent català.',
    translation: "Sorry, do you speak English? I'm still learning Catalan.",
    context: 'The escape hatch. Worth having ready so you can stay in the conversation instead of fleeing it.',
    register: 'formal',
    difficulty: 2,
    cefrHint: 'A2',
    naturalnessNote:
      'Saying the second half in Catalan is the whole point — it usually earns you patience and a slower repeat rather than an immediate switch to Spanish or English.',
    lifeAreaKeys: ['daily_life', 'social'],
    grammarPatterns: ['es_que_explanation', 'progressive'],
    vocab: [
      { lemma: 'aprendre', translation: 'to learn', pos: 'verb' },
      { lemma: 'encara', translation: 'still, yet', pos: 'adverb' },
    ],
    examples: [
      { text: 'Pot parlar més a poc a poc, si us plau?', translation: 'Could you speak more slowly, please?' },
      { text: 'Estic aprenent, però em costa.', translation: "I'm learning, but I find it hard." },
    ],
    tags: ['survival', 'meta'],
  },
]

export const CATALAN_CORPUS: CorpusPhrase[] = [...work, ...dailyLife, ...social, ...bureaucracy, ...misc]

/* ========================================================================== */
/* Dialogues                                                                  */
/* ========================================================================== */

export const CATALAN_DIALOGUES: CorpusDialogue[] = [
  {
    key: 'work_monday_catchup',
    lifeAreaKeys: ['work'],
    title: 'Monday morning at the office',
    situation: 'You arrive, coffee in hand, and a colleague asks about your weekend before the stand-up.',
    level: 'A2',
    speakers: [
      { label: 'Marta', role: 'colleague' },
      { label: 'Tu', role: 'you' },
    ],
    lines: [
      { speaker: 'Marta', text: 'Bon dia! Què tal el cap de setmana?', translation: 'Morning! How was your weekend?', note: '"Bon dia" is used all morning, not just at dawn.' },
      { speaker: 'Tu', text: 'Molt bé, gràcies. Vaig anar a la platja dissabte.', translation: 'Really good, thanks. I went to the beach on Saturday.', note: 'Periphrastic preterite: "vaig anar".' },
      { speaker: 'Marta', text: 'Déu n’hi do, quin temps que va fer! I diumenge?', translation: 'Wow, what weather we had! And Sunday?' },
      { speaker: 'Tu', text: 'Diumenge vaig quedar-me a casa. Estava cansat.', translation: 'Sunday I stayed home. I was tired.' },
      { speaker: 'Marta', text: 'Doncs mira, avui tenim reunió a les deu. Te n’havies enrecordat?', translation: "Well look, we've got a meeting at ten. Had you remembered?", note: '"Te n’havies" — stacked weak pronouns in the wild.' },
      { speaker: 'Tu', text: 'Uf, no. Gràcies per dir-m’ho.', translation: 'Ugh, no. Thanks for telling me.' },
    ],
  },
  {
    key: 'shop_returning',
    lifeAreaKeys: ['daily_life'],
    title: 'Returning something to a shop',
    situation: 'The shirt you bought last week is the wrong size and you have the receipt.',
    level: 'B1',
    speakers: [
      { label: 'Dependenta', role: 'shop assistant' },
      { label: 'Tu', role: 'you' },
    ],
    lines: [
      { speaker: 'Dependenta', text: 'Bon dia, digui’m.', translation: 'Morning, how can I help?', note: '"Digui’m" — literally "tell me" — is the standard shop opener.' },
      { speaker: 'Tu', text: 'Hola, volia canviar aquesta camisa. És massa petita.', translation: "Hi, I wanted to exchange this shirt. It's too small.", note: 'Imperfect "volia" for politeness.' },
      { speaker: 'Dependenta', text: 'Cap problema. Té el tiquet?', translation: 'No problem. Do you have the receipt?' },
      { speaker: 'Tu', text: 'Sí, el tinc aquí. Que en tenen, d’una talla més gran?', translation: 'Yes, I have it here. Do you have one in a bigger size?' },
      { speaker: 'Dependenta', text: 'Ara ho miro. En blau ens en queda una de la L.', translation: "I'll check. In blue we've got one left in L." },
      { speaker: 'Tu', text: 'Perfecte, me la quedo.', translation: "Perfect, I'll take it." },
    ],
  },
]

/* ========================================================================== */
/* Scenarios for the conversation simulator                                   */
/* ========================================================================== */

export const CATALAN_SCENARIOS: ScenarioTemplate[] = [
  {
    key: 'restaurant_order',
    title: 'Ordering dinner',
    lifeAreaKey: 'food',
    situation: 'You are at a busy restaurant in Gràcia. The waiter comes over to take your order.',
    difficulty: 2,
    learnerObjective: 'Order a drink and a main, and ask one question about the menu.',
    persona: {
      name: 'Cambrer',
      role: 'restaurant waiter',
      register: 'vostè',
      region: 'ES-CT',
      personality: 'Friendly but busy. Speaks at normal speed and does not simplify.',
      openingLine: 'Bona nit! Ja ho tenen decidit?',
    },
    usefulPhrases: [
      { text: 'Per mi, …', translation: 'For me, …' },
      { text: 'Què ens recomana?', translation: 'What do you recommend?' },
      { text: 'Porta carn, això?', translation: 'Does that have meat in it?' },
    ],
  },
  {
    key: 'ajuntament_padro',
    title: 'Registering at the Ajuntament',
    lifeAreaKey: 'bureaucracy',
    situation: 'You have a cita prèvia to register your address. The clerk calls your number.',
    difficulty: 4,
    learnerObjective: 'Explain why you are there, hand over your documents, and ask what happens next.',
    persona: {
      name: 'Funcionària',
      role: 'municipal clerk',
      register: 'vostè',
      region: 'ES-CT',
      personality:
        'Efficient and not unkind, but working through a queue. Uses official vocabulary and will not slow down unless asked.',
      openingLine: 'Número quaranta-dos? Següi, digui’m.',
    },
    usefulPhrases: [
      { text: 'Vinc a empadronar-me.', translation: "I'm here to register my address." },
      { text: 'Quins papers he de portar?', translation: 'What documents do I need?' },
      { text: 'Quan estarà llest?', translation: 'When will it be ready?' },
    ],
  },
  {
    key: 'flat_viewing',
    title: 'Viewing a flat',
    lifeAreaKey: 'housing',
    situation: 'You are viewing a flat in Poblenou. The owner shows you around and expects questions.',
    difficulty: 3,
    learnerObjective: 'Ask about the bills, the deposit and the neighbours, and say you will think about it.',
    persona: {
      name: 'Jordi',
      role: 'flat owner',
      register: 'tu',
      region: 'ES-CT',
      personality: 'Chatty, a bit of a salesman, keeps steering you away from the small kitchen.',
      openingLine: 'Passa, passa! Doncs mira, això és el menjador. Què, què et sembla?',
    },
    usefulPhrases: [
      { text: 'Els subministraments van a part?', translation: 'Are utilities separate?' },
      { text: 'Quant demaneu de fiança?', translation: 'How much is the deposit?' },
      { text: 'M’ho he de pensar.', translation: 'I need to think about it.' },
    ],
  },
  {
    key: 'making_plans',
    title: 'Making plans with a friend',
    lifeAreaKey: 'social',
    situation: 'A friend messages you about doing something this weekend. You are keen but busy Saturday.',
    difficulty: 2,
    learnerObjective: 'Propose an alternative day, agree a time and a place.',
    persona: {
      name: 'Laia',
      role: 'friend',
      register: 'tu',
      region: 'ES-CT',
      personality: 'Warm, uses a lot of particles and abbreviations, types the way people actually text.',
      openingLine: 'Ei! Què fas dissabte? Havia pensat d’anar al cine.',
    },
    usefulPhrases: [
      { text: 'Dissabte no puc, ho sento.', translation: "I can't on Saturday, sorry." },
      { text: 'Et va bé diumenge?', translation: 'Does Sunday work for you?' },
      { text: 'Quedem allà mateix.', translation: "Let's meet right there." },
    ],
  },
  {
    key: 'doctor_visit',
    title: 'At the CAP',
    lifeAreaKey: 'healthcare',
    situation: 'You have had a sore throat and a temperature for a few days. The doctor calls you in.',
    difficulty: 3,
    learnerObjective: 'Describe the symptom and how long it has lasted, and understand the instructions.',
    persona: {
      name: 'Dra. Puig',
      role: 'GP',
      register: 'vostè',
      region: 'ES-CT',
      personality: 'Calm and thorough, asks follow-up questions, explains the treatment clearly.',
      openingLine: 'Bon dia, segui. Què li passa?',
    },
    usefulPhrases: [
      { text: 'Fa tres dies que em fa mal el coll.', translation: 'My throat has hurt for three days.' },
      { text: 'He tingut febre.', translation: "I've had a temperature." },
      { text: 'Ho he de prendre cada quant?', translation: 'How often do I take it?' },
    ],
  },
  {
    key: 'work_standup',
    title: 'Explaining a delay at stand-up',
    lifeAreaKey: 'work',
    situation: 'Your part of the project is late. The team is waiting for your update.',
    difficulty: 4,
    learnerObjective: 'Explain what went wrong, what you are doing about it, and when it will be done.',
    persona: {
      name: 'Enric',
      role: 'team lead',
      register: 'tu',
      region: 'ES-CT',
      personality: 'Direct but fair. Wants specifics and a date, not apologies.',
      openingLine: 'Molt bé, anem per feina. Com ho tens, això de la migració?',
    },
    usefulPhrases: [
      { text: 'Vaig topar amb un problema.', translation: 'I ran into a problem.' },
      { text: 'Ho tindré llest dijous.', translation: "I'll have it ready by Thursday." },
      { text: 'Necessito un cop de mà.', translation: 'I need a hand.' },
    ],
  },
]

/* ========================================================================== */
/* Offline content                                                            */
/* ========================================================================== */

export const CATALAN_OFFLINE: OfflineContent = {
  assessmentItems: [
    {
      id: 'ca-a1-read-1',
      skill: 'reading',
      level: 'A1',
      prompt: 'Què vol dir: "Sóc d’Itàlia."?',
      kind: 'multiple_choice',
      options: ["I'm from Italy.", "I'm going to Italy.", 'I live in Italy.'],
      answer: "I'm from Italy.",
    },
    {
      id: 'ca-a2-read-1',
      skill: 'reading',
      level: 'A2',
      prompt: 'Què vol dir: "A quina hora plegues avui?"',
      kind: 'multiple_choice',
      options: [
        'What time do you finish work today?',
        'What time do you start today?',
        'What are you doing today?',
      ],
      answer: 'What time do you finish work today?',
    },
    {
      id: 'ca-a2-listen-1',
      skill: 'listening',
      level: 'A2',
      prompt: 'Listen, then choose what was said.',
      audioText: 'Ho podem comentar demà un moment?',
      kind: 'multiple_choice',
      options: [
        'Can we talk about it briefly tomorrow?',
        'Did we talk about it yesterday?',
        'We have to decide it today.',
      ],
      answer: 'Can we talk about it briefly tomorrow?',
    },
    {
      id: 'ca-b1-read-1',
      skill: 'comprehension',
      level: 'B1',
      prompt: 'Què vol dir: "No ho acabo de veure clar."?',
      kind: 'multiple_choice',
      options: [
        "I'm not quite convinced.",
        "I've just understood it.",
        "I can't see it at all.",
      ],
      answer: "I'm not quite convinced.",
    },
    {
      id: 'ca-b1-past-1',
      skill: 'comprehension',
      level: 'B1',
      prompt: 'Which sentence means "I went to the beach on Saturday"?',
      kind: 'multiple_choice',
      options: [
        'Dissabte vaig anar a la platja.',
        'Dissabte vaig a la platja.',
        'Dissabte aniré a la platja.',
      ],
      answer: 'Dissabte vaig anar a la platja.',
    },
    {
      id: 'ca-b1-listen-1',
      skill: 'listening',
      level: 'B1',
      prompt: 'Listen, then choose what was said.',
      audioText: 'Si necessites un cop de mà, digue-m’ho, que avui vaig bé de temps.',
      kind: 'multiple_choice',
      options: [
        "If you need a hand, tell me — I've got time today.",
        'I need a hand today because I am busy.',
        'Tell me when you have finished.',
      ],
      answer: "If you need a hand, tell me — I've got time today.",
    },
    {
      id: 'ca-b2-vocab-1',
      skill: 'vocabulary',
      level: 'B2',
      prompt: 'Which is the most natural way to disagree politely with a colleague?',
      kind: 'multiple_choice',
      options: ['No ho acabo de veure clar, la veritat.', 'No tens raó.', 'Això està malament.'],
      answer: 'No ho acabo de veure clar, la veritat.',
    },
    {
      id: 'ca-prod-1',
      skill: 'production',
      level: 'A2',
      prompt:
        'In Catalan: tell a colleague what you have on today. Two or three sentences. Write what you can — imperfect is fine.',
      kind: 'free_production',
    },
  ],

  missions: [
    {
      title: 'Order your coffee entirely in Catalan',
      description:
        'Go to a bar and do the whole exchange in Catalan, including paying. Do not switch to Spanish, even if they do — and they probably will.',
      tier: 'beginner',
      successCriteria: [
        'You ordered without switching',
        'You understood the price',
        'You stayed in Catalan after they answered you in Spanish',
      ],
      preparationPhrases: [
        { text: 'Un cafè amb llet, si us plau.', translation: 'A coffee with milk, please.' },
        { text: 'Per emportar, si us plau.', translation: 'To take away, please.' },
      ],
    },
    {
      title: 'Ask a colleague about their weekend — and follow up twice',
      description:
        'Open the conversation and keep it alive with two follow-up questions instead of letting it die after one exchange.',
      tier: 'intermediate',
      successCriteria: ['You opened in Catalan', 'You asked two follow-ups', 'It lasted more than a minute'],
      preparationPhrases: [
        { text: 'Què tal el cap de setmana?', translation: 'How was your weekend?' },
        { text: 'I què hi vas fer?', translation: 'And what did you do there?' },
      ],
    },
    {
      title: 'Phone somewhere and book an appointment',
      description:
        'Call the doctor, the hairdresser or a restaurant and book something. On the phone there are no gestures and no lip-reading — this is the real test.',
      tier: 'intermediate',
      successCriteria: ['You said why you were calling', 'You agreed a time', 'You checked what to bring'],
      preparationPhrases: [
        { text: 'Volia demanar hora.', translation: 'I wanted to book an appointment.' },
        { text: 'M’ho pot repetir, si us plau?', translation: 'Could you repeat that, please?' },
      ],
    },
    {
      title: 'Explain a blocked task in Catalan',
      description:
        'At your next stand-up or one-to-one, explain one thing that is stuck and what you need — in Catalan.',
      tier: 'advanced',
      successCriteria: ['You explained the cause', 'You said what you need', 'You handled a follow-up question'],
      preparationPhrases: [
        { text: 'Estic encallat perquè…', translation: "I'm stuck because…" },
        { text: 'Em podries fer un cop de mà?', translation: 'Could you give me a hand?' },
      ],
    },
  ],

  conversationReplies: [
    { reply: 'Molt bé. Alguna cosa més?', translation: 'Very good. Anything else?' },
    { reply: 'Entesos. M’ho pot explicar una mica millor?', translation: 'Understood. Could you explain it a bit better?' },
    { reply: 'D’acord, doncs ho fem així. Li va bé?', translation: "All right, let's do it that way. Does that work for you?" },
    { reply: 'Molt bé, i de temps com anem?', translation: 'Right, and how are we doing for time?' },
  ],

  productionPrompts: [
    {
      prompt: 'A colleague asks what you have on today. Answer in two or three sentences.',
      mode: 'writing',
      situation: 'Monday morning, by the coffee machine.',
      hints: ['Què tens avui?', 'He de…', 'Després…'],
      sampleAnswer:
        'Avui he de preparar una presentació. Després tinc dues reunions. I tu, com ho tens?',
    },
    {
      prompt: 'Say out loud what you did last weekend. Keep going for at least 30 seconds.',
      mode: 'speaking',
      situation: 'Answering the standard Monday question.',
      hints: ['Vaig anar…', 'Dissabte…', 'Diumenge vaig…'],
      sampleAnswer:
        'Dissabte vaig anar a escalar, i em vaig quedar ben cansat. Diumenge vaig estar a casa, vaig cuinar i poca cosa més. Tranquil, doncs.',
    },
  ],

  grammar: {
    patternKey: 'periphrastic_preterite',
    simple:
      'Catalan makes the everyday past with "vaig/vas/va/vam/vau/van" + the infinitive: "vaig anar" = I went, "va dir" = he said. ' +
      'It looks like "I go to go", which throws everyone at first. Do not try to reason about it — you will hear it hundreds of times this week and it will stop looking strange.',
    detailed:
      'Full set: vaig, vas (or vares), va, vam (vàrem), vau (vàreu), van (varen), each followed by the plain infinitive. ' +
      'There is also a simple preterite — aní, anares, anà — but it is literary. Using it in conversation sounds like reciting a nineteenth-century novel. ' +
      'Note the trap: "vaig anar" (I went) and "vaig a" + infinitive (I am going to) are different things, so "vaig a menjar" is "I am about to eat" while "vaig menjar" is "I ate".',
    examples: [
      { text: 'Ahir vaig veure la Marta.', translation: 'Yesterday I saw Marta.' },
      { text: 'Van arribar tard.', translation: 'They arrived late.' },
      { text: 'Què vas fer el cap de setmana?', translation: 'What did you do at the weekend?' },
      { text: 'Vaig a comprar pa.', translation: "I'm off to buy bread.", note: 'Contrast: "vaig a" + infinitive is the near future, not the past.' },
    ],
    comparison:
      'Spanish and French both use a one-word past here ("fui", "je suis allé"), so speakers of those languages tend to reach for "aní" or invent a compound. Catalan went its own way, and the periphrastic form is the one that is actually spoken.',
  },

  crossDomain: {
    bridgePhrases: [
      {
        text: 'Demà he de fer una presentació, així que avui vaig molt just de temps.',
        translation: "I have to give a presentation tomorrow, so I'm really pushed for time today.",
        builtFrom: ['Demà he de fer una presentació.'],
      },
      {
        text: 'Quan plegui passaré pel súper i després aniré al gimnàs.',
        translation: "When I finish work I'll stop at the supermarket and then go to the gym.",
        builtFrom: ['A quina hora plegues avui?', 'He de comprar verdura.'],
      },
    ],
    miniStory: {
      title: 'Un dimarts qualsevol',
      text: 'Avui ha estat un dia ple. Al matí vaig tenir dues reunions i després vaig haver de preparar una presentació. Al vespre vaig passar pel súper, perquè a la nevera no hi quedava res. Al gimnàs no hi vaig arribar. Demà serà un altre dia.',
      translation:
        'Today has been a full day. In the morning I had two meetings and afterwards I had to prepare a presentation. In the evening I stopped at the supermarket, because there was nothing left in the fridge. I never made it to the gym. Tomorrow is another day.',
      newElements: ['perquè a la nevera no hi quedava res', 'Demà serà un altre dia.'],
    },
    speakingPrompt: {
      prompt: 'Describe your day so that work connects to what you do afterwards.',
      situation: 'A colleague asks how your week is going.',
      mustUse: ['He de…', 'així que', 'després'],
    },
  },

  correctionRules: [
    {
      // Castilianism: "bueno" opening a sentence where Catalan wants "bé" or "doncs".
      pattern: /(^|[.!?]\s+)bueno\b/i,
      correct: () => 'Bé, …',
      why: '"Bueno" is Spanish. Catalan opens with "bé", "doncs" or "a veure" depending on what you mean.',
      severity: 'notable',
      errorType: 'castilianism',
    },
    {
      pattern: /\bvale\b/i,
      correct: () => "d'acord",
      why: '"Vale" is Spanish. Catalan says "d\'acord", "entesos" or just "va".',
      severity: 'notable',
      errorType: 'castilianism',
    },
    {
      pattern: /\bhasta luego\b/i,
      correct: () => 'fins ara',
      why: 'Use "fins ara", "fins després" or "adéu".',
      severity: 'notable',
      errorType: 'castilianism',
    },
    {
      // "tinc que" for obligation is a very common calque of Spanish "tengo que".
      pattern: /\btinc que\b/i,
      correct: () => 'he de',
      why: '"Tinc que" is a calque of Spanish "tengo que". Catalan obligation is "he de" (or "haig de").',
      severity: 'notable',
      errorType: 'calque_obligation',
    },
    {
      // Missing weak pronoun in the most frequent case of all.
      pattern: /\bno sé\b(?!\s)/i,
      correct: () => 'no ho sé',
      why: 'Catalan needs the pronoun: "no ho sé". Bare "no sé" only works when a question follows ("no sé què fer").',
      severity: 'minor',
      errorType: 'missing_weak_pronoun',
    },
  ],

  registerObjective: 'I can move between tu and vostè without having to think about it.',
  comprehensionGapNote:
    'Your comprehension is ahead of your production, which is the usual pattern in a bilingual environment: you understand everything and answer in Spanish. The plan weights speaking accordingly.',
}
