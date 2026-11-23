import Phaser from 'phaser';
import {
  PLAYER_ACCENT,
  PLAYER_COLOR,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SWORD_COLOR,
} from '../config/Constants.js';
import { EVT, EventBus } from '../core/EventBus.js';
import { useGameStore } from '@/store/gameStore.js';

/**
 * 武士主角（Phase 0）。
 *
 * 继承 Phaser.GameObjects.Container（原生 GameObject，可被 Scene.add.existing 直接管理），
 * 用 physics.add.existing(this) 手动挂 Arcade Physics 圆形碰撞体。
 *
 * 内部结构：
 *   Container (锚点 0,0)
 *     └─ Graphics bodyGraphics  — 程序化绘制的武士方块
 *
 * 正式美术到位后：bodyGraphics 换成 Sprite('samurai_idle')，其余 API 保持不变。
 */
export class Player extends Phaser.GameObjects.Container {
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private facing: 'left' | 'right' = 'right';
  private inputKeys: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    upArrow: Phaser.Input.Keyboard.Key;
    downArrow: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key;
    rightArrow: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    // —— 给 Container 挂 Arcade Physics 圆形碰撞体 ——
    scene.physics.add.existing(this, false);         // false = 动态体
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS);
    body.setOffset(-PLAYER_RADIUS, -PLAYER_RADIUS);  // 锚点对齐中心
    body.setCollideWorldBounds(true);

    // —— 程序化绘制身体 ——
    this.bodyGraphics = scene.add.graphics();
    this.createGraphicsBody();
    this.add(this.bodyGraphics);                      // 加到 Container children

    // —— 输入：WASD + 方向键，全部用 Key 实例 ——
    const kb = scene.input.keyboard!;
    this.inputKeys = {
      up: kb.addKey('W'),
      down: kb.addKey('S'),
      left: kb.addKey('A'),
      right: kb.addKey('D'),
      upArrow: kb.addKey('UP'),
      downArrow: kb.addKey('DOWN'),
      leftArrow: kb.addKey('LEFT'),
      rightArrow: kb.addKey('RIGHT'),
    };

    EventBus.emit(EVT.PLAYER_SPAWNED, this);
  }

  private createGraphicsBody(): void {
    // 身体：深灰圆角矩形（和服）
    this.bodyGraphics.fillStyle(PLAYER_COLOR, 1);
    this.bodyGraphics.fillRoundedRect(-14, -22, 28, 44, 6);

    // 斗笠：白色三角形（上尖下宽）
    this.bodyGraphics.fillStyle(PLAYER_ACCENT, 1);
    this.bodyGraphics.fillTriangle(-14, -22, 14, -22, 0, -36);

    // 斗笠横带
    this.bodyGraphics.fillStyle(0x888888, 1);
    this.bodyGraphics.fillRoundedRect(-16, -24, 32, 4, 2);

    // 太刀（腰间，朝右）
    this.bodyGraphics.lineStyle(3, PLAYER_SWORD_COLOR, 1);
    this.bodyGraphics.lineBetween(10, 0, 26, -2);
  }

  /** 每帧由 Scene.update() 调用 */
  update(_time: number, _deltaMs: number): void {
    const K = this.inputKeys;
    const left = K.left.isDown || K.leftArrow.isDown;
    const right = K.right.isDown || K.rightArrow.isDown;
    const up = K.up.isDown || K.upArrow.isDown;
    const down = K.down.isDown || K.downArrow.isDown;

    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);

    // 斜向速度归一化
    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(dx * PLAYER_SPEED, dy * PLAYER_SPEED);

    // 朝向翻转
    if (dx < 0) this.face('left');
    else if (dx > 0) this.face('right');

    if (dx !== 0 || dy !== 0) {
      EventBus.emit(EVT.PLAYER_MOVE, { x: this.x, y: this.y });
    }

    // HP 归零 → 死亡
    const hp = useGameStore.getState().player.hp;
    if (hp <= 0) this.die();
  }

  private face(dir: 'left' | 'right'): void {
    if (this.facing === dir) return;
    this.facing = dir;
    this.bodyGraphics.setScale(dir === 'right' ? 1 : -1, 1);
  }

  getFacing(): 'left' | 'right' {
    return this.facing;
  }

  private die(): void {
    EventBus.emit(EVT.PLAYER_DEAD, this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => this.destroy(),
    });
  }
}
