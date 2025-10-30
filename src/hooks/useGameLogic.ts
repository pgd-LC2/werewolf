import { useCallback, useReducer } from 'react'
import {
  createInitialGameState,
  type GamePhase,
  type GameState,
  type Player,
  type Role,
  type Winner,
  type ReplayEvent
} from '../lib/game'

const ROLE_POOL: Role[] = [
  'Werewolf',
  'Werewolf',
  'Werewolf',
  'Villager',
  'Villager',
  'Villager',
  'Seer',
  'Witch',
  'Hunter',
  'Villager' // 自由身份位，默认视为村民
]

const initialState: GameState = createInitialGameState()

export interface LogEntryPayload {
  message: string
  replay?: ReplayEvent
  highlight?: string
}

type GameAction =
  | { type: 'START_GAME'; payload: { names: string[] } }
  | { type: 'SET_PHASE'; payload: { phase: GamePhase; log?: string; replay?: ReplayEvent; highlight?: string } }
  | { type: 'WEREWOLF_ACTION'; payload: { targetId: number | null } }
  | { type: 'SEER_ACTION'; payload: { targetId: number | null } }
  | { type: 'WITCH_ACTION'; payload: { action: 'save' } | { action: 'poison'; targetId: number } }
  | { type: 'PLAYER_VOTE'; payload: { voterId: number; targetId: number } }
  | { type: 'RESOLVE_NIGHT' }
  | { type: 'RESOLVE_VOTING' }
  | { type: 'HUNTER_SHOOT'; payload: { targetId: number | null } }
  | { type: 'APPEND_LOG'; payload: LogEntryPayload }
  | { type: 'APPEND_LOG_BATCH'; payload: LogEntryPayload[] }
  | { type: 'SET_HIGHLIGHTS'; payload: { highlights: string[] } }

