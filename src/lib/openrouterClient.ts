const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const AI_REQUEST_URL = `${SUPABASE_URL}/functions/v1/ai-request`

export const IS_OPENROUTER_CONFIGURED = true

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
  wantsContinue?: boolean
  hasFollowUp?: boolean
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

export async function requestAiAction({
  model,
  messages,
  temperature = 0.9
}: {
  model: string
  messages: ChatCompletionMessageParam[]
  temperature?: number
}): Promise<AiResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration is missing.')
  }

  const response = await fetch(AI_REQUEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      model,
      temperature,
      messages
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI request failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = (await response.json()) as AiResponse
  return data
}
