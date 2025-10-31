import { useCallback, useMemo, useState } from 'react'
import { aiContextManager } from '../lib/aiContext'
import type { AiResponse, ChatCompletionMessageParam } from '../lib/openrouterClient'
import { requestAiAction } from '../lib/openrouterClient'

export interface AiAgentState {
  loading: boolean
  error?: string
  lastResponse?: AiResponse
  retryCount?: number
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
      setAgentState(playerId, { loading: true, error: undefined, retryCount: 0 })

      let lastError: Error | null = null
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 1) {
            setAgentState(playerId, { loading: true, retryCount: attempt - 1 })
          }

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
          setAgentState(playerId, { loading: false, lastResponse: response, retryCount: 0 })

          if (attempt > 1) {
            console.log(`[AI Agent] 重试成功！第 ${attempt} 次尝试`)
          }
          return response
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('未知错误')
          console.warn(`[AI Agent] #${playerId} 尝试 ${attempt}/${maxRetries} 失败:`, lastError.message)

          if (attempt < maxRetries) {
            const delayMs = 1000 * attempt
            console.log(`[AI Agent] #${playerId} 等待 ${delayMs}ms 后重试...`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }
      }

      console.error(`[AI Agent] #${playerId} 所有重试均失败，共尝试 ${maxRetries} 次`)
      const message = lastError?.message ?? '未知错误'
      setAgentState(playerId, { loading: false, error: message, retryCount: 0 })
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
