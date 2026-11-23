import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_COLOR,
  GROUND_COLOR,
  TILE_SIZE,
  WALL_COLOR,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { useGameStore } from '@/store/gameStore.js';

/**
 * 战斗场景占位版（Phase 0）。
 * 目的：跑通 Phaser 世界 + 俯视角移动 + 墙体碰撞 + 敌人占位符的核心循环。
 *
 * 场景构成：
 * - 地面网格背景（Graphics 程序化绘制）
 * - 四周墙壁 + 中间障碍物（Arcade Physics static group）
 * - 武士主角（方向键可移动，撞墙停止）
 * - 左上 HP / 等级 HUD，右上操作提示
 */
export class BattleScene extends Phaser.Scene {
  private player!: Player;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private hpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    useGameStore.getState().setScene('battle');
    this.drawGround();
    this.buildWalls();
    this.spawnPlayer();
    this.createHUD();
  }

  update(time: number, delta: number): void {
    this.player.update(time, delta);
    this.refreshHUD();
  }

  // ——————————————— 场景搭建 ———————————————

  private drawGround(): void {
    const g = this.add.graphics();
    g.fillStyle(GROUND_COLOR, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    g.lineStyle(1, GRID_COLOR, 0.5);
    for (let x = 0; x <= GAME_WIDTH; x += TILE_SIZE) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += TILE_SIZE) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }
  }

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();

    // [x, y, w, h]，以左上角为锚点
    const W = GAME_WIDTH, H = GAME_HEIGHT, T = TILE_SIZE;
    const wallRects: [number, number, number, number][] = [
      [0, 0, W, T],               // 上
      [0, H - T, W, T],           // 下
      [0, 0, T, H],               // 左
      [W - T, 0, T, H],           // 右
      // 中间障碍
      [280, 200, T * 3, T * 2],
      [720, 360, T * 4, T * 3],
      // 左下角 L 形
      [200, 540, T * 5, T],
      [200, 540, T, T * 3],
      // 右下角小方块
      [1000, 560, T * 2, T * 2],
    ];

    for (const [x, y, w, h] of wallRects) {
      const rect = this.add.rectangle(
        x + w / 2, y + h / 2, w, h,
        WALL_COLOR, 1
      );
      rect.setStrokeStyle(2, 0x808090, 1);
      this.physics.add.existing(rect, true);  // static = true
      this.walls.add(rect);
    }
  }

  private spawnPlayer(): void {
    this.player = new Player(this, 160, 160);
    this.physics.add.collider(this.player, this.walls);
  }

  private createHUD(): void {
    // 左上：HP + 等级
    this.hpText = this.add.text(24, 20, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e5e5e5',
    }).setScrollFactor(0).setDepth(100);

    this.levelText = this.add.text(24, 44, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9aa0a6',
    }).setScrollFactor(0).setDepth(100);

    // 右上：操作提示
    this.add.text(GAME_WIDTH - 360, 20,
      '[ WASD / 方向键 ] 移动\n撞墙停止 · 测试俯视角手感',
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9aa0a6',
        align: 'right',
      }
    ).setScrollFactor(0).setDepth(100);

    // 底部中央：当前阶段
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 32,
      'Phase 0 · 技术原型：武士 + 俯视角移动 + 墙体碰撞',
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#6a6a72',
      }
    ).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100);
  }

  private refreshHUD(): void {
    const { hp, maxHp, level } = useGameStore.getState().player;
    this.hpText.setText(`HP ${hp} / ${maxHp}`);
    this.levelText.setText(`Lv.${level}`);
  }
}
