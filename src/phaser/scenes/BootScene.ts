import Phaser from 'phaser';
/**
 * 启动 Scene：注册全局事件、切换到第一个可玩场景。
 * Phase 0 无 Preload（全部用 Graphics 占位符），直接跳 BattleScene。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Phase 0 可以在这里做 Texture 占位符生成（Graphics → generateTexture），
    // 让后续场景用 add.sprite() 而不是每帧重绘 Graphics。
    // 但为了先跑通流程，直接跳 BattleScene。
    this.scene.start('BattleScene');
  }
}
