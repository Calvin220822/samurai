/**
 * 单一 Zustand store。
 * Phase 5：存档字段（强化 / 技能升级 / 妖魂）+ React UI 面板状态 + 派生属性统一计算。
 *
 * 原则：敌人列表、战斗事件等运行时引用不进 store，只存玩家可持久化字段。
 */

import { create } from 'zustand';
import { EQUIPMENT_DB, type SlotId } from '@/phaser/data/equipment.js';
import {
  EXP_TO_LEVEL, LEVEL_UP_ATK_GAIN, LEVEL_UP_DEF_GAIN, LEVEL_UP_HP_GAIN, PLAYER_START_HP,
} from '@/phaser/config/Constants.js';

export type SkillId = 'Q' | 'W' | 'E' | 'R';
export type UiPanel = 'none' | 'character' | 'build' | 'shrine';

export interface PlayerState {
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  levelExp: number;
  skillPoints: number;
  baseAtk: number;
  baseDef: number;
  bonusMaxHp: number;      // 神龛祈祷累积的额外最大 HP
}

export interface ResourceState {
  gold: number;
  wood: number;
  iron: number;
  soulShards: number;
}

export type SceneKey = 'BootScene' | 'HomeScene' | 'BattleScene' | 'BossScene';
export type EquipmentSlots = Record<SlotId, string | null>;
export type Enhancements = Record<SlotId, number>;
export type SkillUpgrade = { a: number; b: number };
export type SkillUpgrades = Record<SkillId, SkillUpgrade>;

export type CombatResult = null | {
  victory: boolean;
  kills: number;
  goldEarned: number;
};

export interface SpendResourcesInput {
  gold?: number;
  wood?: number;
  iron?: number;
  soulShards?: number;
}

export interface SavePayload {
  version: number;
  savedAt: number;
  player: PlayerState;
  resources: ResourceState;
  equipment: EquipmentSlots;
  souls: string[];
  areaIndex: number;
  maxAreaCleared: number;
  enhancements: Enhancements;
  skillUpgrades: SkillUpgrades;
}

export const MAX_ENHANCE_LEVEL = 5;
export const MAX_SKILL_LEVEL = 3;

export function enhanceCost(level: number): { gold: number; iron: number } {
  return { gold: 60 + level * 40, iron: 5 + level * 3 };
}

interface GameStoreState {
  currentScene: SceneKey | null;
  isPaused: boolean;
  uiPanel: UiPanel;
  combatResult: CombatResult;

  player: PlayerState;
  resources: ResourceState;
  equipment: EquipmentSlots;
  souls: string[];
  enhancements: Enhancements;
  skillUpgrades: SkillUpgrades;

  areaIndex: number;
  maxAreaCleared: number;
  bossDefeated: boolean;

  // —— Actions ——
  setScene: (scene: SceneKey | null) => void;
  setPaused: (paused: boolean) => void;
  setUiPanel: (panel: UiPanel) => void;
  setPlayerHp: (hp: number) => void;
  damagePlayer: (amount: number) => void;
  addGold: (amount: number) => void;
  addExp: (amount: number) => void;
  setCombatResult: (result: CombatResult) => void;
  equipItem: (slot: SlotId, itemId: string | null) => void;
  resetCombat: () => void;
  restAtHome: () => void;
  setAreaIndex: (idx: number) => void;
  spendResources: (delta: SpendResourcesInput) => void;
  grantSkillPoint: () => void;
  prayMaxHp: () => void;
  addSoulShards: (n: number) => void;
  setSouls: (souls: string[]) => void;
  enhanceSlot: (slot: SlotId) => boolean;
  upgradeSkill: (skill: SkillId, branch: 'a' | 'b') => boolean;
  recomputeDerivedStats: () => void;
  setBossDefeated: (v: boolean) => void;
  hydrate: (data: SavePayload) => void;
  toSavePayload: () => SavePayload;

  // —— 派生 ——
  getEffectiveAtk: () => number;
  getEffectiveDef: () => number;
  isUiOpen: () => boolean;
  skillMods: (skill: SkillId) => { a: number; b: number };
}

