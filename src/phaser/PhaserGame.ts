import Phaser from 'phaser';
import { PHASER_GAME_CONFIG } from './config/GameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { BossScene } from './scenes/BossScene.js';
import type { GameBootOptions } from './core/types.js';

/**
 * 创建并启动 Phaser.Game 实例。
 * 由 React 的 PhaserCanvas 组件在 useEffect 中调用。
 *
 * Phase 4 场景注册：Boot → Home → Battle → Boss。
 * BootScene 启动即跳 HomeScene；HomeScene 据点 F 键出征进 Battle；
 * BattleScene 区域推进到地下神社触发 BossScene；
 * BossScene 胜负皆返回 HomeScene。
 */
export function createPhaserGame(opts: GameBootOptions): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    ...PHASER_GAME_CONFIG,
    parent: opts.parentId,
    scene: [BootScene, HomeScene, BattleScene, BossScene],
  };

  const game = new Phaser.Game(config);
  return game;
}
