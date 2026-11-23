/**
 * 单一 Zustand store。
 * Phase 1 新增：combat 运行时字段（敌人列表引用存不进 store，只存玩家/资源）。
 */

import { create } from 'zustand';

export interface PlayerState {
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
}

export interface ResourceState {
  gold: number;
  wood: number;
  iron: number;
  soulShards: number;
}

export type SceneKey = 'title' | 'home' | 'battle' | 'boss';

export type CombatResult = null | {
  victory: boolean;
  kills: number;
  goldEarned: number;
};

interface GameStoreState {
  // — 实时 —
  currentScene: SceneKey | null;
  isPaused: boolean;
  combatResult: CombatResult;

  // — 玩家数据 —
  player: PlayerState;

  // — 资源 —
  resources: ResourceState;

  // — 动作 —
  setScene: (scene: SceneKey | null) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setPlayerHp: (hp: number) => void;
  damagePlayer: (amount: number) => void;
  addGold: (amount: number) => void;
  addExp: (amount: number) => void;
  setCombatResult: (result: CombatResult) => void;
  resetForBattle: (maxHp: number) => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  currentScene: null,
  isPaused: false,
  combatResult: null,
  player: {
    hp: 500,
    maxHp: 500,
    level: 1,
    exp: 0,
  },
  resources: {
    gold: 0,
    wood: 0,
    iron: 0,
    soulShards: 0,
  },
  setScene: (scene) => set({ currentScene: scene }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
  setPaused: (paused) => set({ isPaused: paused }),
  setPlayerHp: (hp) =>
    set((s) => ({ player: { ...s.player, hp: Math.max(0, Math.min(hp, s.player.maxHp)) } })),
  damagePlayer: (amount) =>
    set((s) => ({
      player: { ...s.player, hp: Math.max(0, s.player.hp - amount) },
    })),
  addGold: (amount) =>
    set((s) => ({ resources: { ...s.resources, gold: s.resources.gold + amount } })),
  addExp: (amount) =>
    set((s) => ({ player: { ...s.player, exp: s.player.exp + amount } })),
  setCombatResult: (result) => set({ combatResult: result }),
  resetForBattle: (maxHp) =>
    set((s) => ({
      player: { ...s.player, hp: maxHp, maxHp },
      combatResult: null,
    })),
}));
