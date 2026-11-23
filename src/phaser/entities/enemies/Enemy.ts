import Phaser from 'phaser';
import {
  ONI_ATTACK_COOLDOWN_MS,
  ONI_ATTACK_DAMAGE,
  ONI_ATTACK_RANGE,
  ONI_GOLD_REWARD_MAX,
  ONI_GOLD_REWARD_MIN,
  ONI_HP,
  ONI_RADIUS,
  ONI_SPEED,
  ONI_WINDUP_MS,
} from '../../config/Constants.js';

export type EnemyFSM = 'IDLE' | 'CHASE' | 'WINDUP' | 'ATTACKING' | 'HIT' | 'DEAD';

/**
 * Enemy 基类。继承 Phaser.GameObjects.Container。
 *
 * 字段命名注意：
 * - enemyState 避免与基类 GameObject.state 冲突
 * - add.existing 需 as any cast 绕开 Phaser 4 类型 overload 顺序问题
 */
export abstract class Enemy extends Phaser.GameObjects.Container {
  // —— 属性 ——
  protected hp: number;
  protected maxHp: number;
  protected attackDamage: number;
  protected attackRange: number;
  protected attackCooldownMs: number;
  protected windupMs: number;
  protected speed: number;
  protected radius: number;
  protected goldMin: number;
  protected goldMax: number;

  // —— 运行时状态 ——
  protected enemyState: EnemyFSM = 'CHASE';
  protected attackCooldownRemaining = 0;
  protected stateElapsedMs = 0;
  protected dead = false;

  // —— 子类可 hooks ——
  protected onAttack(): void { /* BattleScene 监听 event 处理伤害 */ }
  protected onWindupStart(): void { /* 抬手 / 斧头抬到头顶 */ }
  protected onHit(): void { /* 红闪 */ }
  protected onDead(): void { /* drop 由 BattleScene 监听 enemy:dead 处理 */ }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    this.radius = ONI_RADIUS;
    scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject, false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.radius);
    body.setOffset(-this.radius, -this.radius);
    body.setCollideWorldBounds(true);

    this.hp = this.maxHp = ONI_HP;
    this.attackDamage = ONI_ATTACK_DAMAGE;
    this.attackRange = ONI_ATTACK_RANGE;
    this.attackCooldownMs = ONI_ATTACK_COOLDOWN_MS;
    this.windupMs = ONI_WINDUP_MS;
    this.speed = ONI_SPEED;
    this.goldMin = ONI_GOLD_REWARD_MIN;
    this.goldMax = ONI_GOLD_REWARD_MAX;
  }

  setRadius(r: number): void {
    this.radius = r;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset(-r, -r);
  }

  setStats(opts: {
    maxHp?: number; attackDamage?: number; attackRange?: number;
    attackCooldownMs?: number; windupMs?: number; speed?: number;
    radius?: number; goldMin?: number; goldMax?: number;
  }): void {
    if (opts.maxHp !== undefined) { this.maxHp = opts.maxHp; this.hp = opts.maxHp; }
    if (opts.attackDamage !== undefined) this.attackDamage = opts.attackDamage;
    if (opts.attackRange !== undefined) this.attackRange = opts.attackRange;
    if (opts.attackCooldownMs !== undefined) this.attackCooldownMs = opts.attackCooldownMs;
    if (opts.windupMs !== undefined) this.windupMs = opts.windupMs;
    if (opts.speed !== undefined) this.speed = opts.speed;
    if (opts.radius !== undefined) this.setRadius(opts.radius);
    if (opts.goldMin !== undefined) this.goldMin = opts.goldMin;
    if (opts.goldMax !== undefined) this.goldMax = opts.goldMax;
  }

  /** 由 BattleScene 每帧调用。传入 Player 位置查询避免循环依赖。 */
  update(_time: number, deltaMs: number, playerX: number, playerY: number): void {
    if (this.dead) return;
    this.stateElapsedMs += deltaMs;
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaMs);

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);

    switch (this.enemyState) {
      case 'CHASE':   this.doChase(dx, dy, dist); break;
      case 'WINDUP':  this.doWindup(dx, dy, dist); break;
      case 'ATTACKING':
        if (this.stateElapsedMs >= 120) { this.enemyState = 'CHASE'; this.stateElapsedMs = 0; }
        break;
      case 'HIT':
        if (this.stateElapsedMs >= 150) { this.enemyState = 'CHASE'; this.stateElapsedMs = 0; }
        break;
      case 'DEAD': break;
    }
  }

  private doChase(dx: number, dy: number, dist: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (dist > this.attackRange) {
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
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

  private doWindup(dx: number, dy: number, dist: number): void {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (this.stateElapsedMs >= this.windupMs) {
      this.scene.events.emit('enemy:attack', {
        enemy: this,
        x: this.x, y: this.y,
        dx: dx / (dist || 1), dy: dy / (dist || 1),
        damage: this.attackDamage,
        range: this.attackRange + 10,
      });
      this.attackCooldownRemaining = this.attackCooldownMs;
      this.enemyState = 'ATTACKING';
      this.stateElapsedMs = 0;
      this.onAttack();
    }
  }

  takeDamage(dmg: number): void {
    if (this.dead) return;
    this.hp -= dmg;
    this.enemyState = 'HIT';
    this.stateElapsedMs = 0;
    this.onHit();
    if (this.hp <= 0) this.die();
  }

  getHp(): number { return this.hp; }
  getMaxHp(): number { return this.maxHp; }
  isDead(): boolean { return this.dead; }

  protected die(): void {
    this.dead = true;
    this.enemyState = 'DEAD';
    this.scene.events.emit('enemy:dead', { enemy: this, x: this.x, y: this.y, goldMin: this.goldMin, goldMax: this.goldMax });
    this.onDead();
    this.scene.tweens.add({
      targets: this, alpha: 0, scaleX: 1.3, scaleY: 0.6,
      duration: 400, ease: 'Cubic.In',
      onComplete: () => this.destroy(),
    });
  }
}
