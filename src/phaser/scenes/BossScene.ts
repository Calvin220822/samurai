import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_COLOR, GRID_COLOR, BOSS_EXP,
  PLAYER_RADIUS, PLAYER_START_HP,
  BOSS_SWIPE_WINDUP_MS, BOSS_SWIPE_RADIUS, BOSS_SWIPE_FAN_DEG,
  BOSS_SLAM_RADIUS,
  DAMAGE_FLOAT_UP, DAMAGE_FLOAT_DURATION_MS,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { BossAkatsuki } from '../entities/enemies/BossAkatsuki.js';
import { RedOni } from '../entities/enemies/RedOni.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { getGameStore } from '@/store/gameStore.js';
import { saveGame } from '../systems/SaveSystem.js';

interface Vec { x: number; y: number }

/**
 * BossScene —— 赤月鬼将战。
 *
 * 与 BattleScene 一致：Player 自己处理移动 / 普攻 / 技能按键，
 * BossScene 负责命中判定、Boss 攻击预警与结算。
 */
export class BossScene extends Phaser.Scene {
  private player!: Player;
  private boss!: BossAkatsuki;
  private minions: RedOni[] = [];
  private skills = new SkillSystem();

  private bossHpInner!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Rectangle;

  private over = false;
  private lastContactAt = 0;

  constructor() {
    super({ key: 'BossScene' });
  }

  create(): void {
    this.over = false;
    this.minions = [];
    const store = getGameStore();
    store.setScene('BossScene');
    store.setUiPanel('none');

    this.drawArena();
    const walls = this.buildWalls();

    // 玩家（Boss 战前回满 HP，作为关卡检查点）
    store.setPlayerHp(store.player.maxHp);
    this.player = new Player(this, GAME_WIDTH / 2 - 280, GAME_HEIGHT / 2 + 60, this.skills);
    this.boss = new BossAkatsuki(this, GAME_WIDTH / 2 + 160, GAME_HEIGHT / 2);
    this.boss.initBody();

    this.physics.add.collider(this.player.body as Phaser.Physics.Arcade.Body, walls);
    this.physics.add.collider(this.boss.arcadeBody, walls);
    this.physics.add.overlap(
      this.player.body as Phaser.Physics.Arcade.Body,
      this.boss.arcadeBody,
      () => this.onContactBoss(),
    );

    this.createHud();
    this.bindCombatEvents();
    this.bindBossEvents();
    this.bindUiAndCleanup();

    // 入场演出
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // ——————————————— 场景绘制 ———————————————

  private drawArena(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, GROUND_COLOR);
    const grid = this.add.graphics();
    grid.lineStyle(1, GRID_COLOR, 0.45);
    for (let x = 0; x <= GAME_WIDTH; x += 40) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) grid.lineBetween(0, y, GAME_WIDTH, y);

    // 中央法阵
    const circle = this.add.graphics();
    circle.lineStyle(3, 0x7a1a1a, 0.6);
    circle.strokeCircle(GAME_WIDTH / 2 + 60, GAME_HEIGHT / 2, 220);
    circle.lineStyle(1, 0xaa3333, 0.35);
    circle.strokeCircle(GAME_WIDTH / 2 + 60, GAME_HEIGHT / 2, 170);

