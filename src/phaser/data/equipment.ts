/**
 * 简易装备系统（Phase 2）。
 *
 * Phase 2 简化：6 个部位（武器/头盔/铠甲/护手/战靴/饰品），
 * 装备只影响基础 HP / ATK / DEF，无随机词缀，数据写死 data/equipment.ts。
 *
 * Phase 2 不实现：背包网格、属性对比 UI、出售、品质筛选。
 * 后续 Phase 3 扩展。
 */

export type SlotId = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';

export interface EquipmentItem {
  id: string;
  name: string;
  slot: SlotId;
  rarity: Rarity;
  baseHp?: number;
  baseAtk?: number;
  baseDef?: number;
}

/**
 * 6 件基础装备 + 4 件魔法，Phase 2 够用。
 * Phase 3 补齐 PRD 8.5 节全部 20 件。
 */
export const EQUIPMENT_DB: Record<string, EquipmentItem> = {
  // —— 武器 ——
  gap_sword: { id: 'gap_sword', name: '缺口打刀', slot: 'weapon', rarity: 'common', baseAtk: 8 },
  iron_tachi: { id: 'iron_tachi', name: '铁太刀', slot: 'weapon', rarity: 'magic', baseAtk: 12 },
  // —— 头盔 ——
  straw_hat: { id: 'straw_hat', name: '旧阵笠', slot: 'helmet', rarity: 'common', baseHp: 40 },
  horn_hood: { id: 'horn_hood', name: '破魔头巾', slot: 'helmet', rarity: 'magic', baseHp: 45, baseDef: 2 },
  // —— 铠甲 ——
  light_armor: { id: 'light_armor', name: '旧轻铠', slot: 'armor', rarity: 'common', baseDef: 3 },
  maple_armor: { id: 'maple_armor', name: '枫纹护甲', slot: 'armor', rarity: 'magic', baseHp: 60, baseDef: 3 },
  // —— 护手 ——
  leather_gloves: { id: 'leather_gloves', name: '皮革护手', slot: 'gloves', rarity: 'common', baseAtk: 4 },
  // —— 战靴 ——
  straw_boots: { id: 'straw_boots', name: '草履', slot: 'boots', rarity: 'common', baseHp: 15 },
  // —— 饰品 ——
  bell: { id: 'bell', name: '鬼火铃', slot: 'accessory', rarity: 'magic', baseHp: 25, baseAtk: 2 },
};

/** Phase 2 掉落池：普通怪掉 common，精英掉 magic */
export const COMMON_DROP_POOL = ['gap_sword', 'straw_hat', 'light_armor', 'leather_gloves', 'straw_boots'];
export const MAGIC_DROP_POOL = ['iron_tachi', 'horn_hood', 'maple_armor', 'bell'];

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xffffff,
  magic: 0x4aa3ff,
  rare: 0xffcc33,
  legendary: 0xff8833,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '普通',
  magic: '魔法',
  rare: '稀有',
  legendary: '传奇',
};

export const SLOT_LABEL: Record<SlotId, string> = {
  weapon: '武器',
  helmet: '头盔',
  armor: '铠甲',
  gloves: '护手',
  boots: '战靴',
  accessory: '饰品',
};

/** 从池中随机选一件 */
export function rollFromPool(pool: string[]): EquipmentItem {
  const id = pool[Math.floor(Math.random() * pool.length)];
  return EQUIPMENT_DB[id];
}
