import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少Supabase环境变量')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface DatabaseGame {
  id?: string
  created_at?: string
  game_data: Record<string, unknown>
  winner: string
  total_days: number
  total_players: number
  ai_model: string
  game_log: string[]
  highlights: string[]
  final_players: Record<string, unknown>[]
}

export interface DatabaseGameEvent {
  id?: string
  game_id: string
  created_at?: string
  event_type: string
  day: number
  phase: string
  actor_id?: number
  content: string
  thinking?: string
  extra_data?: Record<string, unknown>
}
