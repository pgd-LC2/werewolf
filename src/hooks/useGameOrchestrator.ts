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

export interface OrchestratorHandlers {
  onNightStart?(context: NightContext): Promise<void> | void
  onWerewolfAction?(context: NightContext): Promise<WerewolfDecision> | WerewolfDecision
  onSeerAction?(context: NightContext): Promise<SeerDecision> | SeerDecision
  onWitchAction?(context: NightContext): Promise<WitchDecision> | WitchDecision
  onDayStart?(context: DayContext): Promise<void> | void
  onDiscussion?(context: DayContext): Promise<DiscussionEvent[]> | DiscussionEvent[]
  onVoting?(context: DayContext): Promise<VotingDecision> | VotingDecision
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

const defaultHandlers: Required<OrchestratorHandlers> = {
  onNightStart: noop,
  onWerewolfAction: fallbackWerewolf,
  onSeerAction: fallbackSeer,
  onWitchAction: fallbackWitch,
  onDayStart: noop,
  onDiscussion: fallbackDiscussion,
  onVoting: fallbackVoting,
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
    while (tempoRef.current.paused) {
      await new Promise<void>((resolve) => {
        tempoRef.current.pauseResolvers.push(resolve)
      })
    }
  }, [])

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

    logic.setPhase('Night', `夜幕降临 · 第 ${context.day + 1} 夜`)
    await waitForTempo()
    await safeInvoke(handlers.onNightStart, noop, context)

    logic.setPhase('WerewolfAction')
    await waitForTempo()
    const wolfDecision = await safeInvoke(handlers.onWerewolfAction, fallbackWerewolf, context)
    logic.setWerewolfTarget(wolfDecision.targetId ?? null)
    await waitForTempo()

    const seerAlive = isRoleAlive(context.alivePlayers, 'Seer')
    if (seerAlive) {
      logic.setPhase('SeerAction')
      await waitForTempo()
      const seerDecision = await safeInvoke(handlers.onSeerAction, fallbackSeer, context)
      logic.setSeerTarget(seerDecision.targetId ?? null)
      await waitForTempo()
    }

    const witchAlive = isRoleAlive(context.alivePlayers, 'Witch')
    if (witchAlive) {
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
    }

    logic.resolveNight()
    await waitForTempo()
    if (stateRef.current.phase === 'HunterAction') {
      await runHunterStage()
      await waitForTempo()
    }
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

  const runDaySequence = useCallback(async () => {
    const context = getContext()
    logic.setPhase('Day', `晨光初露 · 第 ${context.day} 天`)
    await waitForTempo()
    await safeInvoke(handlers.onDayStart, noop, context)

    logic.setPhase('Discussion')
    await waitForTempo()
    const discussions = await safeInvoke(handlers.onDiscussion, fallbackDiscussion, context)
    for (const item of discussions) {
      const speakerName =
        context.state.players.find((player) => player.id === item.speakerId)?.name ?? '未知玩家'
      logic.setPhase('Discussion', `${speakerName}：${item.speech}`)
      await waitForTempo()
    }

    logic.setPhase('Voting', '进入投票阶段')
    await waitForTempo()
    const votingDecision = await safeInvoke(handlers.onVoting, fallbackVoting, context)
    votingDecision.votes.forEach((vote) => {
      if (vote.targetId !== null) {
        logic.castVote(vote.voterId, vote.targetId)
      }
    })

    logic.resolveVoting()
    await waitForTempo()
    if (stateRef.current.phase === 'HunterAction') {
      await runHunterStage()
      await waitForTempo()
    }
  }, [
    getContext,
    handlers.onDayStart,
    handlers.onDiscussion,
    handlers.onVoting,
    logic,
    runHunterStage,
    safeInvoke,
    waitForTempo
  ])

  const runFullCycle = useCallback(async () => {
    if (stateRef.current.phase === 'RoleAssignment') {
      throw new Error('请先调用 startGame 再开始自动流程。')
    }

    while (true) {
      await waitWhilePaused()
      if (stateRef.current.phase === 'GameOver') break
      await runNightSequence()
      if (stateRef.current.winner !== 'none') break
      await waitWhilePaused()
      await runDaySequence()
    }

    await safeInvoke(handlers.onGameOver, noop, stateRef.current)
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
