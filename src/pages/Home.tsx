import { GameBoard } from '../components/game/GameBoard'

export function Home() {
  return (
    <div className="pb-12">
      <section className="space-y-10">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-500">主持中心</p>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-base-foreground sm:text-5xl">狼人杀 · 10 人局主持面板</h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              集成夜间行动、白天投票与实时日志的全流程控制台，帮助你以极简界面高效推进每一场狼人杀对局。
            </p>
          </div>
        </div>
        <GameBoard />
      </section>
    </div>
  )
}
