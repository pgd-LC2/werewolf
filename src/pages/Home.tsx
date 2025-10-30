import { Moon } from 'lucide-react'
import { GameBoard } from '../components/game/GameBoard'

export function Home() {
  return (
    <div className="pb-12">
      <section className="space-y-10">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-moon" strokeWidth={2} />
            <p className="text-xs uppercase tracking-[0.4em] text-moon">夜幕降临</p>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold text-base-foreground sm:text-5xl md:text-6xl">
              狼人杀 · AI 自动推演
            </h1>
            <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300">
              10 人局全流程 AI 主持系统 · 夜间行动、白天投票、实时日志 · 谁是狼人？
            </p>
          </div>
        </div>
        <GameBoard />
      </section>
    </div>
  )
}
