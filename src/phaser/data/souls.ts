/**
 * 妖魂数据（Phase 3）。
 *
 * 妖魂设计原则：**改行为，不只改数值**。
 * 挂载方式：SoulSystem 提供 hooks（onSkillCast / onPlayerAttack / defenseModifier），
 * 妖魂通过 hooks 影响技能参数或攻击行为，而不是直接修改 Entity 属性。
 */

export interface SoulItem {
  id: string;
  name: string;
  description: string;
  slot: number;        // 槽位 0/1/2
  rarity: 'rare' | 'legendary';
}

export const SOUL_DB: Record<string, SoulItem> = {
  tengu: {
    id: 'tengu', name: '天狗',
    description: '旋风斩 W 范围 +50%（96px → 144px）',
    slot: 0, rarity: 'rare',
  },
  shuten_douji: {
    id: 'shuten_douji', name: '酒吞童子',
    description: '普攻有 15% 概率吸血（伤害的 10% 回 HP）',
    slot: 1, rarity: 'legendary',
  },
  kamaitachi: {
    id: 'kamaitachi', name: '镰鼬',
    description: '影步 E 无敌时间 +100ms（200ms → 300ms）',
    slot: 2, rarity: 'rare',
  },
};

export const SOUL_POOL = ['tengu', 'shuten_douji', 'kamaitachi'];

export function rollSoul(): SoulItem {
  const id = SOUL_POOL[Math.floor(Math.random() * SOUL_POOL.length)];
  return SOUL_DB[id];
}
