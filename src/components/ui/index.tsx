/**
 * UI primitives.
 *
 * Small and hand-rolled rather than a component library: the whole visual
 * language is ~10 components, and owning them keeps the "calm workspace" look
 * consistent instead of fighting a framework's defaults.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn, clamp } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-all disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:opacity-90 shadow-[var(--shadow-soft)]',
        secondary: 'bg-surface text-ink border border-line-strong hover:border-ink-faint',
        ghost: 'text-ink-muted hover:text-ink hover:bg-accent-soft',
        quiet: 'text-ink-muted hover:text-ink underline underline-offset-4 decoration-line-strong',
        danger: 'bg-critical text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] rounded-lg',
        md: 'h-10 px-4 text-sm rounded-[10px]',
        lg: 'h-12 px-6 text-[15px] rounded-xl',
        icon: 'h-9 w-9 rounded-lg',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  raised,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface',
        raised && 'shadow-[var(--shadow-soft)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-3', className)} {...props} />
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-lg text-ink', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ink-muted leading-relaxed', className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-11 px-3.5 rounded-[10px] bg-surface border border-line-strong text-ink text-sm',
        'placeholder:text-ink-faint transition-colors',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full px-3.5 py-3 rounded-[10px] bg-surface border border-line-strong text-ink text-sm leading-relaxed',
      'placeholder:text-ink-faint transition-colors resize-y min-h-[110px]',
      'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-[13px] font-medium text-ink-muted mb-1.5', className)}
      {...props}
    />
  )
}

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full h-11 px-3 rounded-[10px] bg-surface border border-line-strong text-ink text-sm',
      'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15',
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'

/* -------------------------------------------------------------------------- */
/* Badge & pill                                                               */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full font-medium', {
  variants: {
    tone: {
      neutral: 'bg-canvas text-ink-muted border border-line',
      accent: 'bg-accent-soft text-accent border border-transparent',
      positive: 'bg-transparent text-positive border border-positive/30',
      caution: 'bg-transparent text-caution border border-caution/30',
      critical: 'bg-transparent text-critical border border-critical/30',
    },
    size: {
      sm: 'text-[11px] px-2 py-0.5',
      md: 'text-xs px-2.5 py-1',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
})

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  className,
  tone = 'accent',
  showLabel = false,
}: {
  value: number
  className?: string
  tone?: 'accent' | 'positive' | 'caution' | 'critical'
  showLabel?: boolean
}) {
  const v = clamp(value)
  const toneColor = {
    accent: 'var(--accent)',
    positive: 'var(--positive)',
    caution: 'var(--caution)',
    critical: 'var(--critical)',
  }[tone]

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="h-1.5 flex-1 rounded-full bg-line overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${v}%`, backgroundColor: toneColor }}
        />
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums text-ink-muted w-9 text-right">{Math.round(v)}%</span>
      )}
    </div>
  )
}

/** Readiness colour scale: red below 35, amber to 70, green above. */
export function readinessTone(value: number): 'positive' | 'caution' | 'critical' {
  if (value >= 70) return 'positive'
  if (value >= 35) return 'caution'
  return 'critical'
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 mb-3', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-faint font-sans">
        {children}
      </h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && <div className="text-ink-faint mb-3">{icon}</div>}
      <p className="font-display text-base text-ink mb-1">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Alert({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'caution' | 'critical'
  children: React.ReactNode
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-canvas text-ink-muted',
    accent: 'border-accent/25 bg-accent-soft text-ink',
    caution: 'border-caution/30 bg-caution/5 text-ink',
    critical: 'border-critical/30 bg-critical/5 text-ink',
  }
  return (
    <div className={cn('rounded-[10px] border px-4 py-3 text-sm leading-relaxed', tones[tone], className)}>
      {children}
    </div>
  )
}

/** Skeleton block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line', className)} />
}
