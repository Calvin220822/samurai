import Phaser from 'phaser';
import { initAutoSave, loadGame, hasSave } from '../systems/SaveSystem.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/Constants.js';

/**
 * 启动 Scene：读取存档 → 注册自动存档 → 进入据点。
 * 无存档时使用全新进度。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b10');
    const tip = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '正在读取存档…', {
      fontSize: '18px', color: '#888899',
    }).setOrigin(0.5);

    void (async () => {
      const saveExists = await hasSave();
      if (saveExists) await loadGame();
      initAutoSave();
      tip.setText(saveExists ? '存档已载入' : '新的一夜');
      this.time.delayedCall(300, () => this.scene.start('HomeScene'));
    })();
  }
}
