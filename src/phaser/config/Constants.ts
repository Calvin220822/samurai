/**
 * 跨系统共享常量。集中维护，便于数值调优时只改一处。
 * Phase 1 已实现：普攻 / Q 居合斩 / 赤鬼。
 * Phase 2 新增：W 旋风斩 / E 影步 / 骸骨武士 / 怨灵 / 精英鬼将 / 经验升级 / 装备掉落。
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

// —— 敌人占位色 ——
export const ONI_COLOR = 0xcc3322;
export const BONE_COLOR = 0xc8c0b8;
export const WRAITH_COLOR = 0x6ab0ff;
export const ELITE_COLOR = 0x9933aa;

// —— 玩家战斗（Phase 1）——
export const PLAYER_ATTACK_RANGE = 72;
export const PLAYER_ATTACK_WIDTH = 40;
export const PLAYER_ATTACK_COOLDOWN_MS = 650;
export const PLAYER_ATTACK_DAMAGE = 50;
export const PLAYER_ATTACK_HIT_FRAME = 120;

// —— Q 居合斩 ——
export const SKILL_Q_COOLDOWN_MS = 5000;
export const SKILL_Q_DASH_SPEED = 900;
export const SKILL_Q_DASH_DISTANCE = 260;
export const SKILL_Q_WIDTH = 48;
export const SKILL_Q_DAMAGE = 100;

// —— W 旋风斩（Phase 2）——
export const SKILL_W_COOLDOWN_MS = 8000;
export const SKILL_W_RADIUS = 96;                   // 3 格 = 96px
export const SKILL_W_DAMAGE = 60;                   // 120% ATK
export const SKILL_W_CAST_MS = 300;                // 释放期间短暂定身

// —— E 影步（Phase 2）——
export const SKILL_E_COOLDOWN_MS = 6000;
export const SKILL_E_DISTANCE = 160;
export const SKILL_E_INVULN_MS = 200;              // 规避时间

// —— R 鬼神斩（Phase 3）——
export const SKILL_R_COOLDOWN_MS = 30000;
export const SKILL_R_CAST_MS = 600;                // 蓄力期间不可移动
export const SKILL_R_FAN_RADIUS = 144;              // 约 4.5 格
export const SKILL_R_FAN_ANGLE_DEG = 120;           // 120° 大扇形
export const SKILL_R_DAMAGE = 200;                  // 4× ATK

// —— 精英鬼将 Phase 3 两阶段 ——
export const ELITE_PHASE2_HP_RATIO = 0.6;           // HP<60% 变二阶段
export const ELITE_PHASE2_SPEED_BOOST = 1.3;        // 速度 ×1.3
export const ELITE_GHOSTFIRE_COOLDOWN_MS = 8000;    // 鬼火爆发 CD
export const ELITE_GHOSTFIRE_RADIUS = 128;
export const ELITE_GHOSTFIRE_DAMAGE = 30;

// —— 赤鬼（Phase 1）——
export const ONI_HP = 120;
export const ONI_SPEED = 85;
export const ONI_ATTACK_RANGE = 36;
export const ONI_ATTACK_DAMAGE = 12;
export const ONI_ATTACK_COOLDOWN_MS = 1800;
export const ONI_WINDUP_MS = 500;
export const ONI_RADIUS = 16;
export const ONI_GOLD_REWARD_MIN = 5;
export const ONI_GOLD_REWARD_MAX = 12;
export const ONI_EXP = 20;

// —— 骸骨武士（Phase 2）——
export const BONE_HP = 180;
export const BONE_SPEED = 70;
export const BONE_ATTACK_RANGE = 56;                // 前方扇形斩
export const BONE_ATTACK_DAMAGE = 18;
export const BONE_ATTACK_COOLDOWN_MS = 2200;
export const BONE_WINDUP_MS = 700;                  // 长前摇
export const BONE_RADIUS = 18;
export const BONE_GOLD_MIN = 7;
export const BONE_GOLD_MAX = 16;
export const BONE_EXP = 25;
export const BONE_FAN_ANGLE_DEG = 80;               // 扇形开口角度

// —— 怨灵（Phase 2）——
export const WRAITH_HP = 100;
export const WRAITH_SPEED = 60;
export const WRAITH_PREFERRED_DIST = 200;           // 保持这个距离
export const WRAITH_PROJECTILE_SPEED = 220;
export const WRAITH_ATTACK_DAMAGE = 10;
export const WRAITH_ATTACK_COOLDOWN_MS = 2400;
export const WRAITH_WINDUP_MS = 400;                // 聚光前摇
export const WRAITH_RADIUS = 14;
export const WRAITH_GOLD_MIN = 8;
export const WRAITH_GOLD_MAX = 15;
export const WRAITH_EXP = 25;

// —— 精英鬼将（Phase 2）——
export const ELITE_HP = 450;
export const ELITE_SPEED = 95;
export const ELITE_ATTACK_DAMAGE = 22;
export const ELITE_ATTACK_RANGE = 64;
export const ELITE_ATTACK_COOLDOWN_MS = 1500;
export const ELITE_WINDUP_MS = 600;
export const ELITE_RADIUS = 24;
export const ELITE_GOLD_MIN = 40;
export const ELITE_GOLD_MAX = 60;
export const ELITE_EXP = 100;
export const ELITE_SUMMON_AT_HP_RATIO = 0.5;       // HP<50% 召唤赤鬼
export const ELITE_SUMMON_COUNT = 2;

// —— 升级成长（Phase 2）——
export const LEVEL_UP_HP_GAIN = 40;
export const LEVEL_UP_ATK_GAIN = 5;
export const LEVEL_UP_DEF_GAIN = 1;
export const LEVEL_UP_EXP_GAIN = 1;                 // 每次升级获得技能点
export const MAX_LEVEL = 10;

// —— 经验曲线（简化版：线性累积）——
export const EXP_TO_LEVEL = (lv: number) => 100 + (lv - 1) * 150;

// —— 飘字 ——
export const DAMAGE_FLOAT_UP = -40;
export const DAMAGE_FLOAT_DURATION_MS = 600;
