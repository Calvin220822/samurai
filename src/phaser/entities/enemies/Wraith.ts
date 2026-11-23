import Phaser from 'phaser';
import { Enemy } from './Enemy.js';
import {
  WRAITH_ATTACK_COOLDOWN_MS, WRAITH_ATTACK_DAMAGE, WRAITH_COLOR,
  WRAITH_EXP, WRAITH_GOLD_MAX, WRAITH_GOLD_MIN, WRAITH_HP,
  WRAITH_PREFERRED_DIST, WRAITH_RADIUS, WRAITH_SPEED, WRAITH_WINDUP_MS,
} from '../../config/Constants.js';

export class Wraith extends Enemy {
  private bodyGfx!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setStats({
      maxHp: WRAITH_HP, speed: WRAITH_SPEED, radius: WRAITH_RADIUS,
      windupMs: WRAITH_WINDUP_MS, attackDamage: WRAITH_ATTACK_DAMAGE,
      attackRange: WRAITH_PREFERRED_DIST + 60, attackCooldownMs: WRAITH_ATTACK_COOLDOWN_MS,
      goldMin: WRAITH_GOLD_MIN, goldMax: WRAITH_GOLD_MAX,
    });
    this.createGraphics();
  }

  private createGraphics(): void {
    this.bodyGfx = this.scene.add.graphics();
    this.drawBody(0.65);
    this.add(this.bodyGfx);
  }

  private drawBody(alpha: number): void {
    this.bodyGfx.clear();
    this.bodyGfx.fillStyle(WRAITH_COLOR, alpha);
    this.bodyGfx.fillCircle(0, 0, WRAITH_RADIUS);
    this.bodyGfx.fillStyle(0xffffff, 1);
    this.bodyGfx.fillCircle(-5, -2, 2);
    this.bodyGfx.fillCircle(5, -2, 2);
  }

  protected onWindupStart(): void { this.drawBody(1); }
  protected onAttack(): void { this.drawBody(0.65); }
  protected onHit(): void {
    this.drawBody(1);
    this.scene.time.delayedCall(110, () => this.drawBody(0.65));
  }
  protected onDead(): void { /* drop */ }

  protected doChase(dx: number, dy: number, dist: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const preferred = WRAITH_PREFERRED_DIST;
    if (dist > preferred + 30) {
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      body.setVelocity(nx * this.speed, ny * this.speed);
    } else if (dist < preferred - 30) {
      const nx = -dx / (dist || 1), ny = -dy / (dist || 1);
      body.setVelocity(nx * this.speed, ny * this.speed);
    } else {
      body.setVelocity(0, 0);
      if (this.attackCooldownRemaining <= 0) {
        this.enemyState = 'WINDUP';
        this.stateElapsedMs = 0;
        this.onWindupStart();
      }
    }
  }

  update(timeMs: number, deltaMs: number, playerX: number, playerY: number): void {
    const float = Math.sin(this.scene.time.now / 250) * 2;
    this.bodyGfx.setPosition(0, float);
    super.update(timeMs, deltaMs, playerX, playerY);
    void WRAITH_EXP;
  }
}
