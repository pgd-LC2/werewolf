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
      options?: { model?: string; maxRetries?: number }
    ) => {
      const maxRetries = options?.maxRetries ?? 3
      setAgentState(playerId, { loading: true, error: undefined })

      let lastError: Error | null = null
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
          lastError = error instanceof Error ? error : new Error('未知错误')
          console.warn(`[AI Agent] 尝试 ${attempt}/${maxRetries} 失败:`, lastError.message)

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          }
        }
      }

      const message = lastError?.message ?? '未知错误'
      setAgentState(playerId, { loading: false, error: message })
      throw lastError ?? new Error('AI 请求失败')
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
