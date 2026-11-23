import Phaser from 'phaser';
import type { Player } from '../Player.js';
import {
  BOSS_HP, BOSS_SPEED, BOSS_ATTACK_DAMAGE, BOSS_RADIUS,
  BOSS_PHASE2_HP_RATIO, BOSS_PHASE2_SPEED_BOOST,
  BOSS_SWIPE_COOLDOWN_MS, BOSS_SWIPE_WINDUP_MS, BOSS_SWIPE_RADIUS, BOSS_SWIPE_FAN_DEG,
  BOSS_SLAM_COOLDOWN_MS, BOSS_SLAM_WINDUP_MS, BOSS_SLAM_RADIUS, BOSS_SLAM_DAMAGE,
  BOSS_CHARGE_COOLDOWN_MS, BOSS_CHARGE_WINDUP_MS, BOSS_CHARGE_SPEED, BOSS_CHARGE_DURATION_MS,
  BOSS_GHOSTFIRE_COOLDOWN_MS, BOSS_GHOSTFIRE_RADIUS, BOSS_GHOSTFIRE_DAMAGE,
  BOSS_SUMMON_COOLDOWN_MS, GAME_WIDTH, GAME_HEIGHT,
} from '../../config/Constants.js';

export type BossAttackType = 'idle' | 'swipe' | 'slam' | 'charge' | 'ghostfire';

/**
 * Boss 赤月鬼将 —— Phase 4 独立实体，不继承 Enemy.ts。
 * 两阶段 + 多攻击模式：swipe / slam / charge + ghostfire / summon。
 */
export class BossAkatsuki extends Phaser.GameObjects.Container {
  public arcadeBody!: Phaser.Physics.Arcade.Body;

  private hitbox!: Phaser.GameObjects.Arc;
  private hornGfx!: Phaser.GameObjects.Graphics;
  private eyeGfx!: Phaser.GameObjects.Graphics;

  public hp = BOSS_HP;
  public maxHp = BOSS_HP;
  public radius = BOSS_RADIUS;
  public speed = BOSS_SPEED;
  public atkDamage = BOSS_ATTACK_DAMAGE;

