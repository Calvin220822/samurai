import Phaser from 'phaser';
import { Enemy } from './Enemy.js';
import {
  ELITE_ATTACK_COOLDOWN_MS, ELITE_ATTACK_DAMAGE, ELITE_ATTACK_RANGE,
  ELITE_COLOR, ELITE_EXP, ELITE_GOLD_MAX, ELITE_GOLD_MIN, ELITE_HP,
  ELITE_RADIUS, ELITE_SPEED, ELITE_SUMMON_AT_HP_RATIO, ELITE_SUMMON_COUNT,
  ELITE_WINDUP_MS, ELITE_PHASE2_HP_RATIO, ELITE_PHASE2_SPEED_BOOST,
  ELITE_GHOSTFIRE_COOLDOWN_MS, ELITE_GHOSTFIRE_DAMAGE, ELITE_GHOSTFIRE_RADIUS,
} from '../../config/Constants.js';

/**
 * 精英鬼将 Phase 3 两阶段版本。
 *
 * Phase 1（HP > 60%）：红紫大圆，正常追击 + 召唤赤鬼
 * Phase 2（HP ≤ 60%）：变成深紫色纹路，速度 ×1.3，攻击节奏变快，
 *   周期性释放鬼火爆发（AOE + 地面危险区红色警示 500ms 后爆炸）
 *
 * 关卡胜利条件仍为死亡。
 */
export class EliteGeneral extends Enemy {
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private summoned = false;
  private isPhase2 = false;
  private ghostfireCd = ELITE_GHOSTFIRE_COOLDOWN_MS;

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
    this.drawBody(1, false);
    this.add(this.bodyGfx);
  }

  private drawBody(scale: number, flash: boolean): void {
    this.bodyGfx.clear();
    const r = ELITE_RADIUS * scale;
    const outerC = flash ? 0xffffff : (this.isPhase2 ? 0x551166 : ELITE_COLOR);
    this.bodyGfx.fillStyle(outerC, 1);
    this.bodyGfx.fillCircle(0, 0, r);
    // Phase 2：红色纹路覆盖
    if (this.isPhase2) {
      this.bodyGfx.fillStyle(0xcc2233, 0.5);
      this.bodyGfx.fillTriangle(-r * 0.8, 0, r * 0.8, 0, 0, r * 0.9);
      this.bodyGfx.fillStyle(0xcc2233, 0.5);
      this.bodyGfx.fillTriangle(-r * 0.6, r * 0.4, r * 0.6, r * 0.4, 0, -r * 0.7);
    }
    // 尖角 + 金心
    this.bodyGfx.fillStyle(this.isPhase2 ? 0x881122 : 0x440055, 1);
    this.bodyGfx.fillTriangle(-r * 0.6, -r, -r * 0.2, -r - 10, -r * 0.4, -r - 3);
    this.bodyGfx.fillTriangle(r * 0.6, -r, r * 0.2, -r - 10, r * 0.4, -r - 3);
    this.bodyGfx.fillStyle(this.isPhase2 ? 0xff5522 : 0xffcc55, 1);
    this.bodyGfx.fillCircle(0, 0, r * 0.35);
  }

  public takeDamage(dmg: number): void {
    const beforeHp = this.hp;
    super.takeDamage(dmg);

    // —— 召唤机制（HP<50%，Phase 1 时）——
    if (!this.summoned && beforeHp > this.maxHp * ELITE_SUMMON_AT_HP_RATIO
        && this.hp <= this.maxHp * ELITE_SUMMON_AT_HP_RATIO) {
      this.summoned = true;
      this.scene.events.emit('elite:summon', { owner: this, count: ELITE_SUMMON_COUNT });
    }

    // —— Phase 2 切换（HP<60%）——
    if (!this.isPhase2 && beforeHp > this.maxHp * ELITE_PHASE2_HP_RATIO
        && this.hp <= this.maxHp * ELITE_PHASE2_HP_RATIO) {
      this.enterPhase2();
    }
  }

  private enterPhase2(): void {
    this.isPhase2 = true;
    this.speed = ELITE_SPEED * ELITE_PHASE2_SPEED_BOOST;
    // 重置鬼火爆发 CD，让它尽快触发一次
    this.ghostfireCd = 1500;
    // 阶段切换演出：短暂放大 + 变色 + 屏幕抖动
    this.drawBody(1.3, false);
    const self = this;
    this.scene.time.delayedCall(150, () => self.drawBody(1, false));
    this.scene.cameras.main.shake(400, 0.005);
    this.scene.events.emit('elite:phase2-enter');
  }

  protected onWindupStart(): void { this.drawBody(1.15, false); }
  protected onAttack(): void { this.drawBody(1, false); }
  protected onHit(): void {
    this.drawBody(1, true);
    this.scene.time.delayedCall(110, () => this.drawBody(1, false));
  }
  protected onDead(): void { /* BattleScene 监听关卡胜利 */ }

  update(timeMs: number, deltaMs: number, playerX: number, playerY: number): void {
    // Phase 2 鬼火爆发计时
    if (this.isPhase2) {
      this.ghostfireCd -= deltaMs;
      if (this.ghostfireCd <= 0) {
        this.ghostfireCd = ELITE_GHOSTFIRE_COOLDOWN_MS;
        // 由 BattleScene 监听事件处理（画地面警示 + 延迟爆炸）
        this.scene.events.emit('elite:ghostfire', {
          x: this.x, y: this.y,
          radius: ELITE_GHOSTFIRE_RADIUS, damage: ELITE_GHOSTFIRE_DAMAGE,
        });
      }
    }
    super.update(timeMs, deltaMs, playerX, playerY);
    void timeMs; void ELITE_EXP;
  }
}
