import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_COLOR, GRID_COLOR, BOSS_EXP, PLAYER_START_HP,
  PLAYER_RADIUS,
  BOSS_SWIPE_WINDUP_MS, BOSS_SLAM_WINDUP_MS,
  DAMAGE_FLOAT_UP, DAMAGE_FLOAT_DURATION_MS,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { BossAkatsuki } from '../entities/enemies/BossAkatsuki.js';
import { RedOni } from '../entities/enemies/RedOni.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { getGameStore } from '../../store/gameStore.js';

/**
 * BossScene —— 独立场景管理赤月鬼将 BOSS 战。
 * Player 自己处理移动 + 普攻 + 技能按键（SkillSystem tick）。
 * BossScene 只负责：Boss 碰撞 + boss:* 事件监听 + 预警圆 + 伤害判定 + 胜负面板。
 */
export class BossScene extends Phaser.Scene {
  private player!: Player;
  private boss!: BossAkatsuki;
  private enemies: RedOni[] = [];

  private bossHpInner!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'BossScene' });
  }

  create(): void {
    const store = getGameStore();
    store.setScene('BossScene');
    store.setPaused(false);
    store.setPlayerHp(PLAYER_START_HP);

    // 背景：地下神社
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, GROUND_COLOR);
    const grid = this.add.graphics();
    grid.lineStyle(1, GRID_COLOR, 0.4);
    for (let x = 0; x <= GAME_WIDTH; x += 40) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) grid.lineBetween(0, y, GAME_WIDTH, y);
    // 红色柱子装饰
    const pillarGfx = this.add.graphics();
    pillarGfx.fillStyle(0x551111, 0.6);
    [120, GAME_WIDTH - 120].forEach((x) => pillarGfx.fillRect(x - 16, 0, 32, GAME_HEIGHT));

    // 边界墙体（防止 Boss/玩家跑出）
    const walls = this.add.group();
    const rects: [number, number, number, number][] = [
      [0, 0, GAME_WIDTH, 24],
      [0, GAME_HEIGHT - 24, GAME_WIDTH, 24],
      [0, 0, 24, GAME_HEIGHT],
      [GAME_WIDTH - 24, 0, 24, GAME_HEIGHT],
    ];
    rects.forEach(([x, y, w, h]) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x5a5a64);
      this.physics.add.existing(r, true);
      walls.add(r);
    });

    // 玩家
    const skills = new SkillSystem();
    this.player = new Player(this, GAME_WIDTH / 2 - 260, GAME_HEIGHT / 2 + 80, skills);

    // Boss
    this.boss = new BossAkatsuki(this, GAME_WIDTH / 2 + 140, GAME_HEIGHT / 2);
    this.boss.initBody();

    // 物理碰撞
    this.physics.add.collider(
      this.player.body as Phaser.Physics.Arcade.Body,
      walls.getChildren() as Phaser.GameObjects.Rectangle[],
    );
    this.physics.add.collider(
      this.boss.body as Phaser.Physics.Arcade.Body,
      walls.getChildren() as Phaser.GameObjects.Rectangle[],
    );

    // Boss HP 条（顶部中央）
    this.add.rectangle(GAME_WIDTH / 2, 56, 640, 20, 0x22222a, 0.9);
    this.bossHpInner = this.add.rectangle(GAME_WIDTH / 2 - 320, 56, 640, 14, 0xff2222, 1).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH / 2, 32, '赤月鬼将', {
      fontSize: '22px', color: '#ff8888', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // —— Boss 事件监听 ——
    this.events.on('boss:hit', (p: { hp: number; maxHp: number; amount: number }) => {
      const pct = p.hp / p.maxHp;
      this.bossHpInner.width = Math.max(0, 640 * pct);
      this.addFloatingText(this.boss.x, this.boss.y - 48, `-${p.amount}`, 0xffaa33);
    });

    this.events.on('boss:swipe', (p: { x: number; y: number; radius: number; fanDeg: number; damage: number }) => {
      this.drawSwipeWarning(p.x, p.y, p.radius, p.fanDeg);
      this.time.delayedCall(BOSS_SWIPE_WINDUP_MS, () => {
        const dx = this.player.x - p.x, dy = this.player.y - p.y;
        if (Math.hypot(dx, dy) <= p.radius + PLAYER_RADIUS) this.damagePlayer(p.damage);
      });
    });

    this.events.on('boss:slam', (p: { x: number; y: number; radius: number; damage: number }) => {
      this.drawCircleWarning(p.x, p.y, p.radius, 0xff6600);
      this.time.delayedCall(BOSS_SLAM_WINDUP_MS, () => {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) as number;
        if (dist <= p.radius) this.damagePlayer(p.damage);
        this.cameras.main.shake(200, 0.004);
      });
    });

    this.events.on('boss:ghostfire', (p: { x: number; y: number; radius: number; damage: number }) => {
      this.drawCircleWarning(p.x, p.y, p.radius, 0xff33cc);
      this.time.delayedCall(500, () => {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) as number;
        if (dist <= p.radius) this.damagePlayer(p.damage);
      });
    });

    this.events.on('boss:summon', () => {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 160 + Math.random() * 60;
        this.enemies.push(new RedOni(this, this.boss.x + Math.cos(a) * r, this.boss.y + Math.sin(a) * r));
      }
    });

    this.events.on('boss:dead', () => this.handleVictory());
  }

  update(_time: number, deltaMs: number): void {
    if (this.scene.isPaused()) return;
    if (this.boss.dead) return;
    // Player.update() 由 Phaser 自动路由；Boss tick 手动调用
    this.boss.tick(deltaMs, this.player);
  }

  private damagePlayer(amount: number): void {
    const store = getGameStore();
    const newHp = store.player.hp - amount;
    store.setPlayerHp(newHp);
    this.addFloatingText(this.player.x, this.player.y - 40, `-${amount}`, 0xff4444);
    if (newHp <= 0) this.handleDefeat();
  }

  // —— 预警绘制 ——
  private drawSwipeWarning(x: number, y: number, radius: number, fanDeg: number): void {
    const g = this.add.graphics();
    g.fillStyle(0xff4444, 0.35);
    g.lineStyle(3, 0xff2222, 1);
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    const half = Phaser.Math.DegToRad(fanDeg / 2);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, radius, angle - half, angle + half);
    g.closePath();
    g.fillPath();
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  private drawCircleWarning(x: number, y: number, radius: number, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 0.3);
    g.lineStyle(4, color, 1);
    g.fillCircle(x, y, radius);
    g.strokeCircle(x, y, radius);
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  private addFloatingText(x: number, y: number, text: string, color: number): void {
    const t = this.add.text(x, y, text, {
      fontSize: '18px', color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t, y: y + DAMAGE_FLOAT_UP, alpha: 0,
      duration: DAMAGE_FLOAT_DURATION_MS, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private handleVictory(): void {
    const store = getGameStore();
    store.addExp(BOSS_EXP);
    store.addSoulShards(20);
    this.time.delayedCall(1000, () => {
      this.scene.pause();
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, '封印楔获得！', {
        fontSize: '48px', color: '#ffcc44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, '赤月鬼将已被封印', {
        fontSize: '24px', color: '#ffffff',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '点击任意位置返回据点', {
        fontSize: '18px', color: '#aaaaaa',
      }).setOrigin(0.5);
      this.input.once('pointerdown', () => {
        store.setScene(null);
        this.scene.start('HomeScene');
      });
    });
  }

  private handleDefeat(): void {
    this.scene.pause();
    const store = getGameStore();
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '武士倒下了', {
      fontSize: '48px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '点击任意位置返回据点', {
      fontSize: '18px', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.input.once('pointerdown', () => {
      store.setPlayerHp(PLAYER_START_HP);
      store.setScene(null);
      this.scene.start('HomeScene');
    });
  }
}
