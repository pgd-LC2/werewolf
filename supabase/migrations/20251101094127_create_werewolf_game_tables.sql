/*
  # 狼人杀游戏数据表

  1. 新建表
    - `games`
      - `id` (uuid, 主键) - 游戏唯一标识
      - `created_at` (timestamptz) - 创建时间
      - `game_data` (jsonb) - 完整游戏状态（GameState）
      - `winner` (text) - 获胜方：'Werewolves'、'Villagers'、'none'
      - `total_days` (integer) - 游戏总天数
      - `total_players` (integer) - 玩家总数
      - `ai_model` (text) - 使用的AI模型
      - `game_log` (text[]) - 游戏日志数组
      - `highlights` (text[]) - 关键事件数组
      - `final_players` (jsonb) - 最终玩家状态

    - `game_events`
      - `id` (uuid, 主键) - 事件唯一标识
      - `game_id` (uuid, 外键) - 关联的游戏ID
      - `created_at` (timestamptz) - 事件发生时间
      - `event_type` (text) - 事件类型：'phase'、'decision'、'speech'、'action'、'system'、'summary'
      - `day` (integer) - 发生在第几天
      - `phase` (text) - 游戏阶段
      - `actor_id` (integer) - 行动者玩家编号（可选）
      - `content` (text) - 事件内容
      - `thinking` (text) - AI思考过程（可选）
      - `extra_data` (jsonb) - 额外数据（可选）

  2. 安全设置
    - 为两个表启用RLS
    - 暂不添加策略（后续根据需求添加认证和权限控制）

  3. 索引优化
    - 为games表的created_at添加索引
    - 为game_events表的game_id和created_at添加索引
*/

-- 创建games表
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  game_data jsonb NOT NULL,
  winner text DEFAULT 'none',
  total_days integer DEFAULT 0,
  total_players integer DEFAULT 10,
  ai_model text DEFAULT '',
  game_log text[] DEFAULT '{}',
  highlights text[] DEFAULT '{}',
  final_players jsonb DEFAULT '[]'::jsonb
);

-- 创建game_events表
CREATE TABLE IF NOT EXISTS game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  event_type text NOT NULL,
  day integer DEFAULT 0,
  phase text NOT NULL,
  actor_id integer,
  content text NOT NULL,
  thinking text,
  extra_data jsonb
);

-- 为games表启用RLS
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- 为game_events表启用RLS
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- 创建公开访问策略（任何人都可以读取和插入游戏数据）
CREATE POLICY "允许所有人读取游戏"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "允许所有人创建游戏"
  ON games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有人读取游戏事件"
  ON game_events FOR SELECT
  USING (true);

CREATE POLICY "允许所有人创建游戏事件"
  ON game_events FOR INSERT
  WITH CHECK (true);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_created_at ON game_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_events_composite ON game_events(game_id, day, created_at);