function shuffle<T>(source: T[]): T[] {
  const arr = [...source]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function clonePlayers(players: Player[]) {
  return players.map((player) => ({ ...player }))
}

function applyLogEntries(state: GameState, entries: LogEntryPayload[]) {
  let gameLog = state.gameLog
  let replay = state.replay
  let highlights = state.highlights

  entries.forEach((entry) => {
    if (entry.message) {
      gameLog = [...gameLog, entry.message]
    }
    if (entry.replay) {
      replay = [...replay, entry.replay]
    }
    if (entry.highlight) {
      highlights = [...highlights, entry.highlight]
    }
  })

  return { gameLog, replay, highlights }
}

function applyLogEntry(state: GameState, entry: LogEntryPayload) {
  return applyLogEntries(state, [entry])
}

export function checkWinCondition(players: Player[]): Winner {
  const alive = players.filter((player) => player.isAlive)
  const werewolfCount = alive.filter((player) => player.role === 'Werewolf').length
  const goodGuyCount = alive.length - werewolfCount

  if (werewolfCount === 0) return 'Villagers'
  if (werewolfCount > 0 && werewolfCount >= goodGuyCount) return 'Werewolves'
  return 'none'
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const shuffledRoles = shuffle(ROLE_POOL)
      const players = shuffledRoles.map((role, index) => ({
        id: index + 1,
        name: action.payload.names[index]?.trim() || `Player ${index + 1}`,
        role,
        isAlive: true,
        isSheriff: false,
        lastNightRoleResult: null
      }))

      const timestamp = Date.now()
      const startLog = '新的一局开始，正在分配身份。'
      const startEvent: ReplayEvent = {
        id: `start-${timestamp}`,
        phase: 'RoleAssignment',
        category: 'system',
        day: 0,
        content: startLog,
        timestamp
      }

      return {
        ...state,
        players,
        day: 0,
        phase: 'RoleAssignment',
        gameLog: [startLog],
        winner: 'none',
        werewolfChoice: null,
        seerChoice: null,
        witchState: {
          saveUsed: false,
          poisonUsed: false,
          poisonChoice: null,
          savedTargetId: null
        },
        votes: [],
        hunterPending: null,
        replay: [startEvent],
        highlights: []
      }
    }
    case 'SET_PHASE': {
      let nextLogs = state.gameLog
      let nextReplay = state.replay
      let nextHighlights = state.highlights

      if (action.payload.log || action.payload.replay || action.payload.highlight) {
        const applied = applyLogEntry(state, {
          message: action.payload.log ?? '',
          replay: action.payload.replay,
          highlight: action.payload.highlight
        })
        nextLogs = applied.gameLog
        nextReplay = applied.replay
        nextHighlights = applied.highlights
      }

      return {
        ...state,
        phase: action.payload.phase,
        gameLog: nextLogs,
        replay: nextReplay,
        highlights: nextHighlights
      }
    }
    case 'WEREWOLF_ACTION':
      return { ...state, werewolfChoice: action.payload.targetId }
    case 'SEER_ACTION':
      return { ...state, seerChoice: action.payload.targetId }
    case 'WITCH_ACTION':
      if (action.payload.action === 'save') {
        if (state.witchState.saveUsed) {
          return state
        }
        return {
          ...state,
          witchState: {
            ...state.witchState,
            saveUsed: true,
            savedTargetId: state.werewolfChoice
          }
        }
      }
      if (state.witchState.poisonUsed) {
        return state
      }
      return {
        ...state,
        witchState: {
          ...state.witchState,
          poisonUsed: true,
          poisonChoice: action.payload.targetId
        }
      }
    case 'PLAYER_VOTE': {
      const votes = state.votes.filter((vote) => vote.voterId !== action.payload.voterId)
      votes.push({ voterId: action.payload.voterId, targetId: action.payload.targetId })
      return { ...state, votes }
    }
    case 'RESOLVE_NIGHT': {
      const players = clonePlayers(state.players)
      const entries: LogEntryPayload[] = []
      const deathIds = new Set<number>()
      const deathCauses = new Map<number, string[]>()

      const registerDeath = (id: number, cause: string) => {
        const causes = deathCauses.get(id) ?? []
        causes.push(cause)
        deathCauses.set(id, causes)
        deathIds.add(id)
      }

      const removeDeath = (id: number) => {
        deathIds.delete(id)
        deathCauses.delete(id)
      }

      const timestampBase = Date.now()
      const nightIndex = state.day + 1

      const werewolfTarget = players.find((player) => player.id === state.werewolfChoice)
      if (werewolfTarget && werewolfTarget.isAlive) {
        registerDeath(werewolfTarget.id, '狼人击杀')
      }

      if (
        state.witchState.savedTargetId !== null &&
        werewolfTarget &&
        werewolfTarget.id === state.witchState.savedTargetId
      ) {
        removeDeath(werewolfTarget.id)
      }

      const poisonTarget =
        state.witchState.poisonChoice !== null
          ? players.find((player) => player.id === state.witchState.poisonChoice)
          : undefined
      if (poisonTarget && poisonTarget.isAlive) {
        registerDeath(poisonTarget.id, '女巫毒杀')
      }

      const seerTarget =
        state.seerChoice !== null ? players.find((player) => player.id === state.seerChoice) : undefined
      if (seerTarget) {
        const seerPlayer = players.find((player) => player.role === 'Seer')
        const seerMessage = `预言家查验 #${seerTarget.id} ${seerTarget.name}：${
          seerTarget.role === 'Werewolf' ? '是狼人' : '是好人'
        }。`
        seerTarget.lastNightRoleResult = seerMessage
        entries.push({
          message: seerMessage,
          replay: {
            id: `seer-${nightIndex}-${timestampBase}`,
            phase: 'SeerAction',
            category: 'decision',
            day: nightIndex,
            actorId: seerPlayer?.id,
            content: seerMessage,
            extra: { targetId: seerTarget.id, role: seerTarget.role },
            timestamp: timestampBase
          }
        })
      }

      let hunterPending = state.hunterPending

      deathIds.forEach((id) => {
        const target = players.find((player) => player.id === id)
        if (target && target.isAlive) {
          target.isAlive = false
          if (target.role === 'Hunter') {
            hunterPending = {
              playerId: target.id,
              context: 'night',
              nextPhase: 'Day'
            }
          }
        }
      })

      const deathDetails = Array.from(deathCauses.entries()).map(([id, causes]) => {
        const target = players.find((player) => player.id === id)
        return {
          id,
          name: target?.name ?? `未知${id}`,
          causes
        }
      })

      if (deathDetails.length) {
        const summary = deathDetails
          .map((detail) => `#${detail.id} ${detail.name}（${detail.causes.join('、')}）`)
          .join('；')
        const message = `第 ${nightIndex} 夜结算：${summary}。`
        entries.push({
          message,
          replay: {
            id: `night-${nightIndex}-${timestampBase}`,
            phase: 'Night',
            category: 'action',
            day: nightIndex,
            content: message,
            extra: { deaths: deathDetails },
            timestamp: timestampBase + 1
          },
          highlight: message
        })
      } else {
        const message = `第 ${nightIndex} 夜平安无事。`
        entries.push({
          message,
          replay: {
            id: `night-${nightIndex}-${timestampBase}`,
            phase: 'Night',
            category: 'action',
            day: nightIndex,
            content: message,
            timestamp: timestampBase + 1
          }
        })
      }

      const winner = checkWinCondition(players)
      const nextWitchState = {
        ...state.witchState,
        poisonChoice: null,
        savedTargetId: null
      }

      if (winner !== 'none') {
        const message =
          winner === 'Werewolves' ? '游戏结束！狼人阵营获胜。' : '游戏结束！好人阵营获胜。'
        entries.push({
          message,
          replay: {
            id: `gameover-${timestampBase}`,
            phase: 'GameOver',
            category: 'summary',
            day: nightIndex,
            content: message,
            extra: { winner },
            timestamp: timestampBase + 2
          },
          highlight: message
        })
        const applied = applyLogEntries(state, entries)
        return {
          ...state,
          players,
          phase: 'GameOver',
          gameLog: applied.gameLog,
          replay: applied.replay,
          highlights: applied.highlights,
          winner,
          werewolfChoice: null,
          seerChoice: null,
          witchState: nextWitchState,
          hunterPending: null
        }
      }

      if (hunterPending) {
        const message = '猎人被击倒，等待是否开枪。'
        entries.push({
          message,
          replay: {
            id: `hunter-${nightIndex}-${timestampBase}`,
            phase: 'HunterAction',
            category: 'system',
            day: nightIndex,
            content: message,
            extra: { context: 'night' },
            timestamp: timestampBase + 2
          }
        })
        const applied = applyLogEntries(state, entries)
        return {
          ...state,
          players,
          phase: 'HunterAction',
          gameLog: applied.gameLog,
          replay: applied.replay,
          highlights: applied.highlights,
          werewolfChoice: null,
          seerChoice: null,
          witchState: nextWitchState,
          hunterPending
        }
      }

      const dawnMessage = `第 ${state.day + 1} 天清晨，所有人醒来。`
      entries.push({
        message: dawnMessage,
        replay: {
          id: `day-${nightIndex}-${timestampBase}`,
          phase: 'Day',
          category: 'phase',
          day: nightIndex,
          content: dawnMessage,
          timestamp: timestampBase + 2
        }
      })

      const applied = applyLogEntries(state, entries)
      return {
        ...state,
        players,
        phase: 'Day',
        gameLog: applied.gameLog,
        replay: applied.replay,
        highlights: applied.highlights,
        werewolfChoice: null,
        seerChoice: null,
        witchState: nextWitchState,
        hunterPending: null
      }
    }

        case 'RESOLVE_VOTING': {
      const players = clonePlayers(state.players)
      const entries: LogEntryPayload[] = []
      const timestampBase = Date.now()

      const voteLines = state.votes.map((vote) => {
        const voter = players.find((player) => player.id === vote.voterId)
        const target = players.find((player) => player.id === vote.targetId)
        const voterName = voter ? `#${voter.id} ${voter.name}` : `#${vote.voterId}`
        const targetName = target ? `#${target.id} ${target.name}` : '弃权'
        return `${voterName} → ${targetName}`
      })

      if (voteLines.length) {
        const message = `投票记录：${voteLines.join('；')}`
        entries.push({
          message,
          replay: {
            id: `votes-${state.day}-${timestampBase}`,
            phase: 'Voting',
            category: 'decision',
            day: state.day,
            content: message,
            extra: { votes: state.votes },
            timestamp: timestampBase
          }
        })
      }

      const tally = state.votes.reduce<Record<number, number>>((acc, vote) => {
        if (vote.targetId !== null) {
          acc[vote.targetId] = (acc[vote.targetId] ?? 0) + 1
        }
        return acc
      }, {})

      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1])
      let eliminatedId: number | null = null
      let eliminatedVotes = 0
      if (sorted.length) {
        const [topTarget, topCount] = sorted[0]
        const isTie = sorted.length > 1 && sorted[1][1] === topCount
        if (!isTie) {
          eliminatedId = Number(topTarget)
          eliminatedVotes = topCount
        }
      }

      let hunterPending = state.hunterPending

      if (eliminatedId !== null) {
        const eliminatedPlayer = players.find((player) => player.id === eliminatedId && player.isAlive)
        if (eliminatedPlayer) {
          eliminatedPlayer.isAlive = false
          const message = `玩家 #${eliminatedPlayer.id} ${eliminatedPlayer.name} 以 ${eliminatedVotes} 票出局。`
          entries.push({
            message,
            replay: {
              id: `vote-result-${state.day}-${timestampBase}`,
              phase: 'Voting',
              category: 'action',
              day: state.day,
              actorId: eliminatedPlayer.id,
              content: message,
              extra: { votes: eliminatedVotes },
              timestamp: timestampBase + 1
            },
            highlight: message
          })
          if (eliminatedPlayer.role === 'Hunter') {
            hunterPending = {
              playerId: eliminatedPlayer.id,
              context: 'day',
              nextPhase: 'Night'
            }
          }
        }
      } else {
        const message = '投票平票，无人出局。'
        entries.push({
          message,
          replay: {
            id: `vote-result-${state.day}-${timestampBase}`,
            phase: 'Voting',
            category: 'system',
            day: state.day,
            content: message,
            timestamp: timestampBase + 1
          }
        })
      }

      const winner = checkWinCondition(players)
      if (winner !== 'none') {
        const message =
          winner === 'Werewolves' ? '游戏结束！狼人阵营获胜。' : '游戏结束！好人阵营获胜。'
        entries.push({
          message,
          replay: {
            id: `gameover-${timestampBase + 1}`,
            phase: 'GameOver',
            category: 'summary',
            day: state.day,
            content: message,
            extra: { winner },
            timestamp: timestampBase + 2
          },
          highlight: message
        })
        const applied = applyLogEntries(state, entries)
        return {
          ...state,
          players,
          phase: 'GameOver',
          gameLog: applied.gameLog,
          replay: applied.replay,
          highlights: applied.highlights,
          winner,
          votes: [],
          hunterPending: null
        }
      }

      if (hunterPending) {
        const message = '猎人被放逐，等待是否开枪。'
        entries.push({
          message,
          replay: {
            id: `hunter-${state.day}-${timestampBase}`,
            phase: 'HunterAction',
            category: 'system',
            day: state.day,
            content: message,
            extra: { context: 'day' },
            timestamp: timestampBase + 2
          }
        })
        const applied = applyLogEntries(state, entries)
        return {
          ...state,
          players,
          phase: 'HunterAction',
          gameLog: applied.gameLog,
          replay: applied.replay,
          highlights: applied.highlights,
          votes: [],
          day: state.day + 1,
          hunterPending
        }
      }

      const nightMessage = `第 ${state.day + 1} 夜即将开始。`
      entries.push({
        message: nightMessage,
        replay: {
          id: `night-start-${state.day + 1}-${timestampBase}`,
          phase: 'Night',
          category: 'phase',
          day: state.day + 1,
          content: nightMessage,
          timestamp: timestampBase + 2
        }
      })

      const applied = applyLogEntries(state, entries)
      return {
        ...state,
        players,
        phase: 'Night',
        day: state.day + 1,
        gameLog: applied.gameLog,
        replay: applied.replay,
        highlights: applied.highlights,
        votes: [],
        hunterPending: null
      }
    }

    case 'HUNTER_SHOOT': {
      if (!state.hunterPending) {
        return state
      }

      const players = clonePlayers(state.players)
      const entries: LogEntryPayload[] = []
      const timestampBase = Date.now()
      const targetId = action.payload.targetId

      if (targetId !== null) {
        const target = players.find((player) => player.id === targetId && player.isAlive)
        if (target) {
          target.isAlive = false
          const message = `猎人开枪带走了 #${target.id} ${target.name}。`
          entries.push({
            message,
            replay: {
              id: `hunter-shot-${state.day}-${timestampBase}`,
              phase: 'HunterAction',
              category: 'action',
              day: state.day,
              actorId: targetId,
              content: message,
              timestamp: timestampBase
            },
            highlight: message
          })
        } else {
          const message = '猎人试图带走的目标不存在或已死亡。'
          entries.push({
            message,
            replay: {
              id: `hunter-shot-${state.day}-${timestampBase}`,
              phase: 'HunterAction',
              category: 'system',
              day: state.day,
              content: message,
              timestamp: timestampBase
            }
          })
        }
      } else {
        const message = '猎人选择保留子弹。'
        entries.push({
          message,
          replay: {
            id: `hunter-pass-${state.day}-${timestampBase}`,
            phase: 'HunterAction',
            category: 'decision',
            day: state.day,
            content: message,
            timestamp: timestampBase
          }
        })
      }

      const winner = checkWinCondition(players)
      if (winner !== 'none') {
        const message =
          winner === 'Werewolves' ? '游戏结束！狼人阵营获胜。' : '游戏结束！好人阵营获胜。'
        entries.push({
          message,
          replay: {
            id: `gameover-${timestampBase}`,
            phase: 'GameOver',
            category: 'summary',
            day: state.day,
            content: message,
            extra: { winner },
            timestamp: timestampBase + 1
          },
          highlight: message
        })
        const applied = applyLogEntries(state, entries)
        return {
          ...state,
          players,
          phase: 'GameOver',
          gameLog: applied.gameLog,
          replay: applied.replay,
          highlights: applied.highlights,
          winner,
          hunterPending: null
        }
      }

      const nextPhase = state.hunterPending.nextPhase
      const contextMessage =
        state.hunterPending.context === 'night'
          ? '夜间结算继续。'
          : '白天流程继续。'

      entries.push({
        message: contextMessage,
        replay: {
          id: `hunter-next-${state.day}-${timestampBase}`,
          phase: nextPhase,
          category: 'phase',
          day: state.day,
          content: contextMessage,
          timestamp: timestampBase + 1
        }
      })

      const applied = applyLogEntries(state, entries)
      return {
        ...state,
        players,
        phase: nextPhase,
        gameLog: applied.gameLog,
        replay: applied.replay,
        highlights: applied.highlights,
        hunterPending: null
      }
    }
    case 'APPEND_LOG': {
      const applied = applyLogEntry(state, action.payload)
      return {
        ...state,
        gameLog: applied.gameLog,
        replay: applied.replay,
        highlights: applied.highlights
      }
    }
    case 'APPEND_LOG_BATCH': {
      const applied = applyLogEntries(state, action.payload)
      return {
        ...state,
        gameLog: applied.gameLog,
        replay: applied.replay,
        highlights: applied.highlights
      }
    }
    case 'SET_HIGHLIGHTS': {
      return {
        ...state,
        highlights: [...action.payload.highlights]
      }
    }
    default:
      return state
  }
}

