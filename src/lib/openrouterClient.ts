import apiKeyRaw from "../../openrouterkey.txt?raw"

const OPENROUTER_API_KEY = (apiKeyRaw ?? "").trim()
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
export const IS_OPENROUTER_CONFIGURED = OPENROUTER_API_KEY.length > 0

export type ChatCompletionRole = "system" | "user" | "assistant" | "tool"

export interface ChatCompletionMessageParam {
  role: ChatCompletionRole
  content: string
  name?: string
  thinking?: string
}

interface ChatCompletionMessage {
  role?: ChatCompletionRole
  content?: string
  reasoning?: string
  thinking?: string
}

interface ChatCompletionChoice {
  index?: number
  finish_reason?: string
  message?: ChatCompletionMessage
}

interface ChatCompletion {
  id?: string
  model?: string
  created?: number
  choices?: ChatCompletionChoice[]
  usage?: Record<string, unknown>
  [key: string]: unknown
}

export interface AiStructuredAction {
  type: string
  targetId?: number | null
  notes?: string
}

export interface AiAction {
  speech: string
  plan: string
  confidence: number
  action?: AiStructuredAction
}

export interface AiResponse {
  action: AiAction
  raw: ChatCompletion
  thinking?: string
}

const RESPONSE_SCHEMA = {
  name: "ai_action_schema",
  schema: {
    type: "object",
    properties: {
      speech: { type: "string" },
      plan: { type: "string" },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1
      },
      action: {
        type: "object",
        properties: {
          type: { type: "string" },
          targetId: { type: ["integer", "null"] },
          notes: { type: "string" }
        },
        required: ["type"],
        additionalProperties: false
      }
    },
    required: ["speech", "plan", "confidence"],
    additionalProperties: false
  },
  strict: true
} as const

export async function requestAiAction({
  model,
  messages,
  temperature = 0.9
}: {
  model: string
  messages: ChatCompletionMessageParam[]
  temperature?: number
}): Promise<AiResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is missing. Please ensure openrouterkey.txt contains a valid key.')
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "X-OpenRouter-Enable-Reasoning": "true",
      "X-OpenRouter-Response-Thoughts": "true"
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: RESPONSE_SCHEMA
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletion
  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error('OpenRouter response missing choices.')
  }

  const content = choice.message?.content
  if (!content) {
    throw new Error('OpenRouter response missing message.content.')
  }

  let parsed: AiAction
  try {
    parsed = JSON.parse(content) as AiAction
  } catch (error) {
    console.error('Failed to parse OpenRouter JSON:', content, error)
    throw new Error('OpenRouter response is not valid JSON.')
  }

  return {
    action: parsed,
    raw: data,
    thinking: choice.message?.reasoning ?? choice.message?.thinking
  }
}
