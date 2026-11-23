import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_COLOR,
  GROUND_COLOR,
  TILE_SIZE,
  WALL_COLOR,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  SKILL_Q_DASH_DISTANCE,
  SKILL_Q_WIDTH,
  ONI_HP,
  ONI_GOLD_REWARD_MAX,
  ONI_GOLD_REWARD_MIN,
  DAMAGE_FLOAT_UP,
  DAMAGE_FLOAT_DURATION_MS,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/enemies/Enemy.js';
import { RedOni } from '../entities/enemies/RedOni.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { useGameStore } from '@/store/gameStore.js';

/**
 * 战斗场景（Phase 1 版本）。
 *
 * 新增：
 * - 刷 3 只赤鬼（RedOni），组成 MVP Wave
 * - Player/Enemy ↔ Wall collider
 * - Player ↔ Enemy collider（物理推开 + 伤害 event）
 * - 普攻矩形判定 + Q 居合斩路径判定
 * - Enemy.attack event → 扣 Player HP
 * - Enemy.dead event → 加金币 + 飘字
 * - 胜负面板 + 重开按钮
 * - HUD 显示 Q 冷却
 */
export class BattleScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private skills = new SkillSystem();

  // —— UI ——
  private hpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private qCooldownOverlay!: Phaser.GameObjects.Rectangle;
  private resultPanel!: Phaser.GameObjects.Container;
  private resultPanelVisible = false;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    useGameStore.getState().resetForBattle(500);
    useGameStore.getState().setScene('battle');

    this.drawGround();
    this.buildWalls();
    this.spawnPlayer();
    this.spawnWave();
    this.createHUD();
    this.createResultPanel();

    // —— 物理 colliders（用 as any cast 绕开 Phaser ArcadeColliderType 严格 overload 顺序）——
    this.physics.add.collider(this.player as unknown as any, this.walls);
    this.physics.add.collider(this.player as unknown as any, this.enemies as unknown as any);
    this.physics.add.collider(this.enemies as unknown as any, this.walls);
    this.physics.add.collider(this.enemies as unknown as any, this.enemies as unknown as any);

    // —— 事件监听 ——
    this.events.on('player:attack-hit', this.onPlayerAttackHit, this);
    this.events.on('skill:q-start', this.onSkillQStart, this);
    this.events.on('enemy:attack', this.onEnemyAttack, this);
    this.events.on('enemy:dead', this.onEnemyDead, this);

    this.input.on('pointerdown', this.onResultPanelClick, this);
  }

  shutdown(): void {
    this.events.off('player:attack-hit', this.onPlayerAttackHit, this);
    this.events.off('skill:q-start', this.onSkillQStart, this);
    this.events.off('enemy:attack', this.onEnemyAttack, this);
    this.events.off('enemy:dead', this.onEnemyDead, this);
    this.input.off('pointerdown', this.onResultPanelClick, this);
  }

  // —— 主循环 ——
  update(_time: number, deltaMs: number): void {
    if (this.resultPanelVisible) return;  // 面板显示时暂停世界

    this.skills.tick(deltaMs);
    this.player.update(_time, deltaMs);
    for (const e of this.enemies) {
      if (!e.isDead()) e.update(_time, deltaMs, this.player.x, this.player.y);
    }
    // 清理已 dead 且 destroy 的敌人
    this.enemies = this.enemies.filter((e) => !e.isDead());

    this.refreshHUD();
    this.checkVictory();
  }

  // ——————————————— 场景搭建 ———————————————
  private drawGround(): void {
    const g = this.add.graphics();
    g.fillStyle(GROUND_COLOR, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    g.lineStyle(1, GRID_COLOR, 0.5);
    for (let x = 0; x <= GAME_WIDTH; x += TILE_SIZE) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += TILE_SIZE) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }
  }

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();
    const W = GAME_WIDTH, H = GAME_HEIGHT, T = TILE_SIZE;
    const rects: [number, number, number, number][] = [
      [0, 0, W, T],
      [0, H - T, W, T],
      [0, 0, T, H],
      [W - T, 0, T, H],
      [280, 200, T * 3, T * 2],
      [720, 360, T * 4, T * 3],
      [200, 540, T * 5, T],
      [200, 540, T, T * 3],
      [1000, 560, T * 2, T * 2],
    ];
    for (const [x, y, w, h] of rects) {
      const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, WALL_COLOR, 1);
      rect.setStrokeStyle(2, 0x808090, 1);
      this.physics.add.existing(rect, true);
      this.walls.add(rect);
    }
  }

  private spawnPlayer(): void {
    this.player = new Player(this, 160, 160, this.skills);
  }

  private spawnWave(): void {
    // 3 只赤鬼，分散位置 —— 避开玩家出生点
    const positions: [number, number][] = [
      [640, 300],
      [900, 450],
      [520, 600],
    ];
    for (const [x, y] of positions) {
      this.enemies.push(new RedOni(this, x, y));
    }
  }

  // ——————————————— 事件处理 ———————————————
  private onPlayerAttackHit(_args: { x: number; y: number; facing: 'left' | 'right' }): void {
    const { rect } = this.skills.resolveNormalAttack({
      x: this.player.x,
      y: this.player.y,
      getFacing: () => this.player.getFacing(),
    });
    let target: Enemy | null = null;
    let minDist = Infinity;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Geom.Rectangle.Contains(rect, e.x, e.y)) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < minDist) { minDist = d; target = e; }
      }
    }
    if (target) {
      target.takeDamage(PLAYER_ATTACK_DAMAGE);
      this.showDamageFloat(target.x, target.y - 20, PLAYER_ATTACK_DAMAGE, false);
    }
  }

  private onSkillQStart(args: {
    dx: number; distance: number; width: number; damage: number;
  }): void {
    const { dx, distance, width, damage } = args;
    // 路径判定：从玩家位置延伸 dx*distance 的矩形
    const cx = this.player.x + dx * (distance / 2);
    const cy = this.player.y;
    const rect = new Phaser.Geom.Rectangle(
      cx - (distance / 2),
      cy - width / 2,
      distance,
      width,
    );
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Geom.Rectangle.Contains(rect, e.x, e.y)) {
        e.takeDamage(damage);
        this.showDamageFloat(e.x, e.y - 20, damage, true);
      }
    }
    // 短暂残影
    this.tweens.add({
      targets: this,
      alpha: 0.4,
      duration: 80,
      yoyo: true,
      repeat: 3,
    });
    void PLAYER_ATTACK_RANGE;
  }

  private onEnemyAttack(args: { damage: number }): void {
    useGameStore.getState().damagePlayer(args.damage);
    const { hp } = useGameStore.getState().player;
    this.showDamageFloat(this.player.x, this.player.y - 20, args.damage, false);
    if (hp <= 0) this.showResult(false);
  }

  private onEnemyDead(args: { enemy: Enemy; x: number; y: number }): void {
    const gold = Phaser.Math.Between(ONI_GOLD_REWARD_MIN, ONI_GOLD_REWARD_MAX);
    useGameStore.getState().addGold(gold);
    // 掉金币粒子（简化：一个小浮动数字 "+X金"）
    this.showGoldFloat(args.x, args.y - 10, gold);
    void args.enemy;
  }

  // ——————————————— 飘字 & HUD ———————————————
  private showDamageFloat(x: number, y: number, dmg: number, big: boolean): void {
    const txt = this.add.text(x, y, `-${dmg}`, {
      fontFamily: 'monospace',
      fontSize: big ? '24px' : '16px',
      color: big ? '#ffcc33' : '#ffffff',
      fontStyle: big ? 'bold' : 'normal',
    }).setOrigin(0.5, 1).setDepth(50);

    this.tweens.add({
      targets: txt,
      y: y + DAMAGE_FLOAT_UP,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: DAMAGE_FLOAT_DURATION_MS,
      ease: 'Cubic.Out',
      onComplete: () => txt.destroy(),
    });
  }

  private showGoldFloat(x: number, y: number, gold: number): void {
    const txt = this.add.text(x, y, `+${gold}金`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffd766',
    }).setOrigin(0.5, 1).setDepth(50);

    this.tweens.add({
      targets: txt,
      y: y - 20,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => txt.destroy(),
    });
  }

  private createHUD(): void {
    this.hpText = this.add.text(24, 20, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#e5e5e5',
    }).setScrollFactor(0).setDepth(100);

    this.levelText = this.add.text(24, 44, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#9aa0a6',
    }).setScrollFactor(0).setDepth(100);

    // 金币
    this.add.text(24, 68, '金币', {
      fontFamily: 'monospace', fontSize: '12px', color: '#9aa0a6',
    }).setScrollFactor(0).setDepth(100);
    // 金币数字动态显示在 refreshHUD 里

    // Q 技能图标（底部中央）
    const iconBg = this.add.rectangle(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 64, 48, 48, 0x222228, 1)
      .setStrokeStyle(2, 0x444450, 1).setDepth(100).setScrollFactor(0);
    this.add.text(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 64, 'Q', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e5e5e5',
    }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

    // Q 冷却遮罩：在图标上方画一个圆形进度
    this.qCooldownOverlay = this.add.rectangle(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 64, 48, 48, 0x000000, 0.6)
      .setDepth(102).setScrollFactor(0);

    void iconBg;

    // 右上：操作提示 + 波次剩余
    this.add.text(GAME_WIDTH - 360, 20,
      '[ WASD / 方向键 ] 移动\n[ 空格 ] 普攻（3 连斩）\n[ Q ] 居合斩\n[ SPACE ] 普攻',
      {
        fontFamily: 'monospace', fontSize: '13px', color: '#9aa0a6', align: 'right',
      }
    ).setScrollFactor(0).setDepth(100);

    this.add.text(GAME_WIDTH - 360, GAME_HEIGHT - 48,
      `Phase 1 · MVP 0.1 核心战斗 · 剩余敌人: ${this.enemies.length}`,
      { fontFamily: 'monospace', fontSize: '12px', color: '#6a6a72' },
    ).setScrollFactor(0).setDepth(100);
  }

  private refreshHUD(): void {
    const s = useGameStore.getState();
    this.hpText.setText(`HP ${s.player.hp} / ${s.player.maxHp}`);
    this.levelText.setText(`Lv.${s.player.level}  金币: ${s.resources.gold}`);

    // Q 冷却遮罩：按剩余比例显示
    const MAX_Q_CD = 5000;
    const remaining = this.skills.remainingMs('Q');
    if (remaining > 0) {
      const ratio = remaining / MAX_Q_CD;
      this.qCooldownOverlay.setScale(1, ratio);
      this.qCooldownOverlay.setVisible(true);
    } else {
      this.qCooldownOverlay.setVisible(false);
    }
  }

  // ——————————————— 胜负面板 ———————————————
  private createResultPanel(): void {
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setDepth(200).setScrollFactor(0);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 480, 260, 0x1a1a20, 1)
      .setStrokeStyle(2, 0x666670, 1).setDepth(201).setScrollFactor(0);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, '', {
      fontFamily: 'monospace', fontSize: '32px', color: '#e5e5e5',
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    const detail = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa0a6', align: 'center',
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    const btnHint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80,
      '点击屏幕任意位置重新挑战',
      { fontFamily: 'monospace', fontSize: '14px', color: '#6a6a72' },
    ).setOrigin(0.5).setDepth(202).setScrollFactor(0);

    this.resultPanel = this.add.container(0, 0, [dim, panel, title, detail, btnHint]);
    this.resultPanel.setVisible(false).setScrollFactor(0);
    void SKILL_Q_DASH_DISTANCE; void SKILL_Q_WIDTH;
  }

  private showResult(victory: boolean): void {
    this.resultPanel.setVisible(true);
    this.resultPanelVisible = true;
    const container = this.resultPanel;
    const title = container.list[2] as Phaser.GameObjects.Text;
    const detail = container.list[3] as Phaser.GameObjects.Text;

    const kills = 3 - this.enemies.length;
    const gold = useGameStore.getState().resources.gold;
    title.setText(victory ? '胜利！' : '失败...')
      .setColor(victory ? '#ffcc33' : '#cc6666');
    detail.setText(`击杀: ${kills} / 3\n获得金币: ${gold}\n当前等级: Lv.${useGameStore.getState().player.level}`);

    useGameStore.getState().setCombatResult({ victory, kills, goldEarned: gold });
    void ONI_HP; void ONI_GOLD_REWARD_MAX; void ONI_GOLD_REWARD_MIN;
  }

  private checkVictory(): void {
    if (this.resultPanelVisible) return;
    if (this.enemies.length === 0) this.showResult(true);
  }

  private onResultPanelClick(): void {
    if (!this.resultPanelVisible) return;
    // 重开：reset 玩家 HP、敌人、金币
    useGameStore.getState().resetForBattle(500);
    useGameStore.getState().setCombatResult(null);
    this.resultPanel.setVisible(false);
    this.resultPanelVisible = false;

    // 清空敌人数组 + 重刷
    for (const e of [...this.enemies]) {
      e.destroy();
    }
    this.enemies = [];
    this.spawnWave();
    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.player, this.enemies);

    // 玩家回起点
    this.player.x = 160;
    this.player.y = 160;
    const body = (this.player as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    body.setVelocity(0, 0);

    this.skills.reset();
  }
}
