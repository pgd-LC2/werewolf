import type { ChatCompletionMessageParam } from './openrouterClient'

const BASE_SYSTEM_PROMPT =
  '你是一名狼人杀策略顾问，将持续协助指定玩家制定行动。所有回复必须是合法 JSON，禁止输出多余文字。'
const MAX_STAGE_HISTORY = 12

type ContextKey = string | number

interface StageMemory {
  system: ChatCompletionMessageParam
  history: ChatCompletionMessageParam[]
}

interface AiMemory {
  base: ChatCompletionMessageParam
  stages: Map<string, StageMemory>
  lastStage?: string
}

function cloneMessage(message: ChatCompletionMessageParam): ChatCompletionMessageParam {
  const copy: ChatCompletionMessageParam = { ...message }
  if ('thinking' in copy) {
    delete (copy as { thinking?: string }).thinking
  }
  return copy
}

export class AiContextManager {
  private readonly contexts = new Map<ContextKey, AiMemory>()
  private readonly baseSystemPrompt: string

  constructor(systemPrompt: string = BASE_SYSTEM_PROMPT) {
    this.baseSystemPrompt = systemPrompt
  }

  private ensure(playerId: ContextKey): AiMemory {
    let memory = this.contexts.get(playerId)
    if (!memory) {
      memory = {
        base: {
          role: 'system',
          content: this.baseSystemPrompt
        },
        stages: new Map(),
        lastStage: undefined
      }
      this.contexts.set(playerId, memory)
    }
    return memory
  }

  private ensureStage(memory: AiMemory, stage: string, stagePrompt: string): StageMemory {
    let stageMemory = memory.stages.get(stage)
    if (!stageMemory) {
      stageMemory = {
        system: {
          role: 'system',
          content: stagePrompt
        },
        history: []
      }
      memory.stages.set(stage, stageMemory)
    } else if (stageMemory.system.content !== stagePrompt) {
      stageMemory.system = {
        role: 'system',
        content: stagePrompt
      }
    }
    return stageMemory
  }

  prepareStage(playerId: ContextKey, stage: string, stagePrompt: string) {
    const memory = this.ensure(playerId)
    const stageMemory = this.ensureStage(memory, stage, stagePrompt)
    memory.lastStage = stage

    const messages: ChatCompletionMessageParam[] = [
      cloneMessage(memory.base),
      cloneMessage(stageMemory.system),
      ...stageMemory.history.map(cloneMessage)
    ]
    return messages
  }

  append(playerId: ContextKey, messages: ChatCompletionMessageParam[]) {
    const memory = this.ensure(playerId)
    if (!memory.lastStage) return
    const stageMemory = memory.stages.get(memory.lastStage)
    if (!stageMemory) return

    messages.forEach((message) => {
      if (message.role === 'system') {
        return
      }
      stageMemory.history.push(cloneMessage(message))
    })

    const overflow = stageMemory.history.length - MAX_STAGE_HISTORY
    if (overflow > 0) {
      stageMemory.history.splice(0, overflow)
    }
  }

  reset(playerId: ContextKey) {
    this.contexts.delete(playerId)
  }
}

export const aiContextManager = new AiContextManager()

