/**
 * 跨系统共享常量。
 * 集中维护，便于数值调优时只改一处。
 * Phase 1 新增：普攻、技能 Q、敌人 AI 相关常量。
 */

// —— 游戏视口 ——
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const TILE_SIZE = 32;

// —— 玩家武士 ——
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED = 240;
export const PLAYER_START_HP = 500;
export const PLAYER_COLOR = 0x3a3a42;
export const PLAYER_ACCENT = 0xf5f5dc;
export const PLAYER_SWORD_COLOR = 0xe5e5f0;

// —— 世界 ——
export const WORLD_BG = 0x1a1a20;
export const WALL_COLOR = 0x5a5a64;
export const GROUND_COLOR = 0x2a2a32;
export const GRID_COLOR = 0x32323c;

// —— 敌人占位符 ——
export const ONI_COLOR = 0xcc3322;
export const BONE_COLOR = 0xc8c0b8;
export const WRAITH_COLOR = 0x6ab0ff;

// —— 玩家战斗（Phase 1）——
export const PLAYER_ATTACK_RANGE = 72;            // 普攻检测距离（px）
export const PLAYER_ATTACK_WIDTH = 40;            // 普攻检测宽度（矩形）
export const PLAYER_ATTACK_COOLDOWN_MS = 650;     // 普攻攻击间隔（占位 0.9s 略短）
export const PLAYER_ATTACK_DAMAGE = 50;           // 普攻基础伤害（= 100% ATK）
export const PLAYER_ATTACK_HIT_FRAME = 120;       // 普攻多少 ms 后判定命中

// —— Q 居合斩（Phase 1）——
export const SKILL_Q_COOLDOWN_MS = 5000;
export const SKILL_Q_DASH_SPEED = 900;            // 冲刺瞬时速度
export const SKILL_Q_DASH_DISTANCE = 260;         // 冲刺总距离
export const SKILL_Q_WIDTH = 48;                  // 路径判定宽度
export const SKILL_Q_DAMAGE = 100;                // 200% ATK

// —— 赤鬼 Enemy（Phase 1）——
export const ONI_HP = 120;
export const ONI_SPEED = 85;
export const ONI_ATTACK_RANGE = 36;
export const ONI_ATTACK_DAMAGE = 12;
export const ONI_ATTACK_COOLDOWN_MS = 1800;
export const ONI_WINDUP_MS = 500;                 // 抬手前摇 + 稍微放慢让玩家看清
export const ONI_RADIUS = 16;
export const ONI_GOLD_REWARD_MIN = 5;
export const ONI_GOLD_REWARD_MAX = 12;

// —— 飘字效果 ——
export const DAMAGE_FLOAT_UP = -40;               // 伤害数字向上飘终点（y 偏移）
export const DAMAGE_FLOAT_DURATION_MS = 600;