export function useGameLogic() {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  const startGame = useCallback(
    (names: string[]) => {
      dispatch({ type: 'START_GAME', payload: { names } })
    },
    [dispatch]
  )

  const setPhase = useCallback(
    (phase: GamePhase, log?: string, extras?: { replay?: ReplayEvent; highlight?: string }) => {
      dispatch({
        type: 'SET_PHASE',
        payload: {
          phase,
          log,
          replay: extras?.replay,
          highlight: extras?.highlight
        }
      })
    },
    [dispatch]
  )

  const setWerewolfTarget = useCallback(
    (targetId: number | null) => dispatch({ type: 'WEREWOLF_ACTION', payload: { targetId } }),
    [dispatch]
  )

  const setSeerTarget = useCallback(
    (targetId: number | null) => dispatch({ type: 'SEER_ACTION', payload: { targetId } }),
    [dispatch]
  )

  const witchSave = useCallback(() => dispatch({ type: 'WITCH_ACTION', payload: { action: 'save' } }), [dispatch])

  const witchPoison = useCallback(
    (targetId: number) => dispatch({ type: 'WITCH_ACTION', payload: { action: 'poison', targetId } }),
    [dispatch]
  )

  const castVote = useCallback(
    (voterId: number, targetId: number) => dispatch({ type: 'PLAYER_VOTE', payload: { voterId, targetId } }),
    [dispatch]
  )

  const resolveNight = useCallback(() => dispatch({ type: 'RESOLVE_NIGHT' }), [dispatch])

  const resolveVoting = useCallback(() => dispatch({ type: 'RESOLVE_VOTING' }), [dispatch])

  const hunterShoot = useCallback(
    (targetId: number | null) => dispatch({ type: 'HUNTER_SHOOT', payload: { targetId } }),
    [dispatch]
  )

  const appendLog = useCallback(
    (entry: LogEntryPayload) => dispatch({ type: 'APPEND_LOG', payload: entry }),
    [dispatch]
  )

  const appendLogs = useCallback(
    (entries: LogEntryPayload[]) => dispatch({ type: 'APPEND_LOG_BATCH', payload: entries }),
    [dispatch]
  )

  const setHighlights = useCallback(
    (highlights: string[]) => dispatch({ type: 'SET_HIGHLIGHTS', payload: { highlights } }),
    [dispatch]
  )

  return {
    state,
    startGame,
    setPhase,
    setWerewolfTarget,
    setSeerTarget,
    witchSave,
    witchPoison,
    castVote,
    resolveNight,
    resolveVoting,
    hunterShoot,
    appendLog,
    appendLogs,
    setHighlights
  }
}
