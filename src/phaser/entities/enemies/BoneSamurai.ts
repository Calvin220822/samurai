import Phaser from 'phaser';
import { Enemy } from './Enemy.js';
import {
  BONE_ATTACK_COOLDOWN_MS, BONE_ATTACK_DAMAGE, BONE_ATTACK_RANGE,
  BONE_GOLD_MAX, BONE_GOLD_MIN,
  BONE_HP, BONE_RADIUS, BONE_SPEED, BONE_WINDUP_MS, BONE_COLOR,
} from '../../config/Constants.js';

export class BoneSamurai extends Enemy {
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private swordGfx!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setStats({
      maxHp: BONE_HP, speed: BONE_SPEED, radius: BONE_RADIUS,
      windupMs: BONE_WINDUP_MS, attackDamage: BONE_ATTACK_DAMAGE,
      attackRange: BONE_ATTACK_RANGE, attackCooldownMs: BONE_ATTACK_COOLDOWN_MS,
      goldMin: BONE_GOLD_MIN, goldMax: BONE_GOLD_MAX,
    });
    this.createGraphics();
  }

  private createGraphics(): void {
    this.bodyGfx = this.scene.add.graphics();
    this.drawBody(false);
    this.add(this.bodyGfx);

    this.swordGfx = this.scene.add.graphics();
    this.drawSword(0);
    this.add(this.swordGfx);
  }

  private drawBody(flash: boolean): void {
    this.bodyGfx.clear();
    const c = flash ? 0xffffff : BONE_COLOR;
    this.bodyGfx.fillStyle(c, 1);
    this.bodyGfx.fillRoundedRect(-14, -20, 28, 40, 4);
    this.bodyGfx.fillStyle(flash ? 0xffffff : 0xe8e0d0, 1);
    this.bodyGfx.fillCircle(0, -24, 10);
    this.bodyGfx.fillStyle(0x111111, 1);
    this.bodyGfx.fillCircle(-4, -24, 2);
    this.bodyGfx.fillCircle(4, -24, 2);
  }

  private drawSword(swingProgress: number): void {
    this.swordGfx.clear();
    const angle = (-90) + swingProgress * 120;  // 从向上到前挥
    const rad = (angle * Math.PI) / 180;
    const len = BONE_ATTACK_RANGE;
    this.swordGfx.lineStyle(3, 0x3a3a42, 1);
    this.swordGfx.lineBetween(0, 0, Math.cos(rad) * len, Math.sin(rad) * len);
  }

  protected onWindupStart(): void { this.drawSword(0); }
  protected onAttack(): void { this.drawSword(1); }
  protected onHit(): void {
    this.drawBody(true);
    this.scene.time.delayedCall(110, () => this.drawBody(false));
  }
  protected onDead(): void { /* drop 由 BattleScene 处理 */ }

  update(_timeMs: number, deltaMs: number, playerX: number, playerY: number): void {
    if (this.enemyState === 'WINDUP') {
      const p = Math.min(1, this.stateElapsedMs / this.windupMs);
      this.drawSword(p);
    }
    super.update(_timeMs, deltaMs, playerX, playerY);
  }
}
