import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  subtle?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, subtle = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-pill border bg-transparent px-4 text-sm text-base-foreground placeholder:text-gray-500',
          'focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-accent/70',
          subtle ? 'border-transparent bg-transparent' : 'border-surface-highlight/70 bg-surface',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
