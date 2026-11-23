/**
 * 跨系统共享常量。
 * 集中维护，便于数值调优时只改一处。
 */

// —— 游戏视口 ——
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const TILE_SIZE = 32;

// —— 玩家武士 ——
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED = 240;          // px / s
export const PLAYER_START_HP = 500;
export const PLAYER_COLOR = 0x3a3a42;      // 深灰和服
export const PLAYER_ACCENT = 0xf5f5dc;     // 象牙白（斗笠/太刀）
export const PLAYER_SWORD_COLOR = 0xe5e5f0;

// —— 世界 ——
export const WORLD_BG = 0x1a1a20;          // 深色背景
export const WALL_COLOR = 0x5a5a64;
export const GROUND_COLOR = 0x2a2a32;
export const GRID_COLOR = 0x32323c;

// —— 敌人占位符 ——
export const ONI_COLOR = 0xcc3322;         // 赤鬼红
export const BONE_COLOR = 0xc8c0b8;        // 骸骨灰
export const WRAITH_COLOR = 0x6ab0ff;      // 怨灵蓝

// —— 输入 ——
export const PLAYER_ATTACK_RANGE = 72;     // 普攻距离（px），占位阶段