  private isPhase2 = false;
  private attackType: BossAttackType = 'idle';
  private attackCooldownMs = 2000;
  private windupRemaining = 0;
  private attackRemaining = 0;
  private chargeVelX = 0;
  private chargeVelY = 0;
  private ghostfireCdMs = BOSS_GHOSTFIRE_COOLDOWN_MS;
  private summonCdMs = BOSS_SUMMON_COOLDOWN_MS;
  public dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  public initBody(): void {
    this.scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject, false);
    this.arcadeBody = this.body as Phaser.Physics.Arcade.Body;
    this.arcadeBody.setCircle(this.radius, -this.radius, -this.radius);
    this.arcadeBody.setAllowGravity(false);
    this.arcadeBody.setImmovable(true);
    this.arcadeBody.setCollideWorldBounds(true);
    this.arcadeBody.setBounce(0);
    this.createGraphics();
  }

  private createGraphics(): void {
    this.hitbox = this.scene.add.circle(0, 0, this.radius, 0x6a1a1a, 1)
      .setStrokeStyle(4, 0xff4433, 1);
    this.hornGfx = this.scene.add.graphics();
    this.eyeGfx = this.scene.add.graphics();
    this.drawBody();
    this.add([this.hitbox, this.hornGfx, this.eyeGfx]);
  }

  private drawBody(): void {
    // 光环（呼吸动画）
    const aura = this.scene.add.graphics();
    aura.lineStyle(3, this.isPhase2 ? 0xff2222 : 0x882222, 0.7);
    const r = this.radius + 12 + Math.sin(this.scene.time.now * 0.005) * 4;
    aura.strokeCircle(0, 0, r);
    // 清理前一帧光环（直接销毁会 leak；简单做法：每帧重建但控制数量）
    const prev = this.getData('_aura') as Phaser.GameObjects.Graphics | undefined;
    if (prev) prev.destroy();
    this.setData('_aura', aura);

    // 头顶角
    this.hornGfx.clear();
    this.hornGfx.fillStyle(this.isPhase2 ? 0xffffff : 0x330000, 1);
    this.hornGfx.fillTriangle(-14, -this.radius + 4, -6, -this.radius - 16, -20, -this.radius - 2);
    this.hornGfx.fillTriangle(14, -this.radius + 4, 6, -this.radius - 16, 20, -this.radius - 2);
    // 眼睛
    this.eyeGfx.clear();
    this.eyeGfx.fillStyle(this.isPhase2 ? 0xffff00 : 0xff6600, 1);
    this.eyeGfx.fillCircle(-10, -4, 4);
    this.eyeGfx.fillCircle(10, -4, 4);
    // 主体
    this.hitbox.setFillStyle(this.isPhase2 ? 0x8a2222 : 0x6a1a1a, 1);
    this.hitbox.setStrokeStyle(5, this.isPhase2 ? 0xffffff : 0xff4433, 1);
  }

  public takeHit(amount: number): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.scene.events.emit('boss:hit', { amount, hp: this.hp, maxHp: this.maxHp });
    // 白闪
    this.hitbox.setFillStyle(0xffffff, 1);
    this.scene.time.delayedCall(60, () => { if (!this.dead) this.drawBody(); });
    if (!this.isPhase2 && this.hp / this.maxHp <= BOSS_PHASE2_HP_RATIO) this.enterPhase2();
    if (this.hp <= 0) this.die();
  }

  private enterPhase2(): void {
    this.isPhase2 = true;
    this.speed = BOSS_SPEED * BOSS_PHASE2_SPEED_BOOST;
    this.scene.cameras.main.shake(500, 0.006);
    this.setScale(1.3);
    this.scene.time.delayedCall(250, () => { this.setScale(1); this.drawBody(); });
    const banner = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, '赤月鬼将 · 狂暴', {
      fontSize: '36px', color: '#ff4433', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.scene.tweens.add({ targets: banner, alpha: 0, duration: 1500, onComplete: () => banner.destroy() });
  }

  private die(): void {
    this.dead = true;
    this.arcadeBody.setEnable(false);
    this.scene.events.emit('boss:dead');
    this.scene.cameras.main.shake(600, 0.008);
    this.scene.tweens.add({
      targets: this, alpha: 0, scale: 1.6, duration: 900,
      onComplete: () => this.destroy(),
    });
  }

  /** 每帧调用。由 BossScene 的 update 转发。 */
  public tick(deltaMs: number, player: Player): void {
    if (this.dead) return;
    this.drawBody();  // 光环呼吸

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.attackType === 'idle') {
      // 追击
      const len = Math.max(1, dist);
      this.arcadeBody.setVelocity((dx / len) * this.speed, (dy / len) * this.speed);
      this.attackCooldownMs -= deltaMs;
      if (this.attackCooldownMs <= 0 && dist < 400) this.pickAttack(dist);
    } else if (this.windupRemaining > 0) {
      this.windupRemaining -= deltaMs;
      const v = this.arcadeBody.velocity;
      this.arcadeBody.setVelocity(v.x * 0.5, v.y * 0.5);
      if (this.windupRemaining <= 0) this.executeAttack(player);
    } else if (this.attackRemaining > 0) {
      this.attackRemaining -= deltaMs;
      if (this.attackType === 'charge') this.arcadeBody.setVelocity(this.chargeVelX, this.chargeVelY);
      if (this.attackRemaining <= 0) {
        this.attackType = 'idle';
        this.attackCooldownMs = BOSS_SWIPE_COOLDOWN_MS;
      }
    }

    // Phase 2 额外定时
    if (this.isPhase2) {
      this.ghostfireCdMs -= deltaMs;
      if (this.ghostfireCdMs <= 0) {
        this.ghostfireCdMs = BOSS_GHOSTFIRE_COOLDOWN_MS;
        this.scene.events.emit('boss:ghostfire', {
          x: this.x, y: this.y, radius: BOSS_GHOSTFIRE_RADIUS, damage: BOSS_GHOSTFIRE_DAMAGE, source: this,
        });
      }
      this.summonCdMs -= deltaMs;
      if (this.summonCdMs <= 0) {
        this.summonCdMs = BOSS_SUMMON_COOLDOWN_MS;
        this.scene.events.emit('boss:summon');
      }
    }
  }

  private pickAttack(dist: number): void {
    let pick: BossAttackType;
    if (dist < 180) {
      pick = Math.random() < 0.7 ? 'swipe' : 'slam';
    } else if (dist < 320) {
      const r = Math.random();
      pick = r < 0.5 ? 'swipe' : r < 0.8 ? 'charge' : 'slam';
    } else {
      pick = Math.random() < 0.6 ? 'charge' : 'swipe';
    }
    this.attackType = pick;
    if (pick === 'swipe') { this.windupRemaining = BOSS_SWIPE_WINDUP_MS; this.attackRemaining = 200; this.attackCooldownMs = BOSS_SWIPE_COOLDOWN_MS; }
    else if (pick === 'slam') { this.windupRemaining = BOSS_SLAM_WINDUP_MS; this.attackRemaining = 300; this.attackCooldownMs = BOSS_SLAM_COOLDOWN_MS; }
    else if (pick === 'charge') { this.windupRemaining = BOSS_CHARGE_WINDUP_MS; this.attackRemaining = BOSS_CHARGE_DURATION_MS; this.attackCooldownMs = BOSS_CHARGE_COOLDOWN_MS; }
  }

  private executeAttack(player: Player): void {
    if (this.attackType === 'swipe') {
      this.scene.events.emit('boss:swipe', {
        x: this.x, y: this.y, radius: BOSS_SWIPE_RADIUS,
        fanDeg: BOSS_SWIPE_FAN_DEG, damage: this.atkDamage, source: this,
      });
    } else if (this.attackType === 'slam') {
      this.scene.events.emit('boss:slam', {
        x: this.x, y: this.y, radius: BOSS_SLAM_RADIUS,
        damage: BOSS_SLAM_DAMAGE, source: this,
      });
    } else if (this.attackType === 'charge') {
      const dx = player.x - this.x, dy = player.y - this.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      this.chargeVelX = (dx / len) * BOSS_CHARGE_SPEED;
      this.chargeVelY = (dy / len) * BOSS_CHARGE_SPEED;
      this.scene.events.emit('boss:charge-start', { source: this });
    }
  }
}
