import Phaser from 'phaser';
import { PHASER_GAME_CONFIG } from './config/GameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import type { GameBootOptions } from './core/types.js';

/**
 * 创建并启动 Phaser.Game 实例。
 * 由 React 的 PhaserCanvas 组件在 useEffect 中调用。
 *
 * 场景注册顺序：Boot → Battle（Phase 0 暂只这两个）。
 * BootScene 完成基础初始化后自动切换到 BattleScene。
 */
export function createPhaserGame(opts: GameBootOptions): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    ...PHASER_GAME_CONFIG,
    parent: opts.parentId,
    scene: [BootScene, BattleScene],
  };

  const game = new Phaser.Game(config);
  return game;
}
