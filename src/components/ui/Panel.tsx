import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-surface-highlight/50 bg-surface/80 p-6 shadow-subtle backdrop-blur-xs',
        className
      )}
      {...props}
    />
  )
}
