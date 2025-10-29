import { useEffect, useState } from 'react'
import { MoonStar } from 'lucide-react'
import { Button } from '../ui/Button'
import { ThemeToggle } from '../ui/ThemeToggle'

const isRulesRoute = () => {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.replace(/^#/, '')
  return hash === '/rules' || hash === 'rules'
}

export function Header() {
  const [onRulesPage, setOnRulesPage] = useState(isRulesRoute())

  useEffect(() => {
    const syncRoute = () => setOnRulesPage(isRulesRoute())
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const handleViewRules = () => {
    if (onRulesPage) {
      window.location.hash = ''
    } else {
      window.location.hash = '#/rules'
    }
  }

  const handleLogoClick = () => {
    window.location.hash = ''
  }

  return (
    <header className="sticky top-4 z-30">
      <div className="flex items-center justify-between rounded-3xl border border-surface-highlight/50 bg-base/80 px-4 py-3 shadow-subtle backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-highlight text-base-foreground transition hover:scale-105"
            aria-label="返回主持面板"
          >
            <MoonStar size={18} strokeWidth={1.5} />
          </button>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.24em] uppercase text-gray-600 dark:text-gray-200">
              Werewolf Console
            </p>
            <p className="text-xs text-gray-500">{onRulesPage ? '规则手册' : '狼人杀主持面板'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="primary"
            className="hidden text-xs uppercase tracking-[0.3em] sm:inline-flex"
            onClick={handleViewRules}
          >
            {onRulesPage ? '返回主持面板' : '查看规则'}
          </Button>
        </div>
      </div>
    </header>
  )
}
