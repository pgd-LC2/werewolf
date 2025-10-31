import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AiRequestBody {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    name?: string;
  }>;
  temperature?: number;
}

interface AiStructuredAction {
  type: string;
  targetId?: number | null;
  notes?: string;
}

interface AiAction {
  speech: string;
  plan: string;
  confidence: number;
  action?: AiStructuredAction;
}

interface ChatCompletionMessage {
  role?: string;
  content?: string;
  reasoning?: string;
  thinking?: string;
}

interface ChatCompletionChoice {
  index?: number;
  finish_reason?: string;
  message?: ChatCompletionMessage;
}

interface ChatCompletion {
  id?: string;
  model?: string;
  created?: number;
  choices?: ChatCompletionChoice[];
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

const AI_ACTION_SCHEMA = {
  type: "object",
  properties: {
    speech: {
      type: "string",
      description: "AI的发言内容"
    },
    plan: {
      type: "string",
      description: "AI的行动计划"
    },
    confidence: {
      type: "number",
      description: "置信度（0-1之间）",
      minimum: 0,
      maximum: 1,
    },
    action: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "行动类型"
        },
        targetId: {
          type: ["integer", "null"],
          description: "目标玩家ID"
        },
        notes: {
          type: "string",
          description: "行动备注"
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  required: ["speech", "plan", "confidence"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: "OpenRouter API key not configured",
          configured: false 
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const requestBody: AiRequestBody = await req.json();
    const { model, messages, temperature = 0.9 } = requestBody;

    const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

    // 检测是否为Claude模型（包括所有Claude变体）
    const isClaudeModel = model.toLowerCase().includes('claude');
    const isAnthropicProvider = model.toLowerCase().startsWith('anthropic/');

    // 为Claude模型构建请求体
    const requestPayload: Record<string, unknown> = {
      model,
      temperature,
      messages,
    };

    // Claude模型需要使用结构化输出参数
    if (isClaudeModel || isAnthropicProvider) {
      console.log(`Detected Claude model: ${model}, using structured outputs`);
      requestPayload.response_format = {
        type: "json_schema",
        json_schema: {
          name: "ai_action_schema",
          strict: true,
          schema: AI_ACTION_SCHEMA,
        },
      };
    } else {
      // 非Claude模型使用标准JSON模式
      requestPayload.response_format = {
        type: "json_schema",
        json_schema: {
          name: "ai_action_schema",
          strict: true,
          schema: AI_ACTION_SCHEMA,
        },
      };
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://werewolf-game.netlify.app",
        "X-Title": "Werewolf AI Game",
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ 
          error: `OpenRouter request failed: ${response.status} ${response.statusText}`,
          details: errorText 
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await response.json() as ChatCompletion;
    const choice = data.choices?.[0];

    if (!choice) {
      console.error("OpenRouter response missing choices:", JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({
          error: "OpenRouter response missing choices",
          rawResponse: data
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let content = choice.message?.content;
    const reasoning = choice.message?.reasoning;

    // MiniMax模型会把JSON放在reasoning字段中，需要从中提取
    if (!content && reasoning) {
      console.log("Content is empty, trying to extract JSON from reasoning field");

      // 方法1: 尝试从reasoning中提取JSON代码块
      let jsonMatch = reasoning.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        content = jsonMatch[1].trim();
      } else {
        // 方法2: 查找最后一个完整的JSON对象（从最后的}向前匹配）
        const lastBraceIndex = reasoning.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          // 从最后的}往前查找匹配的{
          let braceCount = 0;
          let startIndex = -1;
          for (let i = lastBraceIndex; i >= 0; i--) {
            if (reasoning[i] === '}') braceCount++;
            if (reasoning[i] === '{') {
              braceCount--;
              if (braceCount === 0) {
                startIndex = i;
                break;
              }
            }
          }
          if (startIndex !== -1) {
            const potentialJson = reasoning.substring(startIndex, lastBraceIndex + 1);
            // 验证是否是有效JSON
            try {
              JSON.parse(potentialJson);
              content = potentialJson;
              console.log("Extracted JSON from reasoning field successfully");
            } catch {
              console.log("Failed to parse extracted JSON, using full reasoning");
              content = reasoning;
            }
          }
        }
      }
    }

    if (!content) {
      console.error("OpenRouter response missing message.content and reasoning:", JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({
          error: "OpenRouter response missing message.content",
          message: choice.message,
          rawResponse: data
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let parsed: AiAction;
    try {
      parsed = JSON.parse(content) as AiAction;
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: "OpenRouter response is not valid JSON",
          content,
          parseError: error instanceof Error ? error.message : String(error)
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const result = {
      action: parsed,
      raw: data,
      thinking: choice.message?.reasoning ?? choice.message?.thinking,
    };

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});