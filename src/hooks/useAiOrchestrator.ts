import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DayContext,
  DiscussionEvent,
  HunterContext,
  HunterDecision,
  NightContext,
  OrchestratorHandlers,
  SeerDecision,
  VotingDecision,
  WerewolfDecision,
  WitchDecision
} from './useGameOrchestrator'
import { useGameOrchestrator } from './useGameOrchestrator'
import { useAiAgents } from './useAiAgents'
import { buildPlayerProfile, createAiMemory, type AiPlayerMemory } from '../lib/aiProfiles'
import {
  buildDiscussionPrompt,
  buildHunterPrompt,
  buildSeerPrompt,
  buildVotingPrompt,
  buildWerewolfPrompt,
  buildWitchPrompt
} from '../lib/aiPrompts'
import type { Player, ReplayCategory, ReplayEvent } from '../lib/game'
import type { LogEntryPayload } from './useGameLogic'
import { IS_OPENROUTER_CONFIGURED } from '../lib/openrouterClient'

type AiDisableReason = 'missing_key' | 'request_failed'

interface AiEngineStatus {
  enabled: boolean
  reason?: AiDisableReason
  lastError?: string
}

function ensureMemory(store: Map<number, AiPlayerMemory>, playerId: number) {
  let memory = store.get(playerId)
  if (!memory) {
    memory = createAiMemory()
    store.set(playerId, memory)
  }
  return memory
}

const OFFLINE_DISCUSSION_TEMPLATES = [
  '保持谨慎，建议先听完所有人的发言再定方向。',
  '关注票型，不要轻易把放逐票交给沉默位。',
  '优先排查昨晚无行动的玩家，防止狼人混入视线。',
  '请大家报出夜间情报，信息透明更利于推理。'
]

