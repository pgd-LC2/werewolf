export type RuleCategory =
  | '游戏目标'
  | '身份配置'
  | '夜晚流程'
  | '白天流程'
  | '特殊能力'
  | '胜负判定'

export interface RuleItem {
  title: string
  description: string
  details?: string[]
}

export const WEREWOLF_RULES: Record<RuleCategory, RuleItem[]> = {
  游戏目标: [
    {
      title: '好人阵营（村民方）',
      description: '通过推理与投票找出并处决所有狼人。',
      details: ['若所有狼人被淘汰则好人阵营获胜。']
    },
    {
      title: '狼人阵营',
      description: '通过夜间击杀与操控投票，削减好人数量直至阵营人数占优。',
      details: ['当狼人数量大于或等于好人时，狼人阵营获胜。']
    }
  ],
  身份配置: [
    {
      title: '10 人标准身份',
      description: '3 狼人、3 村民、1 预言家、1 女巫、1 猎人、1 替补（可为村民或主持自定义）。'
    },
    {
      title: '可选附加身份',
      description: '主持人可根据需要加入守卫、白痴等扩展角色，但需提前告知所有玩家。'
    }
  ],
  夜晚流程: [
    {
      title: '依次行动顺序',
      description: '夜晚依照以下顺序推进，不同身份在自己的环节醒来执行技能。',
      details: [
        '1. 狼人决定击杀目标；',
        '2. 预言家查验任意一名存活玩家的阵营；',
        '3. 女巫先决定是否使用解药救狼刀目标，再决定是否投毒他人。'
      ]
    },
    {
      title: '技能使用限制',
      description: '预言家每夜只能查验一人；女巫解药、毒药各限用一次；猎人在夜里被击杀不会立即开枪。'
    }
  ],
  白天流程: [
    {
      title: '公布夜讯',
      description: '主持人宣布夜间死亡玩家（若有）的身份是否公开由房规决定。'
    },
    {
      title: '自由发言与讨论',
      description: '玩家按座次或自由顺序发言，发表推理与辩解。若存在禁言类技能，应在此阶段执行。'
    },
    {
      title: '投票放逐',
      description: '全部存活玩家投票选出放逐对象，票数最高者当日出局；若票数并列，可重新发言或直接留空视房规。'
    },
    {
      title: '猎人技能',
      description: '若当日被放逐或夜里被击杀的角色为猎人，可选择是否立即发动开枪技能。'
    }
  ],
  特殊能力: [
    {
      title: '预言家',
      description: '夜间查验目标真实身份，不可谎报查验结果给主持人。'
    },
    {
      title: '女巫',
      description: '拥有一瓶解药与一瓶毒药；同一夜不可同时使用两种药剂。'
    },
    {
      title: '猎人',
      description: '被放逐或夜间死亡时，可选择带走一名玩家（若被毒死则无法发动）。'
    }
  ],
  胜负判定: [
    {
      title: '好人胜利',
      description: '全部狼人被淘汰，或狼人无法继续行动。'
    },
    {
      title: '狼人胜利',
      description: '场上狼人数量 ≥ 好人数量且仍有狼人存活。'
    },
    {
      title: '特殊结局',
      description: '若使用第三阵营（如白痴、盗贼等），应根据自定义规则追加胜利条件。'
    }
  ]
}

export const RULE_OVERVIEW = [
  '保持主持中立，确保所有行动按顺序执行。',
  '确认所有技能使用情况并同步给对应身份玩家。',
  '记录投票与夜间结果，随时可回溯对局过程。'
]
