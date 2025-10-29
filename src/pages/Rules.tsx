import { RulesPanel } from '../components/game/RulesPanel'

export function Rules() {
  return (
    <div className="space-y-10 pb-12">
      <div className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-gray-500">规则页面</p>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold text-base-foreground sm:text-5xl">狼人杀规则手册</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            从身份分配到夜晚/白天阶段，完整梳理 10 人局的流程要求，帮助主持人迅速查找对应条目。
          </p>
        </div>
      </div>
      <RulesPanel />
    </div>
  )
}
