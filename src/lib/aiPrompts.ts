import type { GameState, Player } from './game'
import type { AiPlayerProfile, AiPlayerMemory } from './aiProfiles'
import type { NightContext, DayContext, HunterContext, DiscussionEvent } from '../hooks/useGameOrchestrator'

type StageKey =
  | 'night-werewolf'
  | 'night-seer'
  | 'night-witch'
  | 'day-discussion'
  | 'day-voting'
  | 'post-vote-discussion'
  | 'post-vote-followup'
  | 'hunter-action'

export interface StagePrompt {
  stage: StageKey
  systemPrompt: string
  userPrompt: string
}

const JSON_INSTRUCTION =
  '请严格按照 JSON Schema 输出：{"speech":"...","plan":"...","confidence":0-1,"action":{"type":"...","targetId":<number|null>,"notes":"..."}}。禁止输出额外说明或 Markdown。'

function formatPlayerLine(player: Player, revealRole: boolean, emphasis: number[] = []) {
  const status = player.isAlive ? '存活' : '阵亡'
  const rolePart = revealRole ? ` / 身份：${player.role}` : ''
  const marker = emphasis.includes(player.id) ? '★ ' : ''
  return `${marker}#${player.id} ${player.name}（${status}${rolePart}）`
}

function formatKnownRoles(memory: AiPlayerMemory) {
  const entries = Object.entries(memory.knownRoles)
  if (!entries.length) return '暂无已确认身份'
  return entries.map(([id, role]) => `座位 #${id}：${role}`).join('\n')
}

function formatRecentLog(logs: string[]) {
  if (!logs.length) return '暂无关键日志'
  return logs.slice(-5).join('\n')
}

function formatLatestHighlight(state: GameState) {
  const entries = state.highlights
  if (!entries.length) return '暂无关键事件'
  return entries[entries.length - 1]
}

function formatSpeeches(previous: DiscussionEvent[], state: GameState) {
  if (!previous.length) return '尚无人发言'
  return previous.map((item) => {
    const speaker = state.players.find(p => p.id === item.speakerId)
    const name = speaker ? speaker.name : '未知'
    return `#${item.speakerId} ${name}：${item.speech}`
  }).join('\n')
}

export function buildWerewolfPrompt(
  profile: AiPlayerProfile,
  context: NightContext,
  memory: AiPlayerMemory,
  wolfSpeeches?: { playerId: number; playerName: string; speech: string }[]
): StagePrompt {
  const emphasisIds = profile.allies.map((ally) => ally.id)
  const allies =
    profile.allies.length > 0
      ? profile.allies.map((ally) => `#${ally.id} ${ally.name}`).join('、')
      : '只有你自己'
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false, emphasisIds)).join('\n')
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)
  const lastAction = memory.lastAction ?? '无记录'

  // 格式化狼人队友的发言
  const teamChat = wolfSpeeches && wolfSpeeches.length > 0
    ? '\n狼队频道（队内可见）：\n' + wolfSpeeches
        .map(s => `  #${s.playerId} ${s.playerName}：${s.speech}`)
        .join('\n')
    : ''

  const systemPrompt = `阶段：夜晚 · 狼人行动
你是座位 #${profile.player.id} 的狼人，需要与同伴协同决定击杀目标。${JSON_INSTRUCTION}`
  const userPrompt = `当前夜次：第 ${context.day + 1} 夜
狼人同伴：${allies}${teamChat}
存活玩家：
${visibleList}
上一晚摘要：
${latestHighlight}
最近日志：
${recent}
上一次行动记录：${lastAction}
请在 action.type 中返回 "attack"（执行击杀）或 "pass"（空刀）。若执行击杀，请在 targetId 指定目标座位号；若放弃则填 null。`

  return {
    stage: 'night-werewolf',
    systemPrompt,
    userPrompt
  }
}

export function buildSeerPrompt(
  profile: AiPlayerProfile,
  context: NightContext,
  memory: AiPlayerMemory
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const known = formatKnownRoles(memory)
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)
  const lastAction = memory.lastAction ?? '无记录'

  const systemPrompt = `阶段：夜晚 · 预言家查验
你是座位 #${profile.player.id} 的预言家，可以查验一名玩家的阵营身份。${JSON_INSTRUCTION}`
  const userPrompt = `当前夜次：第 ${context.day + 1} 夜
存活玩家：
${visibleList}
已确认身份：
${known}
最近日志：
${recent}
上一晚摘要：
${latestHighlight}
上一次行动记录：${lastAction}
请在 action.type 中返回 "inspect" 或 "pass"。若查验，请在 targetId 指定目标座位号；若放弃请填 null。`

  return {
    stage: 'night-seer',
    systemPrompt,
    userPrompt
  }
}

