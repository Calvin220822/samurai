/**
 * 单一 Zustand store。
 * Phase 2 扩展：skillPoints / 装备槽 / 基础 ATK / DEF。
 * 敌人列表、战斗事件等运行时引用不进 store，只存玩家可持久化字段。
 */

import { create } from 'zustand';
import type { SlotId } from '@/phaser/data/equipment.js';

export interface PlayerState {
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  skillPoints: number;
  baseAtk: number;          // 从 50 起，每级 +5
  baseDef: number;           // 从 10 起，每级 +1
}

export interface ResourceState {
  gold: number;
  wood: number;
  iron: number;
  soulShards: number;
}

export type SceneKey = 'title' | 'home' | 'battle' | 'boss';
export type EquipmentSlots = Record<SlotId, string | null>;

export type CombatResult = null | {
  victory: boolean;
  kills: number;
  goldEarned: number;
};

interface GameStoreState {
  currentScene: SceneKey | null;
  isPaused: boolean;
  combatResult: CombatResult;

  player: PlayerState;
  resources: ResourceState;
  equipment: EquipmentSlots;

  // —— Actions ——
  setScene: (scene: SceneKey | null) => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
  damagePlayer: (amount: number) => void;
  addGold: (amount: number) => void;
  addExp: (amount: number) => void;
  setCombatResult: (result: CombatResult) => void;
  equipItem: (slot: SlotId, itemId: string | null) => void;
  resetForBattle: () => void;

  // —— 派生：有效 ATK / DEF ——
  getEffectiveAtk: () => number;
  getEffectiveDef: () => number;
}

const initPlayer: PlayerState = {
  hp: 500, maxHp: 500,
  level: 1, exp: 0,
  skillPoints: 0,
  baseAtk: 50, baseDef: 10,
};

const initEquipment: EquipmentSlots = {
  weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null,
};

export const useGameStore = create<GameStoreState>((set, get) => ({
  currentScene: null,
  isPaused: false,
  combatResult: null,

  player: { ...initPlayer },
  resources: { gold: 0, wood: 0, iron: 0, soulShards: 0 },
  equipment: { ...initEquipment },

  setScene: (scene) => set({ currentScene: scene }),
  setPaused: (paused) => set({ isPaused: paused }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  damagePlayer: (amount) =>
    set((s) => ({
      player: { ...s.player, hp: Math.max(0, s.player.hp - amount) },
    })),

  addGold: (amount) =>
    set((s) => ({ resources: { ...s.resources, gold: s.resources.gold + amount } })),

  addExp: (amount) =>
    set((s) => ({ player: { ...s.player, exp: s.player.exp + amount } })),

  setCombatResult: (result) => set({ combatResult: result }),

  equipItem: (slot, itemId) =>
    set((s) => ({ equipment: { ...s.equipment, [slot]: itemId } })),

  resetForBattle: () =>
    set((s) => ({
      player: { ...s.player, hp: s.player.maxHp },
      combatResult: null,
    })),

  getEffectiveAtk: () => {
    const { player, equipment } = get();
    let atk = player.baseAtk;
    for (const id of Object.values(equipment)) {
      if (!id) continue;
      const e = (globalThis as any).__equipmentDB?.[id];
      if (e?.baseAtk) atk += e.baseAtk;
    }
    return atk;
  },

  getEffectiveDef: () => {
    const { player, equipment } = get();
    let def = player.baseDef;
    for (const id of Object.values(equipment)) {
      if (!id) continue;
      const e = (globalThis as any).__equipmentDB?.[id];
      if (e?.baseDef) def += e.baseDef;
    }
    return def;
  },
}));

// 让 store 能 import EQUIPMENT_DB 但避免循环依赖：这里用显式赋值
import { EQUIPMENT_DB } from '@/phaser/data/equipment.js';
(globalThis as any).__equipmentDB = EQUIPMENT_DB;

/** 装备后，玩家 HP / ATK / DEF 自动更新 —— 由 LevelSystem 和 BattleScene 监听 */
export function applyEquipmentStatDelta(_slot: SlotId, oldId: string | null, newId: string | null): void {
  const store = useGameStore.getState();
  const { player } = store;
  let hpDelta = 0, atkDelta = 0, defDelta = 0;
  if (oldId) {
    const old = EQUIPMENT_DB[oldId];
    if (old?.baseHp) hpDelta -= old.baseHp;
    if (old?.baseAtk) atkDelta -= old.baseAtk;
    if (old?.baseDef) defDelta -= old.baseDef;
  }
  if (newId) {
    const nw = EQUIPMENT_DB[newId];
    if (nw?.baseHp) hpDelta += nw.baseHp;
    if (nw?.baseAtk) atkDelta += nw.baseAtk;
    if (nw?.baseDef) defDelta += nw.baseDef;
  }
  // 先重置 baseAtk/baseDef 为 level 原始值，然后全部装备累加
  const level = player.level;
  const newBaseAtk = 50 + (level - 1) * 5;
  const newBaseDef = 10 + (level - 1) * 1;
  const newMaxHp = 500 + (level - 1) * 40;
  useGameStore.setState((s) => ({
    player: {
      ...s.player,
      baseAtk: newBaseAtk,
      baseDef: newBaseDef,
      maxHp: newMaxHp,
      hp: Math.min(newMaxHp, Math.max(1, s.player.hp + hpDelta)),
    },
  }));
  void atkDelta; void defDelta;
}
