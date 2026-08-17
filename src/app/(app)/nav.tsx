'use client'

import {
  BookMarked,
  BrainCircuit,
  Compass,
  GraduationCap,
  Home,
  LineChart,
  LogOut,
  MessagesSquare,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { signOutAction } from '@/server/actions/auth'

import { LanguageSwitcher, type SwitcherLanguage } from './language-switcher'

const NAV = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/learn', label: 'Learn', icon: GraduationCap },
  { href: '/practice', label: 'Practice', icon: MessagesSquare },
  { href: '/missions', label: 'Missions', icon: Compass },
  { href: '/phrasebook', label: 'Phrasebook', icon: BookMarked },
  { href: '/progress', label: 'Progress', icon: LineChart },
  { href: '/tutor', label: 'AI Tutor', icon: Sparkles },
  { href: '/grammar', label: 'Grammar', icon: BrainCircuit, secondary: true },
]

/** Primary nav gets a bottom bar on mobile; five items is what fits legibly. */
const MOBILE_NAV = NAV.slice(0, 5)

export function AppNav({
  userName,
  dueCount,
  liveAi,
  languages,
  activeLanguage,
}: {
  userName: string
  dueCount: number
  liveAi: boolean
  languages: SwitcherLanguage[]
  activeLanguage: string
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-line bg-surface sticky top-0 h-dvh">
        <div className="px-5 py-5">
          <Link href="/home" className="font-display text-lg">
            Fluenta
          </Link>
          <p className="text-xs text-ink-faint mt-0.5 truncate">{userName}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(item.href)}
              badge={item.href === '/learn' && dueCount > 0 ? dueCount : undefined}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-line space-y-2">
          <LanguageSwitcher languages={languages} activeCode={activeLanguage} />

          {!liveAi && (
            <div className="px-3 py-2 rounded-lg bg-canvas border border-line">
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Running on built-in content. Add an API key for live generation.
              </p>
            </div>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-faint hover:text-ink hover:bg-canvas transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/*
        Mobile top bar. Exists mainly to carry the language switcher: the
        sidebar is hidden below lg and the bottom bar only fits five
        destinations, so without this, switching language would be a
        desktop-only feature.
      */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-2.5 border-b border-line bg-surface/95 backdrop-blur-sm">
        <Link href="/home" className="font-display text-base shrink-0">
          Fluenta
        </Link>
        <div className="ml-auto w-44">
          <LanguageSwitcher languages={languages} activeCode={activeLanguage} placement="below" />
        </div>
      </header>

      {/* Mobile bottom bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm">
        <div className="flex">
          {MOBILE_NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] relative transition-colors',
                  active ? 'text-accent' : 'text-ink-faint',
                )}
              >
                <item.icon size={19} />
                {item.label}
                {item.href === '/learn' && dueCount > 0 && (
                  <span className="absolute top-1.5 right-[22%] h-1.5 w-1.5 rounded-full bg-critical" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  secondary,
}: {
  href: string
  label: string
  icon: typeof Home
  active: boolean
  badge?: number
  secondary?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        active ? 'bg-accent-soft text-accent font-medium' : 'text-ink-muted hover:text-ink hover:bg-canvas',
        secondary && !active && 'text-ink-faint',
      )}
    >
      <Icon size={17} />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <Badge tone="critical" size="sm">
          {badge}
        </Badge>
      )}
    </Link>
  )
}
