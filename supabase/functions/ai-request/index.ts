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
        maximum: 1,
      },
      action: {
        type: "object",
        properties: {
          type: { type: "string" },
          targetId: { type: ["integer", "null"] },
          notes: { type: "string" },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
    required: ["speech", "plan", "confidence"],
    additionalProperties: false,
  },
  strict: true,
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

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "X-OpenRouter-Enable-Reasoning": "true",
        "X-OpenRouter-Response-Thoughts": "true",
      },
      body: JSON.stringify({
        model,
        temperature,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: RESPONSE_SCHEMA,
        },
      }),
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
      return new Response(
        JSON.stringify({ error: "OpenRouter response missing choices" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const content = choice.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ error: "OpenRouter response missing message.content" }),
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
