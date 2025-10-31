export type Role = 'Werewolf' | 'Villager' | 'Seer' | 'Witch' | 'Hunter'

export interface Player {
  id: number
  name: string
  role: Role
  isAlive: boolean
  isSheriff: boolean
  lastNightRoleResult: string | null
}

export type GamePhase =
  | 'RoleAssignment'
  | 'Night'
  | 'WerewolfAction'
  | 'SeerAction'
  | 'WitchAction'
  | 'Day'
  | 'Discussion'
  | 'Voting'
  | 'PostVoteDiscussion'
  | 'HunterAction'
  | 'GameOver'

export type Winner = 'Werewolves' | 'Villagers' | 'none'

export type ReplayCategory = 'phase' | 'decision' | 'speech' | 'action' | 'system' | 'summary'

export interface ReplayEvent {
  id: string
  phase: string
  category: ReplayCategory
  day: number
  actorId?: number
  content: string
  thinking?: string | null
  extra?: Record<string, unknown>
  timestamp: number
}

export interface VoteResult {
  voterId: number
  targetId: number
}

export interface VoteSummary {
  votes: VoteResult[]
  voteCounts: Record<number, number>
  exiledPlayerId: number | null
  isTie: boolean
}

export type HunterPending =
  | {
      playerId: number
      context: 'night' | 'day'
      nextPhase: Exclude<GamePhase, 'HunterAction' | 'RoleAssignment'>
    }
  | null

export interface GameState {
  players: Player[]
  day: number
  phase: GamePhase
  winner: Winner
  werewolfChoice: number | null
  seerChoice: number | null
  witchState: {
    saveUsed: boolean
    poisonUsed: boolean
    poisonChoice: number | null
    savedTargetId: number | null
  }
  votes: { voterId: number; targetId: number }[]
  voteSummary: VoteSummary | null
  postVoteRound: number
  hunterPending: HunterPending
  gameLog: string[]
  replay: ReplayEvent[]
  highlights: string[]
}

export const ROLE_PRESET: Role[] = [
  'Werewolf',
  'Werewolf',
  'Werewolf',
  'Seer',
  'Witch',
  'Hunter',
  'Villager',
  'Villager',
  'Villager',
  'Villager'
]

/**
 * 根据 10 人局的预设角色顺序创建玩家。
 * 如提供的名字不足 10 个，会自动补全为 “Player X”。
 */
export function createInitialPlayers(names: string[] = []): Player[] {
  return ROLE_PRESET.map((role, index) => ({
    id: index + 1,
    name: names[index] ?? `Player ${index + 1}`,
    role,
    isAlive: true,
    isSheriff: false,
    lastNightRoleResult: null
  }))
}

export function createInitialGameState(names?: string[]): GameState {
  return {
    players: createInitialPlayers(names),
    day: 0,
    phase: 'RoleAssignment',
    winner: 'none',
    werewolfChoice: null,
    seerChoice: null,
    witchState: {
      saveUsed: false,
      poisonUsed: false,
      poisonChoice: null,
      savedTargetId: null
    },
    votes: [],
    voteSummary: null,
    postVoteRound: 0,
    hunterPending: null,
    gameLog: ['初始状态：等待 Sheriff 竞选。'],
    replay: [],
    highlights: []
  }
}
