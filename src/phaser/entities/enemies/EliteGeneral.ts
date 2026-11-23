import Phaser from 'phaser';
import { Enemy } from './Enemy.js';
import {
  ELITE_ATTACK_COOLDOWN_MS, ELITE_ATTACK_DAMAGE, ELITE_ATTACK_RANGE,
  ELITE_COLOR, ELITE_EXP, ELITE_GOLD_MAX, ELITE_GOLD_MIN, ELITE_HP,
  ELITE_RADIUS, ELITE_SPEED, ELITE_SUMMON_AT_HP_RATIO, ELITE_SUMMON_COUNT, ELITE_WINDUP_MS,
} from '../../config/Constants.js';

export class EliteGeneral extends Enemy {
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private summoned = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.setStats({
      maxHp: ELITE_HP, speed: ELITE_SPEED, radius: ELITE_RADIUS,
      windupMs: ELITE_WINDUP_MS, attackDamage: ELITE_ATTACK_DAMAGE,
      attackRange: ELITE_ATTACK_RANGE, attackCooldownMs: ELITE_ATTACK_COOLDOWN_MS,
      goldMin: ELITE_GOLD_MIN, goldMax: ELITE_GOLD_MAX,
    });
    this.createGraphics();
  }

  private createGraphics(): void {
    this.bodyGfx = this.scene.add.graphics();
    this.drawBody(1);
    this.add(this.bodyGfx);
  }

  private drawBody(scale: number, flash = false): void {
    this.bodyGfx.clear();
    const r = ELITE_RADIUS * scale;
    const outerC = flash ? 0xffffff : ELITE_COLOR;
    this.bodyGfx.fillStyle(outerC, 1);
    this.bodyGfx.fillCircle(0, 0, r);
    this.bodyGfx.fillStyle(0x440055, 1);
    this.bodyGfx.fillTriangle(-r * 0.6, -r, -r * 0.2, -r - 10, -r * 0.4, -r - 3);
    this.bodyGfx.fillTriangle(r * 0.6, -r, r * 0.2, -r - 10, r * 0.4, -r - 3);
    this.bodyGfx.fillStyle(0xffcc55, 1);
    this.bodyGfx.fillCircle(0, 0, r * 0.35);
  }

  public takeDamage(dmg: number): void {
    const beforeHp = this.hp;
    super.takeDamage(dmg);
    if (!this.summoned && beforeHp > this.maxHp * ELITE_SUMMON_AT_HP_RATIO
        && this.hp <= this.maxHp * ELITE_SUMMON_AT_HP_RATIO) {
      this.summoned = true;
      this.scene.events.emit('elite:summon', { owner: this, count: ELITE_SUMMON_COUNT });
    }
  }

  protected onWindupStart(): void { this.drawBody(1.15); }
  protected onAttack(): void { this.drawBody(1); }
  protected onHit(): void {
    this.drawBody(1, true);
    this.scene.time.delayedCall(110, () => this.drawBody(1));
  }
  protected onDead(): void { /* 触发 BattleScene 关卡胜利 */ }

  update(_timeMs: number, deltaMs: number, playerX: number, playerY: number): void {
    super.update(_timeMs, deltaMs, playerX, playerY);
    void ELITE_EXP;
  }
}
