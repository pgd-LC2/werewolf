import type { GameState, Player, Role } from "./game"

export type Alignment = "Werewolves" | "Villagers"

export interface AiPlayerMemory {
  lastAction?: string
  knownRoles: Record<number, Role>
  notes: string[]
  usedSave?: boolean
  usedPoison?: boolean
  lastSpeech?: string
}

export function createAiMemory(): AiPlayerMemory {
  return {
    knownRoles: {},
    notes: []
  }
}

export interface AiPlayerProfile {
  player: Player
  alignment: Alignment
  allies: Player[]
  knownRoles: { id: number; role: Role }[]
  alivePlayers: Player[]
  day: number
  recentLog: string[]
  memory: AiPlayerMemory
}

export function getAlignment(role: Role): Alignment {
  return role === "Werewolf" ? "Werewolves" : "Villagers"
}

export function buildPlayerProfile(state: GameState, player: Player, memory: AiPlayerMemory): AiPlayerProfile {
  const alivePlayers = state.players.filter((item) => item.isAlive)
  const alignment = getAlignment(player.role)
  const allies = alignment === "Werewolves" ? alivePlayers.filter((item) => item.role === "Werewolf" && item.id !== player.id) : []
  const recentLog = state.gameLog.slice(-5)
  const knownRoles = Object.entries(memory.knownRoles).map(([id, role]) => ({ id: Number(id), role }))

  return {
    player,
    alignment,
    allies,
    knownRoles,
    alivePlayers,
    day: state.day,
    recentLog,
    memory
  }
}
