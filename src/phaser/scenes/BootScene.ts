import Phaser from 'phaser';
import { initAutoSave, loadGame, hasSave } from '../systems/SaveSystem.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/Constants.js';

/**
 * 启动 Scene：加载美术资源 → 读取存档 → 注册自动存档 → 进入据点。
 * 无存档时使用全新进度。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const L = this.load;
    // 角色动画精灵表（每帧 128×128）
    L.spritesheet('player_idle', 'assets/player_idle.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_walk', 'assets/player_walk.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_attack', 'assets/player_attack.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_q', 'assets/player_q.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_r', 'assets/player_r.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_w', 'assets/player_w.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_hit', 'assets/player_hit.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('player_death', 'assets/player_death.png', { frameWidth: 128, frameHeight: 128 });

    // 立绘
    L.image('portrait', 'assets/portrait_0.png');

    // 地图瓦片与道具
    for (const key of ['tile_dirt', 'tile_grass', 'tile_stone', 'tile_dark']) {
      L.image(key, `assets/${key}.png`);
    }
    for (const key of ['prop_hut', 'prop_shop', 'prop_torii', 'prop_shrine', 'prop_lantern', 'prop_jizo', 'prop_well']) {
      L.image(key, `assets/${key}.png`);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b10');
    this.registerPlayerAnimations();

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

  /** 注册角色动画：down / up / side（side 原画面朝左，向右移动时水平翻转） */
  private registerPlayerAnimations(): void {
    const A = this.anims;
    const mk = (key: string, texture: string, start: number, end: number, frameRate: number, repeat = -1) => {
      if (A.exists(key)) return;
      A.create({ key, frames: A.generateFrameNumbers(texture, { start, end }), frameRate, repeat });
    };

    // idle：4 列 × 4 行
    mk('idle-down', 'player_idle', 0, 3, 6);
    mk('idle-up', 'player_idle', 4, 7, 6);
    mk('idle-side', 'player_idle', 8, 11, 6);

    // walk：8 列 × 4 行
    mk('walk-down', 'player_walk', 0, 7, 10);
    mk('walk-up', 'player_walk', 8, 15, 10);
    mk('walk-side', 'player_walk', 16, 23, 10);

    // attack：3 列 × 4 行（行序：下/左/右/上）
    mk('attack-down', 'player_attack', 0, 2, 10, 0);
    mk('attack-side', 'player_attack', 3, 5, 10, 0);
    mk('attack-up', 'player_attack', 9, 11, 10, 0);

    // 居合斩 Q：4 列 × 4 行
    mk('q-down', 'player_q', 0, 3, 14, 0);
    mk('q-side', 'player_q', 4, 7, 14, 0);
    mk('q-up', 'player_q', 12, 15, 14, 0);

    // 鬼神斩 R：5 列 × 4 行
    mk('r-down', 'player_r', 0, 4, 12, 0);
    mk('r-side', 'player_r', 5, 9, 12, 0);
    mk('r-up', 'player_r', 15, 19, 12, 0);

    // 旋风斩 W / 受击 / 死亡（单方向）
    mk('w', 'player_w', 0, 3, 14, 0);
    mk('hit', 'player_hit', 0, 1, 10, 0);
    mk('death', 'player_death', 0, 3, 8, 0);
  }
}
