import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePhase, GameState, Player, Role } from '../lib/game'
import { useGameLogic, checkWinCondition } from './useGameLogic'

type NullableId = number | null

export interface NightContext {
  state: GameState
  alivePlayers: Player[]
  day: number
}

export interface DayContext {
  state: GameState
  alivePlayers: Player[]
  day: number
}

export interface HunterContext {
  state: GameState
  hunterId: number
  alivePlayers: Player[]
  context: 'night' | 'day'
}

export interface WerewolfDecision {
  targetId: NullableId
  note?: string
}

export interface SeerDecision {
  targetId: NullableId
  note?: string
}

export interface WitchDecision {
  save: boolean
  poisonTargetId: NullableId
  note?: string
}

export interface DiscussionEvent {
  speakerId: number
  speech: string
}

export interface VotingDecision {
  votes: { voterId: number; targetId: NullableId }[]
}

export interface HunterDecision {
  targetId: NullableId
  note?: string
}

export interface PostVoteDiscussionEvent {
  speakerId: number
  speech: string
  wantsContinue: boolean
}

export interface PostVoteFollowUpEvent {
  speakerId: number
  hasFollowUp: boolean
  speech?: string
}

export interface OrchestratorHandlers {
  onNightStart?(context: NightContext): Promise<void> | void
  onWerewolfAction?(context: NightContext): Promise<WerewolfDecision> | WerewolfDecision
  onSeerAction?(context: NightContext): Promise<SeerDecision> | SeerDecision
  onWitchAction?(context: NightContext): Promise<WitchDecision> | WitchDecision
  onDayStart?(context: DayContext): Promise<void> | void
  onDiscussion?(context: DayContext): Promise<DiscussionEvent[]> | DiscussionEvent[]
  onVoting?(context: DayContext): Promise<VotingDecision> | VotingDecision
  onPostVoteDiscussion?(context: DayContext, round: number): Promise<PostVoteDiscussionEvent[]> | PostVoteDiscussionEvent[]
  onPostVoteFollowUp?(context: DayContext, round: number, allPreviousSpeeches: DiscussionEvent[]): Promise<PostVoteFollowUpEvent[]> | PostVoteFollowUpEvent[]
  onHunterAction?(context: HunterContext): Promise<HunterDecision> | HunterDecision
  onGameOver?(state: GameState): Promise<void> | void
}

const noop = (..._args: unknown[]) => undefined

function fallbackWerewolf(context: NightContext): WerewolfDecision {
  const target = context.alivePlayers.find((player) => player.role !== 'Werewolf')
  return { targetId: target?.id ?? null }
}

function fallbackSeer(context: NightContext): SeerDecision {
  const target = context.alivePlayers.find((player) => player.role !== 'Seer')
  return { targetId: target?.id ?? null }
}

function fallbackWitch(): WitchDecision {
  return { save: false, poisonTargetId: null }
}

function fallbackDiscussion(context: DayContext): DiscussionEvent[] {
  return context.alivePlayers.map((player) => ({
    speakerId: player.id,
    speech: `${player.name} 保持沉默，等待更多信息。`
  }))
}

function fallbackVoting(context: DayContext): VotingDecision {
  const votes = context.alivePlayers.map((player) => ({
    voterId: player.id,
    targetId: context.alivePlayers.find((candidate) => candidate.id !== player.id)?.id ?? null
  }))
  return { votes }
}

function fallbackHunter(): HunterDecision {
  return { targetId: null }
}

function fallbackPostVoteDiscussion(context: DayContext): PostVoteDiscussionEvent[] {
  return context.alivePlayers.map((player) => ({
    speakerId: player.id,
    speech: `${player.name} 沉默观察票型。`,
    wantsContinue: false
  }))
}

function fallbackPostVoteFollowUp(): PostVoteFollowUpEvent[] {
  return []
}

