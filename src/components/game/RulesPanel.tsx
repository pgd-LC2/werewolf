import type { RuleCategory, RuleItem } from '../../lib/rules'
import { RULE_OVERVIEW, WEREWOLF_RULES } from '../../lib/rules'

export function RulesPanel() {
  const categories = Object.entries(WEREWOLF_RULES) as [RuleCategory, RuleItem[]][]

  return (
    <section id="rules" className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-gray-500">规则手册</p>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold text-base-foreground">狼人杀规则总览</h2>
          <p className="text-sm text-gray-500">
            完整记录 10 人标准局的身份配置、夜晚与白天流程，帮助主持人与玩家快速对齐游戏节奏。
          </p>
        </div>
      </header>

      <div className="grid gap-4 rounded-3xl border border-surface-highlight/60 bg-surface p-6 text-sm text-gray-600 dark:bg-slate-900 dark:text-gray-300">
        {RULE_OVERVIEW.map((item) => (
          <p key={item} className="rounded-2xl border border-surface-highlight/40 bg-white/5 px-4 py-2 leading-relaxed dark:bg-white/10">
            {item}
          </p>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map(([category, rules]) => (
          <div
            key={category}
            className="space-y-4 rounded-3xl border border-surface-highlight/60 bg-base/70 p-6 shadow-subtle dark:bg-slate-900/80"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-500">{category}</h3>
            <div className="space-y-4">
              {rules.map((rule) => (
                <article key={rule.title} className="space-y-2 rounded-2xl border border-surface-highlight/40 bg-white/5 p-4 dark:bg-white/10">
                  <h4 className="text-base font-semibold text-base-foreground">{rule.title}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-300">{rule.description}</p>
                  {rule.details ? (
                    <ul className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                      {rule.details.map((detail) => (
                        <li key={detail} className="flex gap-2">
                          <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-accent"></span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