export function buildWitchPrompt(
  profile: AiPlayerProfile,
  context: NightContext,
  memory: AiPlayerMemory,
  pendingKill: number | null
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const pendingText = pendingKill ? `狼人可能击杀座位 #${pendingKill}` : '狼人目标暂未确定'
  const saveStatus = memory.usedSave ? '已使用' : '未使用'
  const poisonStatus = memory.usedPoison ? '已使用' : '未使用'
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)
  const lastAction = memory.lastAction ?? '无记录'

  const systemPrompt = `阶段：夜晚 · 女巫抉择
你是座位 #${profile.player.id} 的女巫，拥有一瓶解药与一瓶毒药。${JSON_INSTRUCTION}`
  const userPrompt = `当前夜次：第 ${context.day + 1} 夜
${pendingText}
存活玩家：
${visibleList}
解药状态：${saveStatus} / 毒药状态：${poisonStatus}
最近日志：
${recent}
上一晚摘要：
${latestHighlight}
上一次行动记录：${lastAction}
请在 action.type 中返回 "save"、"poison" 或 "pass"。若使用解药，请将 targetId 设为狼人目标；若使用毒药，请指定希望毒死的座位；放弃则填 null。`

  return {
    stage: 'night-witch',
    systemPrompt,
    userPrompt
  }
}

export function buildDiscussionPrompt(
  profile: AiPlayerProfile,
  context: DayContext,
  memory: AiPlayerMemory,
  previousSpeeches: DiscussionEvent[]
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const known = formatKnownRoles(memory)
  const speeches = formatSpeeches(previousSpeeches, context.state)
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)
  const lastSpeech = memory.lastSpeech ?? '尚未发言'
  const lastAction = memory.lastAction ?? '无记录'

  const systemPrompt = `阶段：白天 · 自由发言
你是座位 #${profile.player.id} 的 ${profile.player.role}，需要给出公开发言与推理。${JSON_INSTRUCTION}`
  const userPrompt = `当前天数：第 ${context.day} 天
存活玩家：
${visibleList}
已确认身份：
${known}
已发表的发言：
${speeches}
最近日志：
${recent}
昨夜信息：
${latestHighlight}
当前轮到座位 #${profile.player.id} 发言
你上一轮发言：${lastSpeech}
内部备忘：${lastAction}
请在 action.type 中返回 "speech"，并将 targetId 留空（null），写出发言内容与推理结论。`

  return {
    stage: 'day-discussion',
    systemPrompt,
    userPrompt
  }
}

export function buildVotingPrompt(
  profile: AiPlayerProfile,
  context: DayContext,
  memory: AiPlayerMemory,
  discussionSpeeches: DiscussionEvent[]
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const known = formatKnownRoles(memory)
  const lastSpeech = memory.lastSpeech ?? '尚未发言'
  const lastAction = memory.lastAction ?? '无记录'
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)
  const speeches = formatSpeeches(discussionSpeeches, context.state)

  const systemPrompt = `阶段：白天 · 投票放逐
你是座位 #${profile.player.id} 的 ${profile.player.role}，需要投票选出放逐对象。${JSON_INSTRUCTION}`
  const userPrompt = `当前天数：第 ${context.day} 天
存活玩家：
${visibleList}
已确认身份：
${known}

【今日讨论发言】
${speeches}

你的发言：${lastSpeech}
内部备忘：${lastAction}
最近日志：
${recent}
昨夜信息：
${latestHighlight}

根据以上讨论内容和推理，请在 action.type 中返回 "vote"，并在 targetId 指定希望放逐的座位号；若弃权请填 null。`

  return {
    stage: 'day-voting',
    systemPrompt,
    userPrompt
  }
}

export function buildHunterPrompt(
  profile: AiPlayerProfile,
  context: HunterContext,
  memory: AiPlayerMemory
): StagePrompt {
  const candidates =
    context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n') || '暂无可选目标'
  const lastAction = memory.lastAction ?? '无记录'
  const scene = context.context === 'night' ? '夜间被狼人击杀' : '白天被投票驱逐'
  const recent = formatRecentLog(context.state.gameLog)
  const latestHighlight = formatLatestHighlight(context.state)

  const systemPrompt = `阶段：猎人反击
你是座位 #${profile.player.id} 的猎人，正在决定是否开枪带走一名玩家。${JSON_INSTRUCTION}`
  const userPrompt = `触发场景：${scene}
可选目标：
${candidates}
最近日志：
${recent}
最近摘要：
${latestHighlight}
上一次行动记录：${lastAction}
请在 action.type 中返回 "hunt"，并在 targetId 指定希望带走的座位号；若选择保留子弹，请填 null。`

  return {
    stage: 'hunter-action',
    systemPrompt,
    userPrompt
  }
}

