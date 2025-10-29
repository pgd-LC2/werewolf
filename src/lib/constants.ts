import type { LucideIcon } from 'lucide-react'
import { Layers3, ScanFace, Sparkle } from 'lucide-react'

export const navLinks = [
  { label: '方案体系', href: '#system' },
  { label: '服务流', href: '#flow' },
  { label: '动态观察', href: '#pulse' },
  { label: '实验室', href: '#lab' }
]

export const studioMetrics = [
  { label: '定制体验方案', value: '128+', hint: '过去 12 个月交付' },
  { label: '平均上线周期', value: '21 天', hint: '以冲刺为单位推进' },
  { label: '体验满意度', value: '97%', hint: '来自核心业务团队' }
]

export type ScenarioPreset = {
  title: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export const scenarioPresets: ScenarioPreset[] = [
  {
    title: '胶囊式登录流程',
    description: '统一按钮与输入的轮廓半径，并以内边距节奏强调关键信息项。',
    tags: ['SaaS', 'B2B'],
    icon: ScanFace
  },
  {
    title: '即时指挥面板',
    description: '在单页中布局策略、洞察与下一步，保持 0.5 秒可识别原则。',
    tags: ['运营', '数据'],
    icon: Layers3
  },
  {
    title: '极简交互胶囊',
    description: '通过 4/8px 节奏与柔和分层建立具象而不失秩序的触点体验。',
    tags: ['移动端', '金融'],
    icon: Sparkle
  }
]

export const workflowSteps = [
  {
    title: '感知',
    detail: '组合热图、会话重放与可用性测试，筛出 0.5 秒无法识别的痛点。',
    duration: '第 1-3 天'
  },
  {
    title: '编排',
    detail: '利用胶囊化组件库排布信息流，以对比系数验证聚焦度。',
    duration: '第 4-10 天'
  },
  {
    title: '共创',
    detail: '设计研讨＋快速原子化开发，确保主操作显性化与移动端一致。',
    duration: '第 11-18 天'
  },
  {
    title: '验证',
    detail: '灰度上线并以无障碍清单复核，跟踪完成率与满意度指标。',
    duration: '第 19-21 天'
  }
]

export const pulseStreams = [
  {
    title: '零售银行开户',
    status: '进行中',
    score: 82,
    note: '按钮体积已收敛至 10×10，等待次级操作验证。'
  },
  {
    title: '企业门户登录',
    status: '设计中',
    score: 74,
    note: '输入高度已调至 40px，需补充焦点 outline 的密度测试。'
  },
  {
    title: '跨境电商支付',
    status: '联调',
    score: 91,
    note: '危险操作使用 warn 色系，仅暴露在二级菜单。'
  }
]

export const labNotes = [
  {
    title: '呼吸式信息层级',
    description: '通过多层留白与模糊处理，弱化非关键背景信噪比。',
    figure: '2.4 s',
    meta: '完成平均任务时间'
  },
  {
    title: '焦点可视化扫描',
    description: '统一 outline 样式，键盘导航成功率提高 37%。',
    figure: '37%',
    meta: '可访问性提升'
  },
  {
    title: '语义化危险色',
    description: '仅在 destructive 操作上使用 warn 色，误触下降 63%。',
    figure: '-63%',
    meta: '误操作下降'
  }
]
