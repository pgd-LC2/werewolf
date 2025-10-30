import { useCallback, useMemo, useState } from 'react'
import { aiContextManager } from '../lib/aiContext'
import type { AiResponse, ChatCompletionMessageParam } from '../lib/openrouterClient'
import { requestAiAction } from '../lib/openrouterClient'

export interface AiAgentState {
  loading: boolean
  error?: string
  lastResponse?: AiResponse
}

const DEFAULT_MODEL = 'minimax/minimax-m2'

export function useAiAgents() {
  const [states, setStates] = useState<Record<number, AiAgentState>>({})

  const setAgentState = useCallback((playerId: number, partial: Partial<AiAgentState>) => {
    setStates((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], ...partial }
    }))
  }, [])

  const invokeAgent = useCallback(
    async (
      playerId: number,
      stage: string,
      stagePrompt: string,
      input: string,
      options?: { model?: string }
    ) => {
      setAgentState(playerId, { loading: true, error: undefined })
      try {
        const history = aiContextManager.prepareStage(playerId, stage, stagePrompt)
        const userMessage: ChatCompletionMessageParam = {
          role: 'user',
          content: input
        }
        const requestMessages = [...history, userMessage]
        const response = await requestAiAction({
          model: options?.model ?? DEFAULT_MODEL,
          messages: requestMessages
        })
        aiContextManager.append(playerId, [
          userMessage,
          {
            role: 'assistant',
            content: JSON.stringify(response.action),
            thinking: response.thinking
          }
        ])
        setAgentState(playerId, { loading: false, lastResponse: response })
        return response
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        setAgentState(playerId, { loading: false, error: message })
        throw error
      }
    },
    [setAgentState]
  )

  const resetAgent = useCallback(
    (playerId: number) => {
      aiContextManager.reset(playerId)
      setStates((prev) => {
        const { [playerId]: _, ...rest } = prev
        return rest
      })
    },
    [setStates]
  )

  const agentStates = useMemo(() => states, [states])

  return {
    agentStates,
    invokeAgent,
    resetAgent
  }
}
