import type { Metadata, Viewport } from 'next'

import { productionConfigProblems } from '@/server/config'

import './globals.css'
import { SetupRequired } from './setup-required'

export const metadata: Metadata = {
  title: {
    default: 'Fluenta — the German you actually need',
    template: '%s · Fluenta',
  },
  description:
    'A personalized language coach that builds your curriculum from your real life — your job, your city, your errands — instead of a generic A1-to-B2 course.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // A misconfigured production deploy renders an explanation instead of the
  // app. Checked at the root so it covers every route, and so no page ever
  // reaches a database that isn't there. In development this is always empty.
  const problems = productionConfigProblems()

  return (
    <html lang="en" suppressHydrationWarning>
      <body>{problems.length ? <SetupRequired problems={problems} /> : children}</body>
    </html>
  )
}
