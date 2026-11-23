import Phaser from 'phaser';
import { Enemy } from './Enemy.js';
import {
  ONI_COLOR,
  ONI_HP,
  ONI_SPEED,
  ONI_RADIUS,
  ONI_WINDUP_MS,
  ONI_ATTACK_DAMAGE,
  ONI_ATTACK_RANGE,
  ONI_ATTACK_COOLDOWN_MS,
  ONI_GOLD_REWARD_MAX,
  ONI_GOLD_REWARD_MIN,
} from '../../config/Constants.js';

/**
 * 赤鬼 Enemy（Phase 1）。
 *
 * 视觉占位：
 * - 红色圆身体 + 两个短角 + 钝器（小斧）
 * - WINDUP 状态时斧抬到头顶，明显前摇视觉预警
 * - HIT 状态时身体临时改为亮红闪一下
 */
export class RedOni extends Enemy {
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private axeGfx!: Phaser.GameObjects.Graphics;
  private hornsGfx!: Phaser.GameObjects.Graphics;
  private hurtFlashActive = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setStats({
      maxHp: ONI_HP,
      speed: ONI_SPEED,
      radius: ONI_RADIUS,
      windupMs: ONI_WINDUP_MS,
      attackDamage: ONI_ATTACK_DAMAGE,
      attackRange: ONI_ATTACK_RANGE,
      attackCooldownMs: ONI_ATTACK_COOLDOWN_MS,
      goldMin: ONI_GOLD_REWARD_MIN,
      goldMax: ONI_GOLD_REWARD_MAX,
    });
    this.createGraphics();
  }

  private createGraphics(): void {
    this.bodyGfx = this.scene.add.graphics();
    this.drawBody(false);
    this.add(this.bodyGfx);

    this.hornsGfx = this.scene.add.graphics();
    this.hornsGfx.fillStyle(0x1a1a1a, 1);
    this.hornsGfx.fillTriangle(-10, -ONI_RADIUS, -4, -ONI_RADIUS - 10, -7, -ONI_RADIUS - 2);
    this.hornsGfx.fillTriangle(10, -ONI_RADIUS, 4, -ONI_RADIUS - 10, 7, -ONI_RADIUS - 2);
    this.add(this.hornsGfx);

    this.axeGfx = this.scene.add.graphics();
    this.drawAxe(false);
    this.add(this.axeGfx);
  }

  private drawBody(hurtFlash: boolean): void {
    this.bodyGfx.clear();
    const c = hurtFlash ? 0xff6666 : ONI_COLOR;
    this.bodyGfx.fillStyle(c, 1);
    this.bodyGfx.fillCircle(0, 0, ONI_RADIUS);
  }

  private drawAxe(windup: boolean): void {
    this.axeGfx.clear();
    this.axeGfx.fillStyle(0x333333, 1);
    this.axeGfx.lineStyle(2, 0xaaaaaa, 1);
    if (windup) {
      this.axeGfx.fillRoundedRect(-6, -ONI_RADIUS - 20, 12, 22, 2);
      this.axeGfx.fillTriangle(-16, -ONI_RADIUS - 20, 16, -ONI_RADIUS - 20, 0, -ONI_RADIUS - 32);
    } else {
      this.axeGfx.fillRoundedRect(8, 2, 10, 18, 2);
      this.axeGfx.fillTriangle(4, 2, 18, 2, 11, -6);
    }
  }

  protected onWindupStart(): void { this.drawAxe(true); }
  protected onAttack(): void { this.drawAxe(false); }

  protected onHit(): void {
    this.hurtFlashActive = true;
    this.drawBody(true);
    this.scene.time.delayedCall(130, () => {
      if (this.hurtFlashActive) { this.drawBody(false); this.hurtFlashActive = false; }
    });
  }

  protected onDead(): void { /* drop 由 BattleScene 处理 */ }

  update(time: number, deltaMs: number, playerX: number, playerY: number): void {
    super.update(time, deltaMs, playerX, playerY);
  }
}
