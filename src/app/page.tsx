import { ArrowRight, Blend, Mic, Route, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AudioButton } from '@/components/audio-button'
import { Button, Card } from '@/components/ui'
import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { languages } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

/**
 * The same word, taught the way the app actually teaches it.
 *
 * Two languages rather than one, because the point of the section is that the
 * method is not about a particular language — and because a single example
 * would quietly re-imply that this is a German app.
 */
const EXAMPLES = [
  {
    code: 'de',
    language: 'German',
    speechTag: 'de-DE',
    word: 'Termin',
    gloss: 'appointment',
    lines: [
      { text: 'Ich möchte einen Termin vereinbaren.', en: "I'd like to make an appointment." },
      { text: 'Haben Sie nächste Woche einen Termin frei?', en: 'Do you have an appointment free next week?' },
      { text: 'Ich muss leider meinen Termin verschieben.', en: 'Unfortunately I have to reschedule my appointment.' },
    ],
  },
  {
    code: 'ca',
    language: 'Catalan',
    speechTag: 'ca-ES',
    word: 'hora',
    gloss: 'appointment',
    lines: [
      { text: 'Volia demanar hora.', en: 'I wanted to book an appointment.' },
      { text: 'Que en tindríeu alguna per la setmana que ve?', en: 'Would you have any next week?' },
      { text: "M'ho hauré de mirar, que aquell dia no puc.", en: "I'll have to look at that — I can't that day." },
    ],
  },
]

export default async function LandingPage() {
  const user = await getCurrentUser()
  if (user) redirect(user.onboardingCompletedAt ? '/home' : '/onboarding')

  // Only advertise languages that are actually available to start today.
  const db = await getDb()
  const available = await db
    .select({ code: languages.code, name: languages.name })
    .from(languages)
    .where(eq(languages.isTarget, true))
    .orderBy(languages.name)

  const names = available.map((l) => l.name)
  const examples = EXAMPLES.filter((e) => available.some((l) => l.code === e.code))

  return (
    <main className="min-h-dvh">
      <header className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
        <span className="font-display text-lg tracking-tight">Fluenta</span>
        <nav className="flex items-center gap-2">
          <Link href="/signin">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-20">
        <p className="text-[13px] uppercase tracking-[0.14em] text-ink-faint mb-5">
          {names.length ? `${names.join(' · ')} · personalized` : 'Personalized'}
        </p>
        <h1 className="font-display text-[2.75rem] leading-[1.08] sm:text-6xl max-w-3xl text-balance">
          Don&rsquo;t learn a language in the abstract. Learn the language your life actually
          requires.
        </h1>
        <p className="mt-6 text-lg text-ink-muted max-w-2xl leading-relaxed">
          Most apps hand everyone the same A1&ndash;B2 ladder. This one starts with where you live,
          what you do, and the conversations you keep avoiding &mdash; then builds a curriculum
          toward functional fluency in exactly those situations.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/signup">
            <Button size="lg">
              Build my roadmap
              <ArrowRight size={17} />
            </Button>
          </Link>
          <Link href="/signin">
            <Button size="lg" variant="secondary">
              I already have an account
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          {examples.map((example) => (
            <Card key={example.code} raised className="p-6 sm:p-7">
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-[13px] text-ink-faint">
                  Instead of{' '}
                  <span className="line-through">
                    {example.word} = {example.gloss}
                  </span>
                  , you learn:
                </p>
                <span className="text-[11px] uppercase tracking-wider text-ink-faint shrink-0 ml-3">
                  {example.language}
                </span>
              </div>
              <div className="space-y-3.5">
                {example.lines.map((line) => (
                  <div key={line.text} className="flex items-start gap-3">
                    <AudioButton
                      text={line.text}
                      lang={example.speechTag}
                      size="sm"
                      showSlow={false}
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="target-text text-[17px] leading-snug">{line.text}</p>
                      <p className="text-sm text-ink-muted mt-0.5">{line.en}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-sm text-ink-muted leading-relaxed max-w-2xl">
          Same word either way. But you leave with something you can say on the phone tomorrow
          &mdash; in the register the situation actually calls for.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 grid gap-5 sm:grid-cols-2">
        {[
          {
            icon: Route,
            title: 'A roadmap, not a level',
            body: 'Work, bureaucracy, neighbours, dating — each gets its own path from survival to fluent, with progress measured in things you can now do.',
          },
          {
            icon: Blend,
            title: 'Your life areas talk to each other',
            body: 'Language from work and the gym gets recombined into the sentences you actually say about your week. Memorized phrases become flexible ones.',
          },
          {
            icon: Mic,
            title: 'Output from day one',
            body: 'Roleplay a landlord, a hiring manager, a clerk at the town hall. Nobody interrupts you mid-sentence — feedback comes after, the way a good coach does it.',
          },
          {
            icon: Sparkles,
            title: 'Grammar only when you ask',
            body: 'No case drills, no conjugation tables. Patterns are absorbed from context; explanations are one click away when you actually want one.',
          },
        ].map((feature) => (
          <Card key={feature.title} className="p-6">
            <feature.icon size={19} className="text-accent mb-3.5" />
            <h3 className="font-display text-lg mb-2">{feature.title}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{feature.body}</p>
          </Card>
        ))}
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="font-display text-2xl mb-3">Learning more than one?</h2>
          <p className="text-ink-muted leading-relaxed max-w-2xl">
            Each language gets its own roadmap, its own life areas and its own review queue.
            Switch between them whenever you like &mdash; nothing is merged, nothing is lost, and
            coming back to one finds it exactly where you left it.
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-7 text-sm text-ink-faint">
          Built for learners who live in the language.
        </div>
      </footer>
    </main>
  )
}
