import type { GameState } from './game'
import { supabase, type DatabaseGame, type DatabaseGameEvent } from './supabaseClient'

export interface ExportData {
  gameState: GameState
  aiModel: string
  exportTime: string
  version: string
}

export function exportGameAsJSON(gameState: GameState, aiModel: string): string {
  const exportData: ExportData = {
    gameState,
    aiModel,
    exportTime: new Date().toISOString(),
    version: '1.0.0'
  }
  return JSON.stringify(exportData, null, 2)
}

export function downloadJSON(data: string, filename: string) {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function uploadGameToDatabase(
  gameState: GameState,
  aiModel: string
): Promise<{ success: boolean; gameId?: string; error?: string }> {
  try {
    const gameData: DatabaseGame = {
      game_data: gameState as unknown as Record<string, unknown>,
      winner: gameState.winner,
      total_days: gameState.day,
      total_players: gameState.players.length,
      ai_model: aiModel,
      game_log: gameState.gameLog,
      highlights: gameState.highlights,
      final_players: gameState.players as unknown as Record<string, unknown>[]
    }

    const { data: insertedGame, error: gameError } = await supabase
      .from('games')
      .insert(gameData)
      .select('id')
      .maybeSingle()

    if (gameError) {
      console.error('上传游戏数据失败:', gameError)
      return { success: false, error: gameError.message }
    }

    if (!insertedGame) {
      return { success: false, error: '未能获取插入的游戏ID' }
    }

    const gameId = insertedGame.id

    const events: DatabaseGameEvent[] = gameState.replay.map((event) => ({
      game_id: gameId,
      event_type: event.category,
      day: event.day,
      phase: event.phase,
      actor_id: event.actorId,
      content: event.content,
      thinking: event.thinking ?? undefined,
      extra_data: event.extra as Record<string, unknown> | undefined
    }))

    if (events.length > 0) {
      const { error: eventsError } = await supabase.from('game_events').insert(events)

      if (eventsError) {
        console.error('上传游戏事件失败:', eventsError)
        return { success: false, error: `游戏已保存但事件保存失败: ${eventsError.message}` }
      }
    }

    return { success: true, gameId }
  } catch (error) {
    console.error('上传过程中发生错误:', error)
    return { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }
}