    // 红色柱子
    const pillars = this.add.graphics();
    pillars.fillStyle(0x551111, 0.55);
    [110, GAME_WIDTH - 110].forEach((x) => pillars.fillRect(x - 18, 0, 36, GAME_HEIGHT));
    pillars.fillStyle(0xff5533, 0.35);
    [110, GAME_WIDTH - 110].forEach((x) => pillars.fillRect(x - 2, 0, 4, GAME_HEIGHT));
  }

  private buildWalls(): Phaser.Physics.Arcade.StaticGroup {
    const walls = this.physics.add.staticGroup();
    const add = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x5a5a64);
      this.physics.add.existing(r, true);
      walls.add(r);
    };
    add(0, 0, GAME_WIDTH, 24);
    add(0, GAME_HEIGHT - 24, GAME_WIDTH, 24);
    add(0, 0, 24, GAME_HEIGHT);
    add(GAME_WIDTH - 24, 0, 24, GAME_HEIGHT);
    return walls;
  }

  private createHud(): void {
    // 玩家 HP
    this.add.text(20, 16, '武士', {
      fontSize: '14px', color: '#bbbbbb', fontStyle: 'bold',
    });
    this.add.rectangle(20, 40, 260, 18, 0x22222a, 0.9).setOrigin(0, 0.5);
    this.playerHpBar = this.add.rectangle(20, 40, 260, 14, 0x44cc66, 1).setOrigin(0, 0.5);
    this.playerHpText = this.add.text(290, 32, '', {
      fontSize: '13px', color: '#ffffff',
    });

    // Boss HP
    this.add.rectangle(GAME_WIDTH / 2, 56, 640, 20, 0x22222a, 0.9);
    this.bossHpInner = this.add.rectangle(GAME_WIDTH / 2 - 320, 56, 640, 14, 0xff2222, 1).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH / 2, 30, '赤月鬼将', {
      fontSize: '22px', color: '#ff8888', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24,
      'WASD 移动 · 空格 普攻 · Q/W/E/R 技能 · Esc 面板', {
        fontSize: '13px', color: '#9aa0a6',
      }).setOrigin(0.5);
  }

  // ——————————————— 事件绑定 ———————————————

  private bindCombatEvents(): void {
    this.events.on('player:attack-hit', this.onPlayerAttack, this);
    this.events.on('skill:q-start', this.onSkillQ, this);
    this.events.on('skill:w-start', this.onSkillW, this);
    this.events.on('skill:r-start', this.onSkillR, this);
    this.events.on('skill:e-start', this.onSkillE, this);
  }

  private bindBossEvents(): void {
    this.events.on('boss:hit', this.onBossHit, this);
    this.events.on('boss:windup', this.onBossWindup, this);
    this.events.on('boss:swipe', this.onBossSwipe, this);
    this.events.on('boss:slam', this.onBossSlam, this);
    this.events.on('boss:ghostfire', this.onBossGhostfire, this);
    this.events.on('boss:summon', this.onBossSummon, this);
    this.events.on('boss:phase2', this.onBossPhase2, this);
    this.events.on('boss:dead', this.onBossDead, this);
    // 召唤的小怪攻击也要能命中玩家
    this.events.on('enemy:attack', this.onMinionAttack, this);
  }

  private bindUiAndCleanup(): void {
    // Esc 角色面板由 React GameOverlay 统一处理
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('player:attack-hit', this.onPlayerAttack, this);
      this.events.off('skill:q-start', this.onSkillQ, this);
      this.events.off('skill:w-start', this.onSkillW, this);
      this.events.off('skill:r-start', this.onSkillR, this);
      this.events.off('skill:e-start', this.onSkillE, this);
      this.events.off('boss:hit', this.onBossHit, this);
      this.events.off('boss:windup', this.onBossWindup, this);
      this.events.off('boss:swipe', this.onBossSwipe, this);
      this.events.off('boss:slam', this.onBossSlam, this);
      this.events.off('boss:ghostfire', this.onBossGhostfire, this);
      this.events.off('boss:summon', this.onBossSummon, this);
      this.events.off('boss:phase2', this.onBossPhase2, this);
      this.events.off('boss:dead', this.onBossDead, this);
      this.events.off('enemy:attack', this.onMinionAttack, this);
    });
  }

  // ——————————————— 玩家 → Boss 伤害 ———————————————

  private onPlayerAttack(args: { damage: number }): void {
    if (this.over) return;
    const { rect } = this.skills.resolveNormalAttack(this.player);
    if (this.circleInRect(this.boss.x, this.boss.y, this.boss.radius, rect)) {
      this.boss.takeHit(args.damage);
    }
    for (const m of this.minions) {
      if (!m.isDead() && this.circleInRect(m.x, m.y, 16, rect)) m.takeDamage(args.damage);
    }
  }

  private onSkillQ(args: { x: number; y: number; dx: number; distance: number; width: number; damage: number }): void {
    if (this.over) return;
    const ex = args.x + args.dx * args.distance;
    if (this.circleNearSegment(this.boss.x, this.boss.y, this.boss.radius + args.width / 2, args.x, args.y, ex, args.y)) {
      this.boss.takeHit(args.damage);
    }
    for (const m of this.minions) {
      if (!m.isDead() && this.circleNearSegment(m.x, m.y, 16 + args.width / 2, args.x, args.y, ex, args.y)) {
        m.takeDamage(args.damage);
      }
    }
  }

  private onSkillW(args: { x: number; y: number; radius: number; damage: number }): void {
    if (this.over) return;
    const ring = this.add.graphics();
    ring.lineStyle(4, 0x66ccff, 0.9);
    ring.strokeCircle(args.x, args.y, args.radius);
    this.tweens.add({ targets: ring, alpha: 0, scaleX: 1.2, scaleY: 1.2, duration: 320, onComplete: () => ring.destroy() });
    this.cameras.main.shake(120, 0.002);

    if (Phaser.Math.Distance.Between(args.x, args.y, this.boss.x, this.boss.y) <= args.radius + this.boss.radius) {
      this.boss.takeHit(args.damage);
    }
    for (const m of this.minions) {
      if (!m.isDead() && Phaser.Math.Distance.Between(args.x, args.y, m.x, m.y) <= args.radius) {
        m.takeDamage(args.damage);
      }
    }
  }

  private onSkillR(args: {
    x: number; y: number; dx: number; fanRadius: number; fanAngleDeg: number; damage: number;
  }): void {
    if (this.over) return;
    const base = args.dx > 0 ? 0 : 180;
    const half = args.fanAngleDeg / 2;

    const fan = this.add.graphics();
    fan.fillStyle(0xff4444, 0.35);
    fan.slice(args.x, args.y, args.fanRadius, Phaser.Math.DegToRad(base - half), Phaser.Math.DegToRad(base + half));
    fan.fillPath();
    fan.lineStyle(4, 0xff7777, 1);
    fan.strokePath();
    this.tweens.add({ targets: fan, alpha: 0, duration: 200, onComplete: () => fan.destroy() });
    this.cameras.main.shake(180, 0.004);

    const inFan = (tx: number, ty: number, r: number) => {
      const dist = Phaser.Math.Distance.Between(args.x, args.y, tx, ty);
      if (dist > args.fanRadius + r) return false;
      const ang = Phaser.Math.RadToDeg(Math.atan2(ty - args.y, tx - args.x));
      const diff = Math.abs(Phaser.Math.Angle.ShortestBetween(base, ang));
      return diff <= half;
    };

    if (inFan(this.boss.x, this.boss.y, this.boss.radius)) this.boss.takeHit(args.damage);
    for (const m of this.minions) {
      if (!m.isDead() && inFan(m.x, m.y, 16)) m.takeDamage(args.damage);
    }
  }

  private onSkillE(args: Vec): void {
    // 残影
    const ghost = this.add.rectangle(args.x, args.y, 28, 44, 0xffffff, 0.35);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 260, onComplete: () => ghost.destroy() });
  }

  private onBossHit(args: { hp: number; maxHp: number; amount: number }): void {
    const pct = Math.max(0, args.hp / args.maxHp);
    this.bossHpInner.width = 640 * pct;
    this.floatText(this.boss.x, this.boss.y - 48, `-${args.amount}`, 0xffcc44);
  }

  // ——————————————— Boss → 玩家伤害 ———————————————

  /** Boss 抬手预警：在实体已完成前摇后，于正确时机画出攻击范围 */
  private onBossWindup(args: { type: 'idle' | 'swipe' | 'slam' | 'charge' }): void {
    if (args.type === 'swipe') {
      this.drawFanWarning(this.boss.x, this.boss.y, BOSS_SWIPE_RADIUS, BOSS_SWIPE_FAN_DEG);
    } else if (args.type === 'slam') {
      this.drawCircleWarning(this.boss.x, this.boss.y, BOSS_SLAM_RADIUS, 0xff6600);
    } else if (args.type === 'charge') {
      this.floatText(this.boss.x, this.boss.y - this.boss.radius - 24, '冲锋！', 0xff8833);
    }
  }

  private onMinionAttack(args: { damage: number }): void {
    if (this.over) return;
    this.hitPlayer(args.damage);
  }

  private onBossSwipe(args: { x: number; y: number; radius: number; fanDeg: number; damage: number }): void {
    // 前摇已在 onBossWindup 画好，这里立即结算
    const dx = this.player.x - args.x;
    const dy = this.player.y - args.y;
    const inRange = Math.hypot(dx, dy) <= args.radius + PLAYER_RADIUS;
    this.drawSlashArc(args.x, args.y, args.radius, args.fanDeg);
    this.cameras.main.shake(140, 0.003);
    if (inRange) this.hitPlayer(args.damage);
  }

  private onBossSlam(args: { x: number; y: number; radius: number; damage: number }): void {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, args.x, args.y);
    const shock = this.add.graphics();
    shock.fillStyle(0xffaa44, 0.5);
    shock.fillCircle(args.x, args.y, args.radius);
    this.tweens.add({ targets: shock, alpha: 0, scaleX: 1.2, scaleY: 1.2, duration: 240, onComplete: () => shock.destroy() });
    this.cameras.main.shake(220, 0.005);
    if (dist <= args.radius) this.hitPlayer(args.damage);
  }

  private drawSlashArc(x: number, y: number, radius: number, fanDeg: number): void {
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    const half = Phaser.Math.DegToRad(fanDeg / 2);
    const g = this.add.graphics();
    g.fillStyle(0xff6655, 0.4);
    g.lineStyle(5, 0xffaa88, 0.95);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, radius, angle - half, angle + half);
    g.closePath();
    g.fillPath();
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  private onBossGhostfire(args: { x: number; y: number; radius: number; damage: number }): void {
    this.drawCircleWarning(args.x, args.y, args.radius, 0xff33cc);
    this.time.delayedCall(500, () => {
      if (this.over) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, args.x, args.y);
      if (dist <= args.radius) this.hitPlayer(args.damage);
    });
  }

  private onBossSummon(): void {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 60;
      const oni = new RedOni(this, this.boss.x + Math.cos(a) * r, this.boss.y + Math.sin(a) * r);
      this.minions.push(oni);
    }
    this.floatText(this.boss.x, this.boss.y - 90, '召唤赤鬼 ×2', 0xff5555);
  }

  private onBossPhase2(): void {
    this.cameras.main.flash(300, 120, 0, 0);
    this.floatText(GAME_WIDTH / 2, 150, '狂暴化！', 0xff3333);
  }

  private onContactBoss(): void {
    if (this.over) return;
    const now = this.time.now;
    if (now - this.lastContactAt < 800) return;
    this.lastContactAt = now;
    this.hitPlayer(10);
  }

  private hitPlayer(amount: number): void {
    if (this.over) return;
    const p = this.player;
    if (p.takeHit(amount, this.time.now)) {
      this.floatText(p.x, p.y - 36, `-${amount}`, 0xff4444);
      this.cameras.main.shake(100, 0.003);
    }
  }

  // ——————————————— 主循环 ———————————————

  update(time: number, deltaMs: number): void {
    if (this.over || this.scene.isPaused()) return;

    const store = getGameStore();
    if (store.isUiOpen()) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      (this.boss.arcadeBody).setVelocity(0, 0);
      return;
    }

    this.skills.tick(deltaMs);
    this.player.update(time, deltaMs);
    if (!this.boss.dead) this.boss.tick(deltaMs, this.player);

    for (const m of this.minions) {
      if (!m.isDead()) m.update(time, deltaMs, this.player.x, this.player.y);
    }
    this.minions = this.minions.filter((m) => !m.isDead());

    // HUD
    const hp = store.player.hp;
    const pct = Math.max(0, hp / store.player.maxHp);
    this.playerHpBar.width = 260 * pct;
    this.playerHpText.setText(`${Math.ceil(hp)} / ${store.player.maxHp}`);

    if (hp <= 0 && !this.over) this.handleDefeat();
  }

  // ——————————————— 结算 ———————————————

  private onBossDead(): void {
    if (this.over) return;
    this.over = true;
    const store = getGameStore();
    store.addExp(BOSS_EXP);
    store.addSoulShards(20);
    store.setBossDefeated(true);
    store.setAreaIndex(0);
    void saveGame();

    this.time.delayedCall(1000, () => {
      this.showEndPanel('封印楔获得！', '赤月鬼将已被封印', '#ffcc44', true);
    });
  }

  private handleDefeat(): void {
    if (this.over) return;
    this.over = true;
    this.showEndPanel('武士倒下了', '点击任意位置返回据点', '#ff4444', false);
  }

  private showEndPanel(title: string, subtitle: string, color: string, victory: boolean): void {
    const store = getGameStore();
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.62).setDepth(100);
    const t1 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, title, {
      fontSize: '48px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(101);
    const t2 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, subtitle, {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(101);
    const t3 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, victory ? '获得妖魂碎片 ×20' : 'HP 将在据点恢复', {
      fontSize: '15px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(101);

    const goHome = () => {
      this.input.off('pointerdown', goHome);
      store.setPlayerHp(victory ? store.player.maxHp : PLAYER_START_HP);
      store.setScene(null);
      this.scene.start('HomeScene');
    };
    this.time.delayedCall(300, () => this.input.once('pointerdown', goHome));
    void dim; void t1; void t2; void t3;
  }

  // ——————————————— 预警 / 飘字 ———————————————

  private drawFanWarning(x: number, y: number, radius: number, fanDeg: number): void {
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    const half = Phaser.Math.DegToRad(fanDeg / 2);
    const g = this.add.graphics();
    g.fillStyle(0xff4444, 0.32);
    g.lineStyle(3, 0xff2222, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, radius, angle - half, angle + half);
    g.closePath();
    g.fillPath();
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: BOSS_SWIPE_WINDUP_MS, onComplete: () => g.destroy() });
  }

  private drawCircleWarning(x: number, y: number, radius: number, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 0.28);
    g.lineStyle(4, color, 1);
    g.fillCircle(x, y, radius);
    g.strokeCircle(x, y, radius);
    this.tweens.add({ targets: g, alpha: 0.75, yoyo: true, repeat: 3, duration: 150 });
    this.time.delayedCall(600, () => this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() }));
  }

  private floatText(x: number, y: number, text: string, color: number): void {
    const t = this.add.text(x, y, text, {
      fontSize: '18px', color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: t, y: y + DAMAGE_FLOAT_UP, alpha: 0,
      duration: DAMAGE_FLOAT_DURATION_MS, ease: 'Quad.easeOut', onComplete: () => t.destroy(),
    });
  }

  // ——————————————— 几何工具 ———————————————

  private circleInRect(cx: number, cy: number, r: number, rect: Phaser.Geom.Rectangle): boolean {
    const nx = Phaser.Math.Clamp(cx, rect.left, rect.right);
    const ny = Phaser.Math.Clamp(cy, rect.top, rect.bottom);
    return Phaser.Math.Distance.Between(cx, cy, nx, ny) <= r;
  }

  private circleNearSegment(cx: number, cy: number, r: number, x1: number, y1: number, x2: number, y2: number): boolean {
    // 点到线段最短距离（Phaser 4 的 Geom.Point 已移除，手算避免类型问题）
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Phaser.Math.Clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
    const nx = x1 + t * dx;
    const ny = y1 + t * dy;
    return Phaser.Math.Distance.Between(cx, cy, nx, ny) <= r;
  }
}