const defaultHandlers: Required<OrchestratorHandlers> = {
  onNightStart: noop,
  onWerewolfAction: fallbackWerewolf,
  onSeerAction: fallbackSeer,
  onWitchAction: fallbackWitch,
  onDayStart: noop,
  onDiscussion: fallbackDiscussion,
  onVoting: fallbackVoting,
  onPostVoteDiscussion: fallbackPostVoteDiscussion,
  onPostVoteFollowUp: fallbackPostVoteFollowUp,
  onHunterAction: fallbackHunter,
  onGameOver: noop
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TempoState {
  delayMs: number
  skipDelays: boolean
  paused: boolean
  pauseResolvers: Array<() => void>
}

export function useGameOrchestrator(customHandlers?: Partial<OrchestratorHandlers>) {
  const logic = useGameLogic()
  const handlers = useMemo(
    () => ({ ...defaultHandlers, ...customHandlers }),
    [customHandlers]
  )

  const tempoRef = useRef<TempoState>({
    delayMs: 800,
    skipDelays: false,
    paused: false,
    pauseResolvers: []
  })
  const [tempoSnapshot, setTempoSnapshot] = useState(() => ({
    delayMs: tempoRef.current.delayMs,
    skipDelays: tempoRef.current.skipDelays,
    paused: tempoRef.current.paused
  }))

  const updateTempoSnapshot = useCallback(() => {
    const { delayMs, skipDelays, paused } = tempoRef.current
    setTempoSnapshot({ delayMs, skipDelays, paused })
  }, [])

  const resolvePauseResolvers = useCallback(() => {
    if (!tempoRef.current.pauseResolvers.length) return
    const resolvers = [...tempoRef.current.pauseResolvers]
    tempoRef.current.pauseResolvers = []
    resolvers.forEach((resolve) => resolve())
  }, [])

  const waitWhilePaused = useCallback(async () => {
    const PAUSE_TIMEOUT = 30000
    const startTime = Date.now()

    while (tempoRef.current.paused) {
      if (Date.now() - startTime > PAUSE_TIMEOUT) {
        console.error('[GameOrchestrator] 暂停超时，自动恢复')
        tempoRef.current.paused = false
        updateTempoSnapshot()
        break
      }

      await new Promise<void>((resolve) => {
        tempoRef.current.pauseResolvers.push(resolve)
        setTimeout(() => resolve(), 100)
      })
    }
  }, [updateTempoSnapshot])

  const waitForTempo = useCallback(
    async () => {
      await waitWhilePaused()
      const { skipDelays, delayMs } = tempoRef.current
      if (skipDelays || delayMs <= 0) {
        return
      }
      const start = Date.now()
      while (Date.now() - start < delayMs) {
        await waitWhilePaused()
        const remaining = delayMs - (Date.now() - start)
        await sleep(Math.min(remaining, 50))
      }
    },
    [waitWhilePaused]
  )

  const setDelay = useCallback(
    (delayMs: number) => {
      tempoRef.current.delayMs = Math.max(0, Math.floor(delayMs))
      updateTempoSnapshot()
    },
    [updateTempoSnapshot]
  )

  const setSkipDelays = useCallback(
    (skip: boolean) => {
      tempoRef.current.skipDelays = skip
      updateTempoSnapshot()
    },
    [updateTempoSnapshot]
  )

  const pause = useCallback(() => {
    if (tempoRef.current.paused) return
    tempoRef.current.paused = true
    updateTempoSnapshot()
  }, [updateTempoSnapshot])

  const resume = useCallback(() => {
    if (!tempoRef.current.paused) return
    tempoRef.current.paused = false
    resolvePauseResolvers()
    updateTempoSnapshot()
  }, [resolvePauseResolvers, updateTempoSnapshot])

  const setPaused = useCallback(
    (value: boolean) => {
      if (value) {
        pause()
      } else {
        resume()
      }
    },
    [pause, resume]
  )

  const stateRef = useRef(logic.state)
  useEffect(() => {
    stateRef.current = logic.state
  }, [logic.state])

  const getContext = useCallback(() => {
    const state = stateRef.current
    return {
      state,
      alivePlayers: state.players.filter((player) => player.isAlive),
      day: state.day
    }
  }, [])

  const safeInvoke = useCallback(
    async <T, A extends unknown[]>(
      fn: (...args: A) => T | Promise<T>,
      fallback: (...args: A) => T,
      ...args: A
    ): Promise<T> => {
      try {
        const result = await fn(...args)
        return result ?? fallback(...args)
      } catch (error) {
        console.warn('Orchestrator handler error:', error)
        return fallback(...args)
      }
    },
    []
  )

  const waitForPhase = useCallback(
    async (phase: GamePhase, timeout = 1000) => {
      const start = Date.now()
      while (stateRef.current.phase !== phase) {
        await waitWhilePaused()
        if (Date.now() - start > timeout) {
          throw new Error(`等待阶段 ${phase} 超时。`)
        }
        await sleep(10)
      }
      await waitWhilePaused()
    },
    [waitWhilePaused]
  )

  const runHunterStage = useCallback(async () => {
    const state = stateRef.current
    if (!state.hunterPending) return
    const pending = state.hunterPending
    const hunterPlayer = state.players.find((player) => player.id === pending.playerId)
    if (!hunterPlayer) {
      logic.hunterShoot(null)
      await sleep(0)
      return
    }

    const context: HunterContext = {
      state,
      hunterId: hunterPlayer.id,
      alivePlayers: state.players.filter((player) => player.isAlive && player.id !== hunterPlayer.id),
      context: pending.context
    }

    const decision = await safeInvoke(
      handlers.onHunterAction,
      fallbackHunter,
      context
    )

    logic.hunterShoot(decision.targetId ?? null)
    await waitForTempo()
    await waitForPhase(pending.nextPhase)
  }, [handlers.onHunterAction, logic, safeInvoke, waitForPhase, waitForTempo])

  const runNightSequence = useCallback(async () => {
    const context = getContext()

    console.log('[夜晚序列] 开始')
    logic.setPhase('Night', `夜幕降临 · 第 ${context.day + 1} 夜`)
    await waitForTempo()
    await safeInvoke(handlers.onNightStart, noop, context)

    console.log('[夜晚序列] 狼人行动')
    logic.setPhase('WerewolfAction')
    await waitForTempo()
    const wolfDecision = await safeInvoke(handlers.onWerewolfAction, fallbackWerewolf, context)
    logic.setWerewolfTarget(wolfDecision.targetId ?? null)
    await waitForTempo()
    await new Promise(resolve => setTimeout(resolve, 500))

    const seerAlive = isRoleAlive(context.alivePlayers, 'Seer')
    if (seerAlive) {
      console.log('[夜晚序列] 预言家行动')
      logic.setPhase('SeerAction')
      await waitForTempo()
      const seerDecision = await safeInvoke(handlers.onSeerAction, fallbackSeer, context)
      logic.setSeerTarget(seerDecision.targetId ?? null)
      await waitForTempo()
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const witchAlive = isRoleAlive(context.alivePlayers, 'Witch')
    if (witchAlive) {
      console.log('[夜晚序列] 女巫行动')
      logic.setPhase('WitchAction')
      await waitForTempo()
      const witchDecision = await safeInvoke(handlers.onWitchAction, fallbackWitch, context)
      if (witchDecision.save) {
        logic.witchSave()
      }
      if (witchDecision.poisonTargetId !== null) {
        logic.witchPoison(witchDecision.poisonTargetId)
      }
      await waitForTempo()
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log('[夜晚序列] 结算夜晚结果')
    logic.resolveNight()
    await waitForTempo()
    await sleep(0)
    if (stateRef.current.phase === 'HunterAction') {
      console.log('[夜晚序列] 猎人技能触发')
      await runHunterStage()
      await waitForTempo()
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    await sleep(0)
    console.log('[夜晚序列] 完成')
  }, [
    getContext,
    handlers.onNightStart,
    handlers.onWerewolfAction,
    handlers.onSeerAction,
    handlers.onWitchAction,
    logic,
    runHunterStage,
    safeInvoke,
    waitForTempo
  ])

  const runPostVoteDiscussionSequence = useCallback(async () => {
    const MAX_ROUNDS = 3

    console.log('[票后分析] 收集投票结果')
    logic.collectVoteSummary()
    await waitForTempo()
    await sleep(0)

    // 在收集 voteSummary 后重新获取 context
    const context = getContext()

    console.log('[票后分析] 开始第1轮强制发言')
    logic.startPostVoteDiscussion()
    await waitForTempo()

    const allSpeeches: DiscussionEvent[] = []

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      console.log(`[票后分析] 第${round}轮 开始`)
      await waitWhilePaused()

      if (round === 1) {
        const events = await safeInvoke(handlers.onPostVoteDiscussion, fallbackPostVoteDiscussion, context, round)
        events.forEach(e => allSpeeches.push({ speakerId: e.speakerId, speech: e.speech }))
        const wantsContinueCount = events.filter(e => e.wantsContinue).length
        console.log(`[票后分析] 第${round}轮结束，${wantsContinueCount}人希望继续`)

        if (wantsContinueCount < 2) {
          console.log('[票后分析] 希望继续的人数不足，结束讨论')
          break
        }
      } else {
        const followUpEvents = await safeInvoke(handlers.onPostVoteFollowUp, fallbackPostVoteFollowUp, context, round, allSpeeches)
        const hasFollowUps = followUpEvents.filter(e => e.hasFollowUp)
        hasFollowUps.forEach(e => {
          if (e.speech) {
            allSpeeches.push({ speakerId: e.speakerId, speech: e.speech })
          }
        })
        console.log(`[票后分析] 第${round}轮结束，${hasFollowUps.length}人补充发言`)

        if (hasFollowUps.length < 2) {
          console.log('[票后分析] 补充发言人数不足，结束讨论')
          break
        }
      }

      if (round < MAX_ROUNDS) {
        logic.incrementPostVoteRound()
        await waitForTempo()
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log('[票后分析] 完成')
  }, [
    getContext,
    handlers.onPostVoteDiscussion,
    handlers.onPostVoteFollowUp,
    logic,
    safeInvoke,
    waitForTempo,
    waitWhilePaused
  ])

  const runDaySequence = useCallback(async () => {
    const context = getContext()

    console.log('[白天序列] 开始')
    logic.setPhase('Day', `晨光初露 · 第 ${context.day} 天`)
    await waitForTempo()
    await safeInvoke(handlers.onDayStart, noop, context)

    console.log('[白天序列] 讨论阶段')
    logic.setPhase('Discussion')
    await waitForTempo()
    await safeInvoke(handlers.onDiscussion, fallbackDiscussion, context)
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('[白天序列] 投票阶段')
    logic.setPhase('Voting', '进入投票阶段')
    await waitForTempo()
    const votingDecision = await safeInvoke(handlers.onVoting, fallbackVoting, context)
    votingDecision.votes.forEach((vote) => {
      if (vote.targetId !== null) {
        logic.castVote(vote.voterId, vote.targetId)
      }
    })
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('[白天序列] 进入票后分析阶段（会生成 voteSummary）')
    await runPostVoteDiscussionSequence()
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('[白天序列] 结算投票结果（淘汰玩家）')
    logic.resolveVoting()
    await waitForTempo()
    await sleep(0)
    if (stateRef.current.phase === 'HunterAction') {
      console.log('[白天序列] 猎人技能触发')
      await runHunterStage()
      await waitForTempo()
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    await sleep(0)
    console.log('[白天序列] 完成')
  }, [
    getContext,
    handlers.onDayStart,
    handlers.onDiscussion,
    handlers.onVoting,
    logic,
    runHunterStage,
    runPostVoteDiscussionSequence,
    safeInvoke,
    waitForTempo
  ])

  const runFullCycle = useCallback(async () => {
    const getCurrentState = () => stateRef.current
    const isGameOver = () => {
      const state = getCurrentState()
      return state.phase === 'GameOver' || state.winner !== 'none'
    }

    if (getCurrentState().phase === 'RoleAssignment') {
      throw new Error('请先调用 startGame 再开始自动流程。')
    }

    const MAX_CYCLES = 50
    let cycleCount = 0

    console.log('[GameOrchestrator] 开始自动循环执行')

    while (cycleCount < MAX_CYCLES) {
      cycleCount++
      const state = getCurrentState()
      console.log(`[GameOrchestrator] 循环迭代 #${cycleCount}, 当前阶段: ${state.phase}, 天数: ${state.day}, 胜者: ${state.winner}`)

      await waitWhilePaused()

      if (isGameOver()) {
        console.log('[GameOrchestrator] 检测到游戏已结束')
        break
      }

      console.log('[GameOrchestrator] 执行夜晚序列')
      await runNightSequence()

      if (isGameOver()) {
        console.log('[GameOrchestrator] 夜晚后游戏结束')
        break
      }

      await waitWhilePaused()

      console.log('[GameOrchestrator] 执行白天序列')
      await runDaySequence()

      if (isGameOver()) {
        console.log('[GameOrchestrator] 白天后游戏结束')
        break
      }
    }

    if (cycleCount >= MAX_CYCLES) {
      console.error('[GameOrchestrator] 达到最大循环次数，强制终止')
      throw new Error(`游戏循环超过最大限制（${MAX_CYCLES}次），已强制终止`)
    }

    console.log('[GameOrchestrator] 循环结束，调用 onGameOver')
    await safeInvoke(handlers.onGameOver, noop, getCurrentState())
  }, [handlers.onGameOver, runDaySequence, runNightSequence, safeInvoke, waitWhilePaused])

  const isAutoResolved = useCallback(() => {
    const state = stateRef.current
    return state.phase === 'GameOver' || checkWinCondition(state.players) !== 'none'
  }, [])

  return {
    ...logic,
    runNightSequence,
    runDaySequence,
    runFullCycle,
    runHunterStage,
    isAutoResolved,
    tempo: {
      delayMs: tempoSnapshot.delayMs,
      skipDelays: tempoSnapshot.skipDelays,
      paused: tempoSnapshot.paused,
      setDelay,
      setSkipDelays,
      pause,
      resume,
      setPaused
    }
  }
}

function isRoleAlive(players: Player[], role: Role): boolean {
  return players.some((player) => player.role === role && player.isAlive)
}
