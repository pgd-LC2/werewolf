import { Moon, Sun } from 'lucide-react'
import { Button } from './Button'
import { useTheme } from '../../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="切换主题"
      className="border border-surface-highlight/50 text-gray-700 dark:text-gray-200 hover:bg-surface-highlight/60"
      onClick={toggleTheme}
    >
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </Button>
  )
}
