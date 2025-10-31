import { useEffect, useMemo, useRef, useState } from 'react'
import { PauseCircle, PlayCircle, Zap, X } from 'lucide-react'
import { useAiOrchestrator } from '../../hooks/useAiOrchestrator'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { AI_MODELS } from '../../lib/constants'

const DEFAULT_NAMES = ['月影', '霜狐', '长夜', '林风', '墨砚', '晨曦', '远山', '流萤', '青禾', '星潮']

const PHASE_LABELS: Record<string, string> = {
  RoleAssignment: '准备分配',
  Night: '夜幕降临',
  WerewolfAction: '狼人行动',
  SeerAction: '预言家查验',
  WitchAction: '女巫抉择',
  Day: '清晨醒来',
  Discussion: '讨论阶段',
  Voting: '投票阶段',
  HunterAction: '猎人行动',
  GameOver: '游戏结束'
}

const NIGHT_PHASES = new Set(['Night', 'WerewolfAction', 'SeerAction', 'WitchAction'])
const DAY_PHASES = new Set(['Day', 'Discussion', 'Voting'])

function getPhaseLabel(phase: string) {
  return PHASE_LABELS[phase] ?? phase
}

function formatPlayerStatus(isAlive: boolean) {
  return isAlive ? '存活' : '出局'
}

