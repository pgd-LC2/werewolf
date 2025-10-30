import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'muted' | 'ghost'
type ButtonSize = 'md' | 'sm' | 'icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground shadow-md hover:bg-accent/90 hover:shadow-lg border-transparent',
  muted: 'bg-surface border border-indigo-200/50 text-base-foreground hover:bg-surface-highlight/80 dark:border-indigo-900/40',
  ghost: 'bg-transparent border border-transparent text-base-foreground hover:bg-indigo-100/50 dark:hover:bg-indigo-950/30'
}

const sizeStyles: Record<ButtonSize, string> = {
  md: 'h-10 px-5 text-sm font-medium',
  sm: 'h-9 px-4 text-xs font-medium',
  icon: 'h-10 w-10 flex items-center justify-center'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'muted', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'rounded-pill transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-accent/70',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