export function useAiOrchestrator() {
  const { agentStates, invokeAgent, resetAgent, selectedModel, setSelectedModel } = useAiAgents()
  const appendLogRef = useRef<(entry: LogEntryPayload) => void>(() => {})
  const appendLogsRef = useRef<(entries: LogEntryPayload[]) => void>(() => {})
  const memoryRef = useRef(new Map<number, AiPlayerMemory>())
  const lastSeerTargetRef = useRef<number | null>(null)
  const lastWolfTargetRef = useRef<number | null>(null)
  const offlineNoticeRef = useRef(false)
  const pausedRef = useRef(false)

  const initialStatus: AiEngineStatus = IS_OPENROUTER_CONFIGURED
    ? { enabled: true }
    : { enabled: false, reason: 'missing_key', lastError: '缺少 OpenRouter API Key' }

  const [aiStatus, setAiStatus] = useState<AiEngineStatus>(initialStatus)
  const aiStatusRef = useRef(aiStatus)

  useEffect(() => {
    aiStatusRef.current = aiStatus
  }, [aiStatus])

  const ensureOfflineNotice = useCallback(
    (reason: AiDisableReason, detail?: string) => {
      if (offlineNoticeRef.current) return
      offlineNoticeRef.current = true
      const base =
        reason === 'missing_key'
          ? 'AI 引擎未配置 OpenRouter API Key，将使用默认策略模拟。'
          : 'AI 引擎调用失败，将使用默认策略继续游戏。'
      const message = detail ? `${base}（${detail}）` : base
      appendLogRef.current({ message })
    },
    []
  )

  const disableAiEngine = useCallback(
    (reason: AiDisableReason, error?: unknown) => {
      const detail =
        error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
      if (!aiStatusRef.current.enabled) {
        ensureOfflineNotice(reason, detail)
        return
      }
      const nextStatus: AiEngineStatus = { enabled: false, reason, lastError: detail }
      aiStatusRef.current = nextStatus
      setAiStatus(nextStatus)
      console.warn('[AI orchestrator] engine disabled:', reason, error)

      // 检查是否是503错误（服务不可用）
      const is503Error = detail?.includes('503') || detail?.includes('Service Unavailable')
      const isNoInstanceError = detail?.includes('No instances available')

      if (is503Error || isNoInstanceError) {
        ensureOfflineNotice(reason, '当前模型暂时不可用，建议切换到其他AI模型后重试')
      } else {
        ensureOfflineNotice(reason, detail)
      }
    },
    [ensureOfflineNotice]
  )

  const buildReplayEvent = useCallback(
    (
      stage: string,
      category: ReplayCategory,
      day: number,
      actor: Player | null,
      content: string,
      thinking?: string | null,
      extra?: Record<string, unknown>
    ): ReplayEvent => {
      const timestamp = Date.now()
      return {
        id: `${stage}-${actor?.id ?? 'system'}-${timestamp}`,
        phase: stage,
        category,
        day,
        actorId: actor?.id,
        content,
        thinking: thinking ?? null,
        extra,
        timestamp
      }
    },
    []
  )

  const pushLogEntries = useCallback((entries: LogEntryPayload[]) => {
    if (entries.length) {
      appendLogsRef.current(entries)
    }
  }, [])

  const ensureOfflineForCurrentStatus = useCallback(() => {
    const { reason = 'request_failed', lastError } = aiStatusRef.current
    ensureOfflineNotice(reason, lastError)
  }, [ensureOfflineNotice])

  const offlineWerewolfDecision = useCallback(
    (context: NightContext): WerewolfDecision => {
      ensureOfflineForCurrentStatus()
      const targetPlayer = context.alivePlayers.find((player) => player.role !== 'Werewolf') ?? null
      const targetId = targetPlayer?.id ?? null
      lastWolfTargetRef.current = targetId
      const message = targetPlayer
        ? `AI 离线：狼人默认袭击 #${targetPlayer.id} ${targetPlayer.name}。`
        : 'AI 离线：狼人选择空刀。'
      pushLogEntries([
        {
          message,
          replay: buildReplayEvent('WerewolfAction', 'action', context.day + 1, targetPlayer, message, null, {
            targetId,
            fallback: true
          }),
          highlight: targetPlayer ? message : undefined
        }
      ])
      return { targetId }
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const offlineSeerDecision = useCallback(
    (context: NightContext): SeerDecision => {
      const seer = context.alivePlayers.find((player) => player.role === 'Seer')
      if (!seer) return { targetId: null }
      ensureOfflineForCurrentStatus()
      const memory = ensureMemory(memoryRef.current, seer.id)
      const targetPlayer = context.alivePlayers.find((player) => player.id !== seer.id) ?? null
      const targetId = targetPlayer?.id ?? null
      memory.lastAction = targetId ? '默认策略：查验可疑玩家' : '默认策略：暂不查验'
      lastSeerTargetRef.current = targetId
      const message = targetPlayer
        ? `AI 离线：预言家默认查验 #${targetPlayer.id} ${targetPlayer.name}。`
        : 'AI 离线：预言家选择保留查验。'
      pushLogEntries([
        {
          message,
          replay: buildReplayEvent('SeerAction', 'decision', context.day + 1, seer, message, null, {
            targetId,
            fallback: true
          })
        }
      ])
      return { targetId }
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const offlineWitchDecision = useCallback(
    (context: NightContext): WitchDecision => {
      const witch = context.alivePlayers.find((player) => player.role === 'Witch')
      if (!witch) return { save: false, poisonTargetId: null }
      ensureOfflineForCurrentStatus()
      const memory = ensureMemory(memoryRef.current, witch.id)
      memory.lastAction = '默认策略：本夜不使用药剂'
      const message = 'AI 离线：女巫本夜不使用药剂。'
      pushLogEntries([
        {
          message,
          replay: buildReplayEvent('WitchAction', 'decision', context.day + 1, witch, message, null, {
            fallback: true
          })
        }
      ])
      return { save: false, poisonTargetId: null }
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const offlineDiscussion = useCallback(
    (context: DayContext, existing: DiscussionEvent[] = []): DiscussionEvent[] => {
      ensureOfflineForCurrentStatus()
      const speeches = [...existing]
      const entries: LogEntryPayload[] = []
      const startIndex = existing.length
      context.alivePlayers.slice(startIndex).forEach((player, index) => {
        const template =
          OFFLINE_DISCUSSION_TEMPLATES[(startIndex + index) % OFFLINE_DISCUSSION_TEMPLATES.length]
        const speechText = `【默认】${template}`
        const order = startIndex + index + 1
        speeches.push({ speakerId: player.id, speech: speechText })
        entries.push({
          message: `#${player.id} ${player.name}：${speechText}`,
          replay: buildReplayEvent('Discussion', 'speech', context.day, player, speechText, null, {
            fallback: true,
            order
          })
        })
      })
      pushLogEntries(entries)
      return speeches
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const offlineVoting = useCallback(
    (context: DayContext, existingVotes: VotingDecision['votes'] = []): VotingDecision => {
      ensureOfflineForCurrentStatus()
      const votes = [...existingVotes]
      const entries: LogEntryPayload[] = []
      const alive = context.alivePlayers
      const startIndex = existingVotes.length
      alive.slice(startIndex).forEach((player, index) => {
        const candidates = alive.filter((candidate) => candidate.id !== player.id)
        const choice = candidates.length ? candidates[(startIndex + index) % candidates.length] : null
        const targetId = choice?.id ?? null
        votes.push({ voterId: player.id, targetId })
        const message = choice
          ? `#${player.id} ${player.name}（默认）投给 #${choice.id} ${choice.name}。`
          : `#${player.id} ${player.name}（默认）选择弃权。`
        entries.push({
          message,
          replay: buildReplayEvent('Voting', 'decision', context.day, player, message, null, {
            fallback: true,
            targetId
          })
        })
      })
      pushLogEntries(entries)
      return { votes }
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const offlineHunterDecision = useCallback(
    (context: HunterContext): HunterDecision => {
      const hunter = context.state.players.find((player) => player.id === context.hunterId)
      if (!hunter) return { targetId: null }
      ensureOfflineForCurrentStatus()
      const message = 'AI 离线：猎人保留子弹，没有执行反击。'
      pushLogEntries([
        {
          message,
          replay: buildReplayEvent('HunterAction', 'decision', context.state.day, hunter, message, null, {
            fallback: true
          })
        }
      ])
      return { targetId: null }
    },
    [buildReplayEvent, ensureOfflineForCurrentStatus, pushLogEntries]
  )

  const waitIfPaused = useCallback(async () => {
    while (pausedRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }, [])

  const handlers = useMemo<Partial<OrchestratorHandlers>>(
    () => ({
      onNightStart: async (context: NightContext) => {
        lastWolfTargetRef.current = null
        context.alivePlayers.forEach((player) => ensureMemory(memoryRef.current, player.id))
      },
      onWerewolfAction: async (context: NightContext): Promise<WerewolfDecision> => {
        const wolves = context.alivePlayers.filter((player) => player.role === 'Werewolf')
        if (!wolves.length) {
          return { targetId: null }
        }

        if (!aiStatusRef.current.enabled) {
          return offlineWerewolfDecision(context)
        }

        const responses: { player: Player; decision: WerewolfDecision; confidence: number }[] = []

        for (let i = 0; i < wolves.length; i++) {
          if (!aiStatusRef.current.enabled) break
          await waitIfPaused()
          const wolf = wolves[i]
          const memory = ensureMemory(memoryRef.current, wolf.id)
          const profile = buildPlayerProfile(context.state, wolf, memory)
          const prompt = buildWerewolfPrompt(profile, context, memory)
          try {
            const response = await invokeAgent(wolf.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
            const targetId = response.action.action?.targetId ?? null
            const decision: WerewolfDecision = { targetId }
            memory.lastAction = response.action.plan
            responses.push({ player: wolf, decision, confidence: response.action.confidence })
            const speech = response.action.speech?.trim() || response.action.plan || '（保持沉默）'

            // 狼人的发言是给队友的内部讨论，不应该被记录到公开日志
            // 只记录到 replay 中用于复盘
            pushLogEntries([{
              message: '', // 不记录到公开日志
              replay: buildReplayEvent(
                'WerewolfAction',
                'decision',
                context.day + 1,
                wolf,
                `狼人 #${wolf.id} ${wolf.name}：${speech}`,
                response.thinking ?? null,
                {
                  plan: response.action.plan,
                  confidence: response.action.confidence,
                  suggestedTargetId: targetId
                }
              )
            }])

            if (i < wolves.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } catch (error) {
            disableAiEngine('request_failed', error)
            break
          }
        }

        if (!aiStatusRef.current.enabled) {
          return offlineWerewolfDecision(context)
        }

        const sorted = responses
          .filter((item) => item.decision.targetId !== null)
          .sort((a, b) => b.confidence - a.confidence)
        const target =
          sorted[0]?.decision.targetId ??
          context.alivePlayers.find((player) => player.role !== 'Werewolf')?.id ??
          null
        lastWolfTargetRef.current = target

        const targetPlayer = target ? context.state.players.find((player) => player.id === target) ?? null : null
        const choiceMessage = targetPlayer
          ? `狼人阵营最终袭击 #${targetPlayer.id} ${targetPlayer.name}。`
          : '狼人阵营选择空刀。'
        pushLogEntries([
          {
            message: choiceMessage,
            replay: buildReplayEvent('WerewolfAction', 'action', context.day + 1, targetPlayer, choiceMessage, null, {
              targetId: target
            }),
            highlight: targetPlayer ? choiceMessage : undefined
          }
        ])

        return { targetId: target }
      },
      onSeerAction: async (context: NightContext): Promise<SeerDecision> => {
        const seer = context.alivePlayers.find((player) => player.role === 'Seer')
        if (!seer) return { targetId: null }
        const memory = ensureMemory(memoryRef.current, seer.id)

        if (!aiStatusRef.current.enabled) {
          return offlineSeerDecision(context)
        }

        await waitIfPaused()
        const profile = buildPlayerProfile(context.state, seer, memory)
        const prompt = buildSeerPrompt(profile, context, memory)
        try {
          const response = await invokeAgent(seer.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
          const targetId = response.action.action?.targetId ?? null
          memory.lastAction = response.action.plan
          lastSeerTargetRef.current = targetId

          if (targetId !== null) {
            const target = context.state.players.find(p => p.id === targetId)
            if (target) {
              const result = target.role === 'Werewolf' ? '是狼人' : '是好人'
              memory.knownRoles[targetId] = target.role
              memory.notes.push(`第${context.day + 1}夜查验 #${targetId} ${target.name}：${result}`)
            }
          }

          const speech = response.action.speech?.trim() || '（谨慎观察）'
          // 预言家的发言是内心独白，不应该被记录到公开日志
          // 只记录到 replay 中用于复盘
          pushLogEntries([
            {
              message: '', // 不记录到公开日志
              replay: buildReplayEvent(
                'SeerAction',
                'decision',
                context.day + 1,
                seer,
                `预言家 #${seer.id} ${seer.name}：${speech}`,
                response.thinking ?? null,
                {
                  plan: response.action.plan,
                  targetId
                }
              )
            }
          ])
          if (targetId !== null) {
            pushLogEntries([
              {
                message: '', // 不记录到公开日志
                replay: buildReplayEvent(
                  'SeerAction',
                  'action',
                  context.day + 1,
                  seer,
                  `预言家准备查验座位 #${targetId}`,
                  null,
                  { targetId }
                )
              }
            ])
          }
          return { targetId }
        } catch (error) {
          disableAiEngine('request_failed', error)
          return offlineSeerDecision(context)
        }
      },
      onWitchAction: async (context: NightContext): Promise<WitchDecision> => {
        const witch = context.alivePlayers.find((player) => player.role === 'Witch')
        if (!witch) return { save: false, poisonTargetId: null }
        const memory = ensureMemory(memoryRef.current, witch.id)

        if (!aiStatusRef.current.enabled) {
          return offlineWitchDecision(context)
        }

        await waitIfPaused()
        const profile = buildPlayerProfile(context.state, witch, memory)
        const prompt = buildWitchPrompt(profile, context, memory, lastWolfTargetRef.current)
        try {
          const response = await invokeAgent(witch.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
          const intent = response.action.action?.type ?? 'pass'
          const targetId = response.action.action?.targetId ?? null
          memory.lastAction = response.action.plan

          let save = false
          let poisonTargetId: number | null = null
          const notes: string[] = []

          if (intent === 'save' && lastWolfTargetRef.current !== null && !memory.usedSave) {
            save = true
            memory.usedSave = true
            notes.push(`使用解药救下 #${lastWolfTargetRef.current}`)
          } else if (intent === 'poison' && targetId !== null && !memory.usedPoison) {
            poisonTargetId = targetId
            memory.usedPoison = true
            notes.push(`使用毒药指向 #${targetId}`)
          } else {
            notes.push('选择不使用药剂')
          }

          if (notes.length) {
            memory.notes.push(notes.join('；'))
          }

          const speech = response.action.speech?.trim() || response.action.plan || '（女巫暂不表态）'
          // 女巫的发言是内心独白，不应该被记录到公开日志
          // 只记录到 replay 中用于复盘
          pushLogEntries([
            {
              message: '', // 不记录到公开日志
              replay: buildReplayEvent(
                'WitchAction',
                'decision',
                context.day + 1,
                witch,
                `女巫 #${witch.id} ${witch.name}：${speech}`,
                response.thinking ?? null,
                {
                  plan: response.action.plan,
                  intent,
                  targetId
                }
              )
            }
          ])

          if (save) {
            const savedId = lastWolfTargetRef.current
            pushLogEntries([
              {
                message: `女巫使用解药拯救了 #${savedId}。`,
                replay: buildReplayEvent(
                  'WitchAction',
                  'action',
                  context.day + 1,
                  witch,
                  `解药救人 #${savedId}`,
                  null,
                  { targetId: savedId, type: 'save' }
                ),
                highlight: `女巫救下了 #${savedId}`
              }
            ])
          }

          if (poisonTargetId !== null) {
            pushLogEntries([
              {
                message: `女巫使用毒药指向 #${poisonTargetId}。`,
                replay: buildReplayEvent(
                  'WitchAction',
                  'action',
                  context.day + 1,
                  witch,
                  `毒药目标 #${poisonTargetId}`,
                  null,
                  { targetId: poisonTargetId, type: 'poison' }
                ),
                highlight: `女巫毒杀了 #${poisonTargetId}`
              }
            ])
          }

          return { save, poisonTargetId }
        } catch (error) {
          disableAiEngine('request_failed', error)
          return offlineWitchDecision(context)
        }
      },
      onDayStart: async () => {
        lastSeerTargetRef.current = null
      },
      onDiscussion: async (context: DayContext): Promise<DiscussionEvent[]> => {
        if (!aiStatusRef.current.enabled) {
          return offlineDiscussion(context)
        }

        const speeches: DiscussionEvent[] = []

        const alivePlayers = context.alivePlayers
        for (let i = 0; i < alivePlayers.length; i++) {
          if (!aiStatusRef.current.enabled) {
            return offlineDiscussion(context, speeches)
          }

          await waitIfPaused()
          const player = alivePlayers[i]
          const memory = ensureMemory(memoryRef.current, player.id)
          const profile = buildPlayerProfile(context.state, player, memory)
          const prompt = buildDiscussionPrompt(profile, context, memory, speeches)

          try {
            const response = await invokeAgent(player.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
            const speech = response.action.speech?.trim() || '（暂未发言）'
            memory.lastSpeech = response.action.speech
            memory.lastAction = response.action.plan
            if (response.action.action?.notes) {
              memory.notes.push(response.action.action.notes)
            }
            const order = speeches.length + 1

            pushLogEntries([{
              message: `#${player.id} ${player.name} 发言：${speech}`,
              replay: buildReplayEvent(
                'Discussion',
                'speech',
                context.day,
                player,
                speech,
                response.thinking ?? null,
                {
                  plan: response.action.plan,
                  order
                }
              )
            }])

            speeches.push({ speakerId: player.id, speech: response.action.speech })

            if (i < alivePlayers.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } catch (error) {
            disableAiEngine('request_failed', error)
            return offlineDiscussion(context, speeches)
          }
        }

        return speeches
      },
      onVoting: async (context: DayContext): Promise<VotingDecision> => {
        if (!aiStatusRef.current.enabled) {
          return offlineVoting(context)
        }

        const votes: VotingDecision['votes'] = []

        const alivePlayers = context.alivePlayers
        for (let i = 0; i < alivePlayers.length; i++) {
          if (!aiStatusRef.current.enabled) {
            return offlineVoting(context, votes)
          }

          await waitIfPaused()
          const player = alivePlayers[i]
          const memory = ensureMemory(memoryRef.current, player.id)
          const profile = buildPlayerProfile(context.state, player, memory)
          const prompt = buildVotingPrompt(profile, context, memory)

          try {
            const response = await invokeAgent(player.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
            let targetId = response.action.action?.targetId ?? null
            if (!context.alivePlayers.some((candidate) => candidate.id === targetId)) {
              targetId = null
            }
            votes.push({ voterId: player.id, targetId })
            memory.lastAction = `投票：${targetId ?? '弃权'}`
            const targetPlayer = targetId ? context.state.players.find((p) => p.id === targetId) ?? null : null
            const voteSummary = targetPlayer
              ? `投票给 #${targetPlayer.id} ${targetPlayer.name}`
              : '选择弃票'

            pushLogEntries([{
              message: `#${player.id} ${player.name}：${voteSummary}`,
              replay: buildReplayEvent(
                'Voting',
                'decision',
                context.day,
                player,
                voteSummary,
                response.thinking ?? null,
                {
                  plan: response.action.plan,
                  targetId
                }
              )
            }])

            if (i < alivePlayers.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } catch (error) {
            disableAiEngine('request_failed', error)
            return offlineVoting(context, votes)
          }
        }

        return { votes }
      },
      onHunterAction: async (context: HunterContext): Promise<HunterDecision> => {
        if (!aiStatusRef.current.enabled) {
          return offlineHunterDecision(context)
        }

        const hunter = context.state.players.find((player) => player.id === context.hunterId)
        if (!hunter) return { targetId: null }
        const memory = ensureMemory(memoryRef.current, hunter.id)

        await waitIfPaused()
        const profile = buildPlayerProfile(context.state, hunter, memory)
        const prompt = buildHunterPrompt(profile, context, memory)
        try {
          const response = await invokeAgent(hunter.id, prompt.stage, prompt.systemPrompt, prompt.userPrompt)
          const targetId = response.action.action?.targetId ?? null
          memory.lastAction = response.action.plan

          const speech = response.action.speech?.trim() || response.action.plan || '（猎人沉默）'
          // 猎人的内心想法不应该被记录到公开日志
          // 只记录到 replay 中用于复盘
          pushLogEntries([
            {
              message: '', // 不记录到公开日志
              replay: buildReplayEvent(
                'HunterAction',
                'decision',
                context.state.day,
                hunter,
                `猎人 #${hunter.id} ${hunter.name}：${speech}`,
                response.thinking ?? null,
                { plan: response.action.plan }
              )
            }
          ])

          if (targetId !== null) {
            const targetPlayer = context.state.players.find((player) => player.id === targetId) ?? null
            const actionMessage = `猎人带走了 #${targetId}${targetPlayer ? ` ${targetPlayer.name}` : ''}。`
            pushLogEntries([
              {
                message: actionMessage,
                replay: buildReplayEvent(
                  'HunterAction',
                  'action',
                  context.state.day,
                  hunter,
                  actionMessage,
                  null,
                  { targetId }
                ),
                highlight: actionMessage
              }
            ])
          } else {
            pushLogEntries([
              {
                message: '猎人保留子弹，没有选择开枪。',
                replay: buildReplayEvent(
                  'HunterAction',
                  'action',
                  context.state.day,
                  hunter,
                  '猎人保留子弹',
                  null,
                  { targetId: null }
                )
              }
            ])
          }

          return { targetId }
        } catch (error) {
          disableAiEngine('request_failed', error)
          return offlineHunterDecision(context)
        }
      },
      onGameOver: () => {
        for (const key of memoryRef.current.keys()) {
          resetAgent(key)
        }
        memoryRef.current.clear()
      }
    }),
    [
      disableAiEngine,
      invokeAgent,
      offlineDiscussion,
      offlineHunterDecision,
      offlineSeerDecision,
      offlineVoting,
      offlineWerewolfDecision,
      offlineWitchDecision,
      pushLogEntries,
      resetAgent,
      buildReplayEvent,
      waitIfPaused
    ]
  )

  const orchestrator = useGameOrchestrator(handlers)
  appendLogRef.current = orchestrator.appendLog
  appendLogsRef.current = orchestrator.appendLogs

  useEffect(() => {
    pausedRef.current = orchestrator.tempo.paused
  }, [orchestrator.tempo.paused])

  return {
    ...orchestrator,
    agentStates,
    aiStatus,
    selectedModel,
    setSelectedModel,
    resetAllAgents: () => {
      for (const key of memoryRef.current.keys()) {
        resetAgent(key)
      }
      memoryRef.current.clear()
      lastSeerTargetRef.current = null
      lastWolfTargetRef.current = null
      offlineNoticeRef.current = false
      pausedRef.current = false
      const status: AiEngineStatus = IS_OPENROUTER_CONFIGURED
        ? { enabled: true }
        : { enabled: false, reason: 'missing_key', lastError: '缺少 OpenRouter API Key' }
      aiStatusRef.current = status
      setAiStatus(status)
    }
  }
}