export function GameBoard({ initialNames = DEFAULT_NAMES }: { initialNames?: string[] }) {
  const orchestrator = useAiOrchestrator()
  const {
    state,
    runFullCycle,
    startGame,
    resetAllAgents,
    tempo,
    agentStates,
    aiStatus,
    selectedModel,
    setSelectedModel
  } = orchestrator

  const { paused, pause, resume } = tempo

  const [autoRunning, setAutoRunning] = useState(false)
  const [namesInput, setNamesInput] = useState(initialNames.join('\n'))
  const [showThinking, setShowThinking] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)

  const players = state.players
  const alivePlayers = players.filter((player) => player.isAlive)
  const phaseLabel = getPhaseLabel(state.phase)
  const isNightPhase = NIGHT_PHASES.has(state.phase)
  const isDayPhase = DAY_PHASES.has(state.phase)

  const dayLabel =
    state.phase === 'RoleAssignment'
      ? '等待开局'
      : state.day === 0
        ? '第 0 天 · 序章'
        : `第 ${state.day} 天`

  const parsedNames = useMemo(() => {
    const tokens = namesInput
      .split(/[\s,，、；;]+/)
      .map((token) => token.trim())
      .filter(Boolean)

    const result = [...tokens]
    while (result.length < 10) {
      result.push(`Player ${result.length + 1}`)
    }

    return result.slice(0, 10)
  }, [namesInput])

  const autoStatus = autoRunning ? (paused ? '自动暂停' : '自动执行中') : '手动操作'

  const aiStatusMessage = useMemo(() => {
    if (aiStatus.enabled) return null
    if (aiStatus.reason === 'missing_key') {
      return 'AI 引擎未配置 OpenRouter API Key，系统已切换至预设策略自动推进。'
    }
    const detail = aiStatus.lastError ? `详情：${aiStatus.lastError}` : ''
    return `AI 引擎调用失败，已切换至预设策略。${detail}`
  }, [aiStatus])

  const prepareNewGame = () => {
    resetAllAgents()
    startGame(parsedNames)
  }

  const handleStartGame = () => {
    setAutoRunning(false)
    pause()
    window.location.reload()
  }

  const handleOneClickStart = () => {
    prepareNewGame()
    resume()
    setAutoRunning(true)
  }

  const handlePauseToggle = () => {
    if (!autoRunning) return
    if (paused) {
      resume()
    } else {
      pause()
    }
  }

  const runFullCycleRef = useRef(runFullCycle)
  useEffect(() => {
    runFullCycleRef.current = runFullCycle
  }, [runFullCycle])

  const isRunningRef = useRef(false)

  useEffect(() => {
    if (!autoRunning || isRunningRef.current) return

    isRunningRef.current = true
    let cancelled = false

    console.log('[GameBoard] 启动自动执行流程')

    ;(async () => {
      try {
        await runFullCycleRef.current()
        console.log('[GameBoard] 自动执行流程完成')
      } catch (error) {
        console.error('[GameBoard] 自动执行流程出错:', error)
      } finally {
        isRunningRef.current = false
        if (!cancelled) {
          setAutoRunning(false)
          console.log('[GameBoard] 自动执行流程结束，autoRunning 已设为 false')
        }
      }
    })()

    return () => {
      cancelled = true
      console.log('[GameBoard] useEffect cleanup 被调用')
    }
  }, [autoRunning])

  const aiPanels = players.map((player) => {
    const offline = !aiStatus.enabled
    const agentState = agentStates[player.id]
    const lastResponse = agentState?.lastResponse
    const aiAction = lastResponse?.action
    const structured = aiAction?.action
    const targetPlayer =
      structured?.targetId != null ? players.find((candidate) => candidate.id === structured.targetId) : undefined
    const targetLabel = targetPlayer ? `#${targetPlayer.id} ${targetPlayer.name}` : null
    const confidence = offline
      ? '—'
      : aiAction?.confidence != null
        ? `${Math.round(aiAction.confidence * 100)}%`
        : agentState?.loading
          ? agentState?.retryCount && agentState.retryCount > 0
            ? `重试中 (${agentState.retryCount}/3)`
            : '思考中'
          : '无'
    const speechText = offline
      ? 'AI 离线，使用默认策略推演。'
      : aiAction?.speech?.trim() ||
        (agentState?.loading
          ? agentState?.retryCount && agentState.retryCount > 0
            ? `正在重试 AI 请求（第 ${agentState.retryCount} 次）...`
            : '生成中…'
          : '暂无发言')
    const planText = offline ? '默认策略' : aiAction?.plan || '未提供计划'
    const actionText = offline
      ? '默认策略'
      : structured
          ? `${structured.type}${structured.targetId != null && targetLabel ? ` → ${targetLabel}` : ''}`
          : null
    const thinkingText = offline
      ? 'AI 离线，无思考记录。'
      : lastResponse?.thinking?.trim() || '未公布思考过程'
    return {
      player,
      confidence,
      offline,
      speechText,
      planText,
      actionText,
      thinkingText
    }
  })

  const containerTone = cn(
    'space-y-8 rounded-[32px] border p-6 shadow-soft transition-all duration-700',
    isNightPhase
      ? 'border-indigo-900/40 bg-gradient-to-br from-slate-950 via-indigo-950/80 to-violet-950/60 text-slate-100 shadow-[0_0_80px_-20px_rgba(99,102,241,0.3)]'
      : 'border-surface-highlight/50 bg-gradient-to-br from-blue-50/80 via-white to-slate-50/80 text-slate-900 dark:border-indigo-900/30 dark:from-slate-900 dark:via-indigo-950/60 dark:to-slate-950 dark:text-slate-100'
  )

  const phaseBadge = cn(
    'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.3em]',
    isNightPhase
      ? 'border border-indigo-400/50 bg-indigo-500/15 text-indigo-200 shadow-[0_0_12px_rgba(129,140,248,0.2)]'
      : isDayPhase
        ? 'border border-amber-500/50 bg-amber-400/20 text-amber-700 shadow-[0_0_12px_rgba(251,191,36,0.15)] dark:text-amber-200'
        : 'border border-violet-500/50 bg-violet-500/15 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
  )

  return (
    <section className={containerTone}>
      <header className='space-y-4'>
        <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.4em] text-gray-500 dark:text-gray-400'>{dayLabel}</p>
            <h2 className='mt-1 text-3xl font-semibold'>狼人杀全自动对局</h2>
            <p className='mt-2 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-300'>
              <span className={phaseBadge}>{phaseLabel}</span>
              <span>
                阵营状态：
                {state.winner === 'none'
                  ? `狼人 ${alivePlayers.filter((player) => player.role === 'Werewolf').length} / 村民线 ${
                      alivePlayers.length - alivePlayers.filter((player) => player.role === 'Werewolf').length
                    }`
                  : `${state.winner === 'Werewolves' ? '狼人阵营胜利' : '好人阵营胜利'}`}
              </span>
            </p>
            {aiStatusMessage ? (
              <p className='mt-2 rounded-full border border-amber-400/40 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-300/30 dark:bg-amber-500/10 dark:text-amber-200'>
                {aiStatusMessage}
              </p>
            ) : null}
            {state.winner !== 'none' ? (
              <p className='mt-2 text-sm font-medium text-accent'>
                胜利阵营：{state.winner === 'Werewolves' ? '狼人' : '好人'}
              </p>
            ) : null}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='primary'
              onClick={handleOneClickStart}
              disabled={autoRunning || state.phase === 'GameOver'}
              className='text-xs uppercase tracking-[0.3em]'
            >
              <Zap className='mr-2 h-4 w-4' />
              一键全程
            </Button>
            <Button variant='muted' onClick={handleStartGame} className='text-xs uppercase tracking-[0.3em]'>
              <PlayCircle className='mr-2 h-4 w-4' />
              重置
            </Button>
            <Button
              variant='ghost'
              onClick={handlePauseToggle}
              disabled={!autoRunning}
              className='text-xs uppercase tracking-[0.3em]'
            >
              {paused ? <PlayCircle className='mr-2 h-4 w-4' /> : <PauseCircle className='mr-2 h-4 w-4' />}
              {paused ? '继续' : '暂停'}
            </Button>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-300'>
          <span>当前模式：{autoStatus}</span>
        </div>
      </header>

      <div className='space-y-6'>
        <div className='grid gap-6 lg:grid-cols-[1fr_320px]'>
          <section className='space-y-6'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-semibold tracking-[0.3em] text-gray-500 dark:text-gray-300'>玩家席位</h3>
              <span className='text-xs text-gray-500 dark:text-gray-400'>
                存活 {alivePlayers.length} / {players.length}
              </span>
            </div>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5'>
              {players.map((player) => {
                const hasAiData = agentStates[player.id]?.lastResponse
                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={cn(
                      'group relative rounded-3xl border px-3 py-4 text-left transition-all duration-300',
                      player.isAlive
                        ? 'border-indigo-200/60 bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:scale-[1.02] backdrop-blur dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-slate-100'
                        : 'border-red-500/60 bg-red-500/15 text-red-600 shadow-[0_0_20px_-8px_rgba(220,38,38,0.4)] dark:border-red-400/60 dark:bg-red-950/40 dark:text-red-300',
                      hasAiData && 'cursor-pointer'
                    )}
                    disabled={!hasAiData}
                  >
                    {hasAiData && (
                      <div className='absolute -right-1 -top-1 h-3 w-3 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-indigo-950'></div>
                    )}
                    <p className='text-sm font-semibold'>
                      #{player.id} {player.name}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>身份：{player.role}</p>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>状态：{formatPlayerStatus(player.isAlive)}</p>
                    {player.lastNightRoleResult ? (
                      <p className='mt-2 rounded-full bg-black/5 px-2.5 py-1.5 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-300'>
                        {player.lastNightRoleResult}
                      </p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          <aside className='space-y-4'>
          <div className='space-y-3 rounded-3xl border border-indigo-200/50 bg-indigo-50/30 p-4 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/20'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>
              AI 模型
            </p>
            <select
              className='w-full rounded-2xl border border-indigo-200/60 bg-white/60 p-3 text-sm outline-none transition focus-visible:border-moon focus-visible:ring-2 focus-visible:ring-moon/30 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-slate-100'
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {AI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
            {(() => {
              const current = AI_MODELS.find((m) => m.id === selectedModel)
              if (!current) return null

              const costColors = {
                low: 'text-green-600 dark:text-green-400',
                medium: 'text-amber-600 dark:text-amber-400',
                high: 'text-red-600 dark:text-red-400'
              }

              const costLabels = {
                low: '低成本',
                medium: '中等成本',
                high: '高成本'
              }

              return (
                <div className='space-y-1.5'>
                  <p className='text-xs text-gray-600 dark:text-gray-300'>{current.description}</p>
                  <div className='flex items-center gap-3 text-xs'>
                    <span className='rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'>
                      上下文: {current.contextWindow}
                    </span>
                    <span className={cn('rounded-full px-2.5 py-1 font-medium', costColors[current.costLevel])}>
                      {costLabels[current.costLevel]}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className='space-y-2 rounded-3xl border border-indigo-200/50 bg-indigo-50/30 p-4 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/20'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>
              玩家昵称
            </p>
            <textarea
              className='h-32 w-full rounded-2xl border border-indigo-200/60 bg-white/60 p-3 outline-none transition focus-visible:border-moon focus-visible:ring-2 focus-visible:ring-moon/30 dark:border-indigo-900/60 dark:bg-indigo-950/40'
              value={namesInput}
              onChange={(event) => setNamesInput(event.target.value)}
              placeholder='按行或逗号输入 10 位玩家昵称'
            />
            <p className='text-xs text-gray-500 dark:text-gray-400'>不足 10 位时会自动补全默认昵称。</p>
          </div>

        </aside>
        </div>

        <section className='rounded-3xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 p-6 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-purple-950/20'>
          <div className='mb-4 flex items-center justify-between'>
            <h3 className='text-sm font-semibold tracking-[0.3em] text-gray-500 dark:text-gray-300'>当前AI处理状态</h3>
            <label className='flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
              <input
                type='checkbox'
                checked={showThinking}
                onChange={(event) => setShowThinking(event.target.checked)}
                className='h-3 w-3 rounded border-gray-400 accent-accent'
              />
              显示思考过程
            </label>
          </div>

          {(() => {
            const activePlayer = players.find(p => agentStates[p.id]?.loading)
            if (!activePlayer) {
              return (
                <div className='rounded-2xl border border-indigo-200/40 bg-white/60 p-6 text-center text-sm text-gray-500 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-gray-400'>
                  {state.phase === 'RoleAssignment' ? '等待游戏开始...' : '等待下一个AI行动...'}
                </div>
              )
            }

            const aiPanel = aiPanels.find(p => p.player.id === activePlayer.id)

            return (
              <div className='space-y-3 rounded-2xl border border-indigo-200/60 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-indigo-900/60 dark:bg-indigo-950/50'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='font-semibold text-slate-900 dark:text-slate-100'>
                      #{activePlayer.id} {activePlayer.name}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                      {activePlayer.role} · {phaseLabel}
                    </p>
                  </div>
                  <div className='flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400'>
                    <div className='h-2 w-2 animate-pulse rounded-full bg-indigo-600 dark:bg-indigo-400'></div>
                    思考中...
                  </div>
                </div>

                {aiPanel && (
                  <div className='space-y-2 text-sm'>
                    {aiPanel.speechText && (
                      <div>
                        <p className='text-xs font-medium text-gray-500 dark:text-gray-400'>发言内容</p>
                        <p className='mt-1 text-base-foreground dark:text-slate-100'>{aiPanel.speechText}</p>
                      </div>
                    )}
                    {aiPanel.planText && (
                      <div>
                        <p className='text-xs font-medium text-gray-500 dark:text-gray-400'>行动计划</p>
                        <p className='mt-1 text-gray-700 dark:text-gray-300'>{aiPanel.planText}</p>
                      </div>
                    )}
                    {aiPanel.actionText && (
                      <div>
                        <p className='text-xs font-medium text-gray-500 dark:text-gray-400'>决策结果</p>
                        <p className='mt-1 text-gray-700 dark:text-gray-300'>{aiPanel.actionText}</p>
                      </div>
                    )}
                    {showThinking && aiPanel.thinkingText && (
                      <div className='rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/40'>
                        <p className='text-xs font-medium text-gray-500 dark:text-gray-400'>推理过程</p>
                        <p className='mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300'>{aiPanel.thinkingText}</p>
                      </div>
                    )}
                    {typeof aiPanel.confidence === 'number' && !aiPanel.offline && (
                      <div className='flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
                        <span>信心指数：</span>
                        <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700'>
                          <div
                            className='h-full bg-indigo-500 transition-all dark:bg-indigo-400'
                            style={{ width: `${(aiPanel.confidence || 0) * 100}%` }}
                          ></div>
                        </div>
                        <span>{Math.round((aiPanel.confidence || 0) * 100)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </section>

        <section className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-semibold tracking-[0.3em] text-gray-500 dark:text-gray-300'>对局日志</h3>
            <span className='text-xs text-gray-500 dark:text-gray-400'>共 {state.gameLog.length} 条记录</span>
          </div>
        <div className='max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-indigo-200/60 bg-white/80 p-4 text-sm text-base-foreground shadow-inner dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-slate-100'>
          {state.gameLog.length ? (
            state.gameLog.map((log, index) => (
              <p
                key={`${log}-${index}`}
                className='rounded-xl bg-indigo-50/50 px-3 py-2 text-sm font-medium text-base-foreground dark:bg-indigo-950/40'
              >
                {log}
              </p>
            ))
          ) : (
            <p className='text-sm text-gray-500 dark:text-gray-400'>对局尚未开始，等待主持人开场。</p>
          )}
        </div>

        {state.highlights.length ? (
          <div className='space-y-2 rounded-2xl border border-indigo-200/60 bg-white/80 p-4 text-xs text-gray-600 shadow-inner dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-slate-200'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>关键事件</p>
            <ul className='space-y-1'>
              {state.highlights.map((item, index) => (
                <li key={`${item}-${index}`} className='rounded-xl bg-indigo-50/50 px-3 py-2 dark:bg-indigo-950/40'>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      </div>

      {selectedPlayerId !== null && (() => {
        const selectedPlayer = players.find(p => p.id === selectedPlayerId)
        const agentState = agentStates[selectedPlayerId]
        const aiPanel = aiPanels.find(p => p.player.id === selectedPlayerId)

        if (!selectedPlayer || !aiPanel) return null

        const isLoading = agentState?.loading || false
        const isStaleData = !isLoading && agentState?.lastResponse

        return (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'
            onClick={() => setSelectedPlayerId(null)}
          >
            <div
              className='relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-indigo-200/60 bg-white p-6 shadow-2xl dark:border-indigo-900/60 dark:bg-slate-900'
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedPlayerId(null)}
                className='absolute right-4 top-4 rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
              >
                <X className='h-5 w-5' />
              </button>

              <div className='space-y-4'>
                <div>
                  <h3 className='text-2xl font-bold text-slate-900 dark:text-slate-100'>
                    #{selectedPlayer.id} {selectedPlayer.name}
                  </h3>
                  <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                    {selectedPlayer.role} · {formatPlayerStatus(selectedPlayer.isAlive)}
                  </p>
                  {isStaleData && (
                    <p className='mt-2 inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400'>
                      上一次返回
                    </p>
                  )}
                  {isLoading && (
                    <div className='mt-2 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400'>
                      <div className='h-2 w-2 animate-pulse rounded-full bg-indigo-600 dark:bg-indigo-400'></div>
                      正在生成中...
                    </div>
                  )}
                </div>

                <div className='space-y-4'>
                  {aiPanel.speechText && (
                    <div className='rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30'>
                      <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
                        发言内容
                      </p>
                      <p className='mt-2 text-base text-slate-900 dark:text-slate-100'>
                        {aiPanel.speechText}
                      </p>
                    </div>
                  )}

                  {aiPanel.planText && (
                    <div className='rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30'>
                      <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
                        行动计划
                      </p>
                      <p className='mt-2 text-sm text-gray-700 dark:text-gray-300'>
                        {aiPanel.planText}
                      </p>
                    </div>
                  )}

                  {aiPanel.actionText && (
                    <div className='rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30'>
                      <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
                        决策结果
                      </p>
                      <p className='mt-2 text-sm font-medium text-slate-900 dark:text-slate-100'>
                        {aiPanel.actionText}
                      </p>
                    </div>
                  )}

                  {aiPanel.confidence && !aiPanel.offline && (
                    <div className='rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30'>
                      <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
                        信心指数
                      </p>
                      <div className='mt-2 flex items-center gap-3'>
                        <div className='h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700'>
                          <div
                            className='h-full bg-indigo-500 transition-all dark:bg-indigo-400'
                            style={{ width: aiPanel.confidence }}
                          ></div>
                        </div>
                        <span className='text-sm font-medium text-slate-900 dark:text-slate-100'>
                          {aiPanel.confidence}
                        </span>
                      </div>
                    </div>
                  )}

                  {aiPanel.thinkingText && aiPanel.thinkingText !== '未公布思考过程' && (
                    <div className='rounded-2xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/30'>
                      <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
                        推理过程
                      </p>
                      <p className='mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap'>
                        {aiPanel.thinkingText}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </section>
  )
}