const initPlayer: PlayerState = {
  hp: PLAYER_START_HP, maxHp: PLAYER_START_HP,
  level: 1, exp: 0, levelExp: EXP_TO_LEVEL(1),
  skillPoints: 0,
  baseAtk: 50, baseDef: 10,
  bonusMaxHp: 0,
};

const initEquipment: EquipmentSlots = {
  weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null,
};

const initEnhancements: Enhancements = {
  weapon: 0, helmet: 0, armor: 0, gloves: 0, boots: 0, accessory: 0,
};

const initSkillUpgrades: SkillUpgrades = {
  Q: { a: 0, b: 0 }, W: { a: 0, b: 0 }, E: { a: 0, b: 0 }, R: { a: 0, b: 0 },
};

export const useGameStore = create<GameStoreState>((set, get) => ({
  currentScene: null,
  isPaused: false,
  uiPanel: 'none',
  combatResult: null,

  player: { ...initPlayer },
  resources: { gold: 200, wood: 30, iron: 10, soulShards: 5 },
  equipment: { ...initEquipment },
  souls: [],
  enhancements: { ...initEnhancements },
  skillUpgrades: {
    Q: { ...initSkillUpgrades.Q }, W: { ...initSkillUpgrades.W },
    E: { ...initSkillUpgrades.E }, R: { ...initSkillUpgrades.R },
  },

  areaIndex: 0,
  maxAreaCleared: 0,
  bossDefeated: false,

  setScene: (scene) => set({ currentScene: scene }),
  setPaused: (paused) => set({ isPaused: paused }),
  setUiPanel: (panel) => set({ uiPanel: panel }),

  setPlayerHp: (hp) =>
    set((s) => ({ player: { ...s.player, hp: Math.max(0, Math.min(hp, s.player.maxHp)) } })),

  damagePlayer: (amount) =>
    set((s) => ({ player: { ...s.player, hp: Math.max(0, s.player.hp - amount) } })),

  addGold: (amount) =>
    set((s) => ({ resources: { ...s.resources, gold: s.resources.gold + amount } })),

  addExp: (amount) =>
    set((s) => ({ player: { ...s.player, exp: s.player.exp + amount } })),

  setCombatResult: (result) => set({ combatResult: result }),

  equipItem: (slot, itemId) => {
    set((s) => ({ equipment: { ...s.equipment, [slot]: itemId } }));
    get().recomputeDerivedStats();
  },

  /** 进入战斗场景时清理上一场结果，不回血 */
  resetCombat: () => set({ combatResult: null }),

  /** 据点休息：回满 HP */
  restAtHome: () =>
    set((s) => ({ player: { ...s.player, hp: s.player.maxHp }, combatResult: null })),

  setAreaIndex: (idx) =>
    set((s) => ({ areaIndex: idx, maxAreaCleared: Math.max(s.maxAreaCleared, idx) })),

  spendResources: (delta) =>
    set((s) => ({
      resources: {
        gold: Math.max(0, s.resources.gold - (delta.gold ?? 0)),
        wood: Math.max(0, s.resources.wood - (delta.wood ?? 0)),
        iron: Math.max(0, s.resources.iron - (delta.iron ?? 0)),
        soulShards: Math.max(0, s.resources.soulShards - (delta.soulShards ?? 0)),
      },
    })),

  grantSkillPoint: () =>
    set((s) => ({ player: { ...s.player, skillPoints: s.player.skillPoints + 1 } })),

  prayMaxHp: () => {
    set((s) => ({ player: { ...s.player, bonusMaxHp: s.player.bonusMaxHp + 20 } }));
    get().recomputeDerivedStats();
  },

  addSoulShards: (n) =>
    set((s) => ({ resources: { ...s.resources, soulShards: s.resources.soulShards + n } })),

  setSouls: (souls) => set({ souls }),

  enhanceSlot: (slot) => {
    const s = get();
    const level = s.enhancements[slot];
    if (!s.equipment[slot] || level >= MAX_ENHANCE_LEVEL) return false;
    const cost = enhanceCost(level);
    if (s.resources.gold < cost.gold || s.resources.iron < cost.iron) return false;
    set((st) => ({
      resources: {
        ...st.resources,
        gold: st.resources.gold - cost.gold,
        iron: st.resources.iron - cost.iron,
      },
      enhancements: { ...st.enhancements, [slot]: level + 1 },
    }));
    get().recomputeDerivedStats();
    return true;
  },

  upgradeSkill: (skill, branch) => {
    const s = get();
    if (s.player.skillPoints <= 0) return false;
    const cur = s.skillUpgrades[skill];
    if (cur[branch] >= MAX_SKILL_LEVEL) return false;
    set((st) => ({
      player: { ...st.player, skillPoints: st.player.skillPoints - 1 },
      skillUpgrades: {
        ...st.skillUpgrades,
        [skill]: { ...st.skillUpgrades[skill], [branch]: cur[branch] + 1 },
      },
    }));
    return true;
  },

  recomputeDerivedStats: () => {
    const { player, equipment } = get();
    let hpBonus = 0;
    for (const id of Object.values(equipment)) {
      if (!id) continue;
      const item = EQUIPMENT_DB[id];
      if (item?.baseHp) hpBonus += item.baseHp;
    }
    const maxHp = PLAYER_START_HP + LEVEL_UP_HP_GAIN * (player.level - 1) + player.bonusMaxHp + hpBonus;
    set((s) => ({
      player: {
        ...s.player,
        maxHp,
        hp: Math.min(maxHp, Math.max(1, s.player.hp)),
        baseAtk: 50 + LEVEL_UP_ATK_GAIN * (s.player.level - 1),
        baseDef: 10 + LEVEL_UP_DEF_GAIN * (s.player.level - 1),
        levelExp: EXP_TO_LEVEL(s.player.level),
      },
    }));
  },

  setBossDefeated: (v) => set({ bossDefeated: v }),

  hydrate: (data) => {
    set({
      player: { ...initPlayer, ...data.player },
      resources: { ...data.resources },
      equipment: { ...initEquipment, ...data.equipment },
      souls: [...(data.souls ?? [])],
      enhancements: { ...initEnhancements, ...data.enhancements },
      skillUpgrades: {
        Q: { ...initSkillUpgrades.Q, ...data.skillUpgrades?.Q },
        W: { ...initSkillUpgrades.W, ...data.skillUpgrades?.W },
        E: { ...initSkillUpgrades.E, ...data.skillUpgrades?.E },
        R: { ...initSkillUpgrades.R, ...data.skillUpgrades?.R },
      },
      areaIndex: data.areaIndex ?? 0,
      maxAreaCleared: data.maxAreaCleared ?? 0,
    });
    get().recomputeDerivedStats();
  },

  toSavePayload: () => {
    const s = get();
    return {
      version: 1,
      savedAt: Date.now(),
      player: { ...s.player },
      resources: { ...s.resources },
      equipment: { ...s.equipment },
      souls: [...s.souls],
      areaIndex: s.areaIndex,
      maxAreaCleared: s.maxAreaCleared,
      enhancements: { ...s.enhancements },
      skillUpgrades: {
        Q: { ...s.skillUpgrades.Q }, W: { ...s.skillUpgrades.W },
        E: { ...s.skillUpgrades.E }, R: { ...s.skillUpgrades.R },
      },
    };
  },

  getEffectiveAtk: () => {
    const { player, equipment, enhancements } = get();
    let atk = player.baseAtk;
    for (const [slot, id] of Object.entries(equipment)) {
      if (!id) continue;
      const item = EQUIPMENT_DB[id];
      if (item?.baseAtk) atk += item.baseAtk;
      atk += (enhancements[slot as SlotId] ?? 0) * 2;
    }
    return atk;
  },

  getEffectiveDef: () => {
    const { player, equipment, enhancements } = get();
    let def = player.baseDef;
    for (const [slot, id] of Object.entries(equipment)) {
      if (!id) continue;
      const item = EQUIPMENT_DB[id];
      if (item?.baseDef) def += item.baseDef;
      def += (enhancements[slot as SlotId] ?? 0) * 2;
    }
    return def;
  },

  isUiOpen: () => get().uiPanel !== 'none',

  skillMods: (skill) => {
    const u = get().skillUpgrades[skill];
    return { a: u.a, b: u.b };
  },
}));

/** Phaser 代码侧（非 React 组件）读取 store 的便捷函数 */
export function getGameStore() {
  return useGameStore.getState();
}
