import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
} from './Constants.js';

/**
 * Phaser 4 全局配置。
 * 分辨率按 16:9 固定，渲染器默认 WebGL 自动降级 Canvas。
 * Arcade Physics 作为默认物理系统。
 */
export const PHASER_GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,                        // WebGL → Canvas 自动降级
  parent: undefined,                        // 运行时由 React 挂载点注入
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a20',
  render: {
    pixelArt: false,
    antialias: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },               // 俯视角无重力
      debug: import.meta.env.DEV,            // 开发期开启物理调试（绿色碰撞体框）
    },
  },
  scene: [],                                // 场景在 PhaserGame.ts 中注册，此处留空
};
