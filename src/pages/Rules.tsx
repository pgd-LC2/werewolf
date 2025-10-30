import { BookOpen } from 'lucide-react'
import { RulesPanel } from '../components/game/RulesPanel'

export function Rules() {
  return (
    <div className="space-y-10 pb-12">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-wolf" strokeWidth={2} />
          <p className="text-xs uppercase tracking-[0.4em] text-wolf">游戏规则</p>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold text-base-foreground sm:text-5xl md:text-6xl">
            狼人杀规则手册
          </h1>
          <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300">
            10 人局完整流程 · 身份分配、夜晚行动、白天投票 · 主持人速查手册
          </p>
        </div>
      </div>
      <RulesPanel />
    </div>
  )
}
