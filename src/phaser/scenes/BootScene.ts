import Phaser from 'phaser';
/**
 * 启动 Scene：注册全局事件、切换到第一个可玩场景。
 * Phase 4：启动跳 HomeScene（据点道场），战斗由据点出征进入。
 * Phase 0–3 曾直跳 BattleScene，已废弃。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scene.start('HomeScene');
  }
}
