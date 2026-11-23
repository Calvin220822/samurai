import { create } from 'zustand';

/**
 * 全局单一 store。
 * Phaser Scene 和 React 组件都直接 getState() / setState()，
 * React 组件可选择 subscribeWithSelector 做精确订阅，Phaser 侧只 poll 不订阅 re-render。
 *
 * Phase 0 只放 Phase 0 需要的字段，后续 Phase 逐步扩展。
 */

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

interface GameStoreState {
  // — 实时状态（不持久化）——
  currentScene: SceneKey | null;
  isPaused: boolean;

  // — 玩家数据 ——
  player: PlayerState;

  // — 资源 ——
  resources: ResourceState;

  // — 动作 ——
  setScene: (scene: SceneKey | null) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setPlayerHp: (hp: number) => void;
  addGold: (amount: number) => void;
  addExp: (amount: number) => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  currentScene: null,
  isPaused: false,
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
  addGold: (amount) =>
    set((s) => ({ resources: { ...s.resources, gold: s.resources.gold + amount } })),
  addExp: (amount) =>
    set((s) => ({ player: { ...s.player, exp: s.player.exp + amount } })),
}));