export function buildPostVoteDiscussionPrompt(
  profile: AiPlayerProfile,
  context: DayContext,
  memory: AiPlayerMemory,
  voteSummary: { voteCounts: Record<number, number>; exiledPlayerId: number | null; isTie: boolean; votes: { voterId: number; targetId: number }[] },
  previousSpeeches: DiscussionEvent[],
  round: number
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const known = formatKnownRoles(memory)
  const recent = formatRecentLog(context.state.gameLog)
  const lastSpeech = memory.lastSpeech ?? '尚未发言'

  const voteCountLines = Object.entries(voteSummary.voteCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, count]) => {
      const player = context.state.players.find(p => p.id === Number(playerId))
      return `  #${playerId} ${player?.name ?? '未知'} 获得 ${count} 票`
    })
    .join('\n')

  const voteDetailLines = voteSummary.votes
    .map(v => {
      const voter = context.state.players.find(p => p.id === v.voterId)
      const target = context.state.players.find(p => p.id === v.targetId)
      return `  #${v.voterId} ${voter?.name ?? '未知'} → #${v.targetId} ${target?.name ?? '未知'}`
    })
    .join('\n')

  const exiledInfo = voteSummary.exiledPlayerId
    ? `被放逐者：#${voteSummary.exiledPlayerId} ${context.state.players.find(p => p.id === voteSummary.exiledPlayerId)?.name ?? '未知'}`
    : voteSummary.isTie
      ? '平票，无人出局'
      : '无人出局'

  const roundSuffix = round > 1 ? `（第${round}轮）` : ''
  const speeches = formatSpeeches(previousSpeeches, context.state)
  const speechContext = previousSpeeches.length > 0
    ? `\n本轮其他人的发言：\n${speeches}`
    : ''

  const systemPrompt = `阶段：票后分析${roundSuffix}
你是座位 #${profile.player.id} 的 ${profile.player.role}，刚刚完成投票。现在需要分析票型并给出评价。${JSON_INSTRUCTION}`

  const userPrompt = `当前天数：第 ${context.day} 天
存活玩家：
${visibleList}
已确认身份：
${known}
你最近一次发言：${lastSpeech}

【投票结果】
${exiledInfo}
票数统计：
${voteCountLines}
详细票型：
${voteDetailLines}${speechContext}

最近日志：
${recent}

请在 action.type 中返回 "post_vote_analysis"。
在 speech 中分析票型（如归票趋势、异常投票、票数分布），并表明立场。
在 action.wantsContinue 中返回 true（希望继续讨论）或 false（无需继续）。
在 action.notes 中记录你的分析要点。`

  return {
    stage: 'post-vote-discussion',
    systemPrompt,
    userPrompt
  }
}

export function buildPostVoteFollowUpPrompt(
  profile: AiPlayerProfile,
  context: DayContext,
  memory: AiPlayerMemory,
  allPreviousSpeeches: DiscussionEvent[],
  round: number
): StagePrompt {
  const visibleList = context.alivePlayers.map((player) => formatPlayerLine(player, false)).join('\n')
  const known = formatKnownRoles(memory)
  const speeches = formatSpeeches(allPreviousSpeeches, context.state)

  const systemPrompt = `阶段：票后分析 · 第${round}轮补充
你是座位 #${profile.player.id} 的 ${profile.player.role}。听完其他人的票后分析，决定是否需要补充发言。${JSON_INSTRUCTION}`

  const userPrompt = `当前天数：第 ${context.day} 天
存活玩家：
${visibleList}
已确认身份：
${known}

【本轮所有人的分析】
${speeches}

判断标准：
- 是否有人质疑了你？
- 是否发现了新的逻辑漏洞或矛盾？
- 是否需要澄清或回应某些观点？
- 是否有重要信息需要补充？

请在 action.type 中返回 "follow_up"。
在 action.hasFollowUp 中返回 true（需要补充）或 false（不需要）。
如果需要补充，在 speech 中写出你的回应；否则留空即可。`

  return {
    stage: 'post-vote-followup',
    systemPrompt,
    userPrompt
  }
}
