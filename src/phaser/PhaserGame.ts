import Phaser from 'phaser';
import { PHASER_GAME_CONFIG } from './config/GameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { BossScene } from './scenes/BossScene.js';
import { setGameInstance } from './gameInstance.js';
import type { GameBootOptions } from './core/types.js';

/**
 * 创建并启动 Phaser.Game 实例（React PhaserCanvas 在 useEffect 中调用）。
 * 场景：Boot → Home → Battle → Boss。
 */
export function createPhaserGame(opts: GameBootOptions): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    ...PHASER_GAME_CONFIG,
    parent: opts.parentId,
    scene: [BootScene, HomeScene, BattleScene, BossScene],
  };

  const game = new Phaser.Game(config);
  setGameInstance(game);
  return game;
}
