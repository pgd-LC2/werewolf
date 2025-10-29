import { useEffect, useMemo, useState } from 'react'
import { PauseCircle, PlayCircle, Zap } from 'lucide-react'
import { useAiOrchestrator } from '../../hooks/useAiOrchestrator'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

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
    runNightSequence,
    runDaySequence,
    runFullCycle,
    startGame,
    resetAllAgents,
    tempo,
    agentStates,
    aiStatus
  } = orchestrator

  const { delayMs: tempoDelay, skipDelays, paused, setDelay, setSkipDelays, pause, resume } = tempo

  const [autoRunning, setAutoRunning] = useState(false)
  const [namesInput, setNamesInput] = useState(initialNames.join('\n'))
  const [showThinking, setShowThinking] = useState(false)
  const [localDelay, setLocalDelay] = useState(tempoDelay)

  useEffect(() => {
    setLocalDelay(tempoDelay)
  }, [tempoDelay])

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

  const ensureGameStarted = () => {
    if (state.phase === 'RoleAssignment') {
      startGame(parsedNames)
    }
  }

  const prepareNewGame = () => {
    resetAllAgents()
    startGame(parsedNames)
  }

  const handleStartGame = () => {
    prepareNewGame()
    setSkipDelays(false)
    resume()
    setAutoRunning(false)
  }

  const handleOneClickStart = () => {
    prepareNewGame()
    setSkipDelays(false)
    resume()
    setAutoRunning(true)
  }

  const handleRunNight = async () => {
    ensureGameStarted()
    await runNightSequence()
  }

  const handleRunDay = async () => {
    ensureGameStarted()
    await runDaySequence()
  }

  const handleAuto = () => {
    ensureGameStarted()
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

  const handleDelayInput = (value: number) => {
    setLocalDelay(value)
    setDelay(value)
  }

  const handleSkipToggle = (checked: boolean) => {
    setSkipDelays(checked)
  }

  useEffect(() => {
    if (!autoRunning) return
    let cancelled = false
    ;(async () => {
      try {
        await runFullCycle()
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) {
          setAutoRunning(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [autoRunning, runFullCycle])

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
          ? '思考中'
          : '无'
    const speechText = offline
      ? 'AI 离线，使用默认策略推演。'
      : aiAction?.speech?.trim() || (agentState?.loading ? '生成中…' : '暂无发言')
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
    'space-y-8 rounded-[28px] border border-surface-highlight/40 p-6 shadow-soft transition-colors duration-500',
    isNightPhase
      ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-gray-900 text-slate-100'
      : 'bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100'
  )

  const phaseBadge = cn(
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.3em]',
    isNightPhase
      ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
      : isDayPhase
        ? 'border border-amber-500/40 bg-amber-400/15 text-amber-700 dark:text-amber-200'
        : 'border border-purple-500/40 bg-purple-500/10 text-purple-200'
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
              <p className='mt-2 rounded-2xl border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-300/30 dark:bg-amber-500/10 dark:text-amber-200'>
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
            <Button variant='muted' onClick={handleStartGame} className='text-xs uppercase tracking-[0.3em]'>
              <PlayCircle className='mr-2 h-4 w-4' />
              重新开局
            </Button>
            <Button
              variant='primary'
              onClick={handleOneClickStart}
              disabled={autoRunning || state.phase === 'GameOver'}
              className='text-xs uppercase tracking-[0.3em]'
            >
              <Zap className='mr-2 h-4 w-4' />
              一键全程
            </Button>
            <Button
              variant='ghost'
              onClick={handleRunNight}
              disabled={state.phase === 'RoleAssignment' || state.phase === 'GameOver'}
            >
              执行夜晚
            </Button>
            <Button
              variant='ghost'
              onClick={handleRunDay}
              disabled={state.phase === 'RoleAssignment' || state.phase === 'GameOver'}
            >
              执行白天
            </Button>
            <Button
              variant='ghost'
              onClick={handleAuto}
              disabled={autoRunning || state.phase === 'GameOver'}
            >
              自动继续
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
          <label className='flex items-center gap-2'>
            <span>阶段间隔</span>
            <input
              type='range'
              min={0}
              max={3000}
              step={50}
              value={localDelay}
              onChange={(event) => handleDelayInput(Number(event.target.value))}
              disabled={skipDelays}
              className='h-1 w-32 cursor-pointer'
            />
            <span>{localDelay} ms</span>
          </label>
          <label className='flex items-center gap-2'>
            <input
              type='checkbox'
              checked={skipDelays}
              onChange={(event) => handleSkipToggle(event.target.checked)}
              className='h-3 w-3 rounded border-gray-400 accent-accent'
            />
            <span>跳过等待</span>
          </label>
        </div>
      </header>

      <div className='grid gap-6 lg:grid-cols-[2fr_1fr]'>
        <section className='space-y-6'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-semibold tracking-[0.3em] text-gray-500 dark:text-gray-300'>玩家席位</h3>
            <span className='text-xs text-gray-500 dark:text-gray-400'>
              存活 {alivePlayers.length} / {players.length}
            </span>
          </div>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5'>
            {players.map((player) => (
              <div
                key={player.id}
                className={cn(
                  'rounded-3xl border px-3 py-4 transition-all',
                  player.isAlive
                    ? 'border-surface-highlight/80 bg-white/80 text-slate-900 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100'
                    : 'border-red-500/50 bg-red-500/10 text-red-500 dark:border-red-400/60 dark:text-red-300'
                )}
              >
                <p className='text-sm font-semibold'>
                  #{player.id} {player.name}
                </p>
                <p className='text-xs text-gray-500 dark:text-gray-400'>身份：{player.role}</p>
                <p className='text-xs text-gray-500 dark:text-gray-400'>状态：{formatPlayerStatus(player.isAlive)}</p>
                {player.lastNightRoleResult ? (
                  <p className='mt-2 rounded-2xl bg-black/5 p-2 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-300'>
                    {player.lastNightRoleResult}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <aside className='space-y-4'>
          <div className='space-y-2 rounded-3xl border border-surface-highlight/60 bg-black/5 p-4 text-sm dark:bg-white/5'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>
              玩家昵称
            </p>
            <textarea
              className='h-32 w-full rounded-2xl border border-surface-highlight/60 bg-transparent p-3 outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40'
              value={namesInput}
              onChange={(event) => setNamesInput(event.target.value)}
              placeholder='按行或逗号输入 10 位玩家昵称'
            />
            <p className='text-xs text-gray-500 dark:text-gray-400'>不足 10 位时会自动补全默认昵称。</p>
          </div>

          <div className='space-y-2 rounded-3xl border border-surface-highlight/60 bg-black/5 p-4 text-xs dark:bg-white/5'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>
              AI 状态
            </p>
            <ul className='space-y-1'>
              {players.map((player) => {
                if (!aiStatus.enabled) {
                  return (
                    <li key={player.id} className='text-amber-600 dark:text-amber-200'>
                      #{player.id} {player.name}：AI 离线（默认策略）
                    </li>
                  )
                }
                const agentState = agentStates[player.id]
                if (!agentState) {
                  return (
                    <li key={player.id}>
                      #{player.id} {player.name}：等待初始化
                    </li>
                  )
                }
                if (agentState.error) {
                  return (
                    <li key={player.id} className='text-red-500'>
                      #{player.id} {player.name}：失败（{agentState.error}）
                    </li>
                  )
                }
                if (agentState.loading) {
                  return (
                    <li key={player.id}>
                      #{player.id} {player.name}：思考中…
                    </li>
                  )
                }
                return (
                  <li key={player.id}>
                    #{player.id} {player.name}：就绪
                  </li>
                )
              })}
            </ul>
          </div>

          <div className='space-y-3 rounded-3xl border border-surface-highlight/60 bg-black/5 p-4 text-xs dark:bg-white/5'>
            <div className='flex items-center justify-between'>
              <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>
                AI 回应
              </p>
              <label className='flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400'>
                <input
                  type='checkbox'
                  checked={showThinking}
                  onChange={(event) => setShowThinking(event.target.checked)}
                  className='h-3 w-3 rounded border-gray-400 accent-accent'
                />
                显示思考
              </label>
            </div>
            <div className='max-h-72 space-y-2 overflow-y-auto pr-1'>
              {aiPanels.map(({ player, confidence, offline, speechText, planText, actionText, thinkingText }) => (
                <div
                  key={player.id}
                  className={cn(
                    'rounded-2xl border border-surface-highlight/50 bg-white/70 p-3 text-xs shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/70',
                    !player.isAlive && 'opacity-70'
                  )}
                >
                  <div className='flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-200'>
                    <span>
                      #{player.id} {player.name} · {player.role}
                    </span>
                    <span>{offline ? 'AI 离线' : `信心 ${confidence}`}</span>
                  </div>
                  <p className='mt-1 text-[11px] text-base-foreground dark:text-slate-100'>
                    发言：{speechText}
                  </p>
                  <p className='text-[11px] text-gray-500 dark:text-gray-400'>
                    计划：{planText}
                  </p>
                  {actionText ? (
                    <p className='text-[11px] text-gray-500 dark:text-gray-400'>动作：{actionText}</p>
                  ) : null}
                  {showThinking ? (
                    <p className='mt-1 rounded-xl bg-black/5 p-2 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-300'>
                      {thinkingText}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className='space-y-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-semibold tracking-[0.3em] text-gray-500 dark:text-gray-300'>对局日志</h3>
          <span className='text-xs text-gray-500 dark:text-gray-400'>共 {state.gameLog.length} 条记录</span>
        </div>
        <div className='max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-surface-highlight/60 bg-white/70 p-4 text-sm text-base-foreground shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100'>
          {state.gameLog.length ? (
            state.gameLog.map((log, index) => (
              <p
                key={`${log}-${index}`}
                className='rounded-xl bg-black/5 px-3 py-2 text-sm font-semibold text-base-foreground dark:bg-white/10'
              >
                {log}
              </p>
            ))
          ) : (
            <p className='text-sm text-gray-500 dark:text-gray-400'>对局尚未开始，等待主持人开场。</p>
          )}
        </div>

        {state.highlights.length ? (
          <div className='space-y-2 rounded-2xl border border-surface-highlight/60 bg-white/70 p-4 text-xs text-gray-600 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200'>
            <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-300'>关键事件</p>
            <ul className='space-y-1'>
              {state.highlights.map((item, index) => (
                <li key={`${item}-${index}`} className='rounded-xl bg-black/5 px-3 py-2 dark:bg-white/10'>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  )
}
