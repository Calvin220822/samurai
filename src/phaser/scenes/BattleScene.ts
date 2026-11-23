import Phaser from 'phaser';
import {
  GAME_HEIGHT, GAME_WIDTH, TILE_SIZE, WALL_COLOR,
  PLAYER_ATTACK_DAMAGE, PLAYER_ATTACK_RANGE,
  SKILL_Q_DASH_DISTANCE, SKILL_Q_WIDTH,
  SKILL_W_RADIUS, SKILL_W_DAMAGE,
  SKILL_R_FAN_RADIUS,
  DAMAGE_FLOAT_UP, DAMAGE_FLOAT_DURATION_MS,
  ONI_EXP, BONE_EXP, WRAITH_EXP, ELITE_EXP,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import type { Enemy } from '../entities/enemies/Enemy.js';
import { RedOni } from '../entities/enemies/RedOni.js';
import { BoneSamurai } from '../entities/enemies/BoneSamurai.js';
import { Wraith } from '../entities/enemies/Wraith.js';
import { EliteGeneral } from '../entities/enemies/EliteGeneral.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { LevelSystem } from '../systems/LevelSystem.js';
import { soulSystem } from '../systems/SoulSystem.js';
import { useGameStore } from '@/store/gameStore.js';
import { EQUIPMENT_DB, COMMON_DROP_POOL, rollFromPool, RARITY_COLOR } from '@/phaser/data/equipment.js';
import { SOUL_DB } from '@/phaser/data/souls.js';

/**
 * 战斗场景 Phase 2 版本。
 *
 * 波次：2 赤鬼 + 1 骸骨武士 + 1 怨灵 + 1 精英鬼将
 * 关卡胜利条件：精英鬼将死亡（所有普怪可以一直重生维持压力）
 */
export class BattleScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: { x: number; y: number; dx: number; dy: number; life: number; body: Phaser.Physics.Arcade.Body; dmg: number; }[] = [];
  private drops: Phaser.GameObjects.Container[] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private skills = new SkillSystem();
  private levels = new LevelSystem();

  private areaIndex = 0;
  private areaClear = false;
  private areaDoorVisible = false;
  private areaDoorText!: Phaser.GameObjects.Text;
  private areaDoorRect!: Phaser.GameObjects.Rectangle;

  // —— HUD ——
  private hpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private expBar!: { outer: Phaser.GameObjects.Rectangle; inner: Phaser.GameObjects.Rectangle };
  private skillOverlays: Record<'Q' | 'W' | 'E' | 'R', Phaser.GameObjects.Rectangle> = {} as any;
  private resultPanel!: Phaser.GameObjects.Container;
  private resultPanelVisible = false;

  private kills = 0;
  private totalExpEarned = 0;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    // 不重置 HP：区域间保留血量，据点休息才回满
    useGameStore.getState().resetCombat();
    useGameStore.getState().setScene('BattleScene');
    useGameStore.getState().setUiPanel('none');
    this.kills = 0; this.totalExpEarned = 0;
    this.areaClear = false; this.areaDoorVisible = false;

    // 读取上一 scene 传入的 areaIndex（HomeScene 出征时传 { areaIndex: 0 }）
    const data = (this.scene.settings.data ?? {}) as { areaIndex?: number };
    this.areaIndex = Math.max(0, Math.min(3, data.areaIndex ?? 0));

    this.drawGround();
    this.buildWalls();
    this.spawnPlayer();
    this.spawnWave();
    this.createHUD();
    this.createResultPanel();
    this.createAreaDoor();

    // Colliders
    this.physics.add.collider(this.player as unknown as any, this.walls);
    this.physics.add.collider(this.player as unknown as any, this.enemies as unknown as any);
    this.physics.add.collider(this.enemies as unknown as any, this.walls);
    this.physics.add.collider(this.enemies as unknown as any, this.enemies as unknown as any);

    // Events
    this.events.on('player:attack-hit', this.onPlayerAttackHit, this);
    this.events.on('skill:q-start', this.onSkillQStart, this);
    this.events.on('skill:w-start', this.onSkillWStart, this);
    this.events.on('skill:e-start', this.onSkillEStart, this);
    this.events.on('skill:r-charge', this.onSkillRCharge, this);
    this.events.on('skill:r-start', this.onSkillRStart, this);
    this.events.on('enemy:attack', this.onEnemyAttack, this);
    this.events.on('enemy:dead', this.onEnemyDead, this);
    this.events.on('elite:summon', this.onEliteSummon, this);
    this.events.on('elite:ghostfire', this.onEliteGhostfire, this);
    this.events.on('elite:phase2-enter', this.onElitePhase2Enter, this);

    this.input.on('pointerdown', this.onResultPanelClick, this);
    this.input.on('pointerdown', this.onDropClick, this);
    // Esc 角色面板由 React GameOverlay 统一处理（避免与场景暂停后输入失效冲突）
    this.input.keyboard?.on('keydown-F', this.onAreaDoorInteract, this);

    // 区域 Banner 动画
    this.showAreaBanner();

    // 场景销毁时统一解绑（scene.restart / scene.start 都会触发）
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('player:attack-hit', this.onPlayerAttackHit, this);
      this.events.off('skill:q-start', this.onSkillQStart, this);
      this.events.off('skill:w-start', this.onSkillWStart, this);
      this.events.off('skill:e-start', this.onSkillEStart, this);
      this.events.off('skill:r-charge', this.onSkillRCharge, this);
      this.events.off('skill:r-start', this.onSkillRStart, this);
      this.events.off('enemy:attack', this.onEnemyAttack, this);
      this.events.off('enemy:dead', this.onEnemyDead, this);
      this.events.off('elite:summon', this.onEliteSummon, this);
      this.events.off('elite:ghostfire', this.onEliteGhostfire, this);
      this.events.off('elite:phase2-enter', this.onElitePhase2Enter, this);
      this.input.off('pointerdown', this.onResultPanelClick, this);
      this.input.off('pointerdown', this.onDropClick, this);
      this.input.keyboard?.off('keydown-F', this.onAreaDoorInteract, this);
    });
  }

  update(time: number, deltaMs: number): void {
    if (this.resultPanelVisible) return;

    // React 面板打开时冻结模拟（技能冷却 / 敌人 AI 全部暂停）
    if (useGameStore.getState().isUiOpen()) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }

    this.skills.tick(deltaMs);
    this.player.update(time, deltaMs);
    for (const e of this.enemies) {
      if (!e.isDead()) e.update(time, deltaMs, this.player.x, this.player.y);
    }
    this.enemies = this.enemies.filter((e) => !e.isDead());

    this.updateProjectiles(time, deltaMs);
    this.refreshHUD();
  }

  // ——————————————— 场景搭建 ———————————————
  /** 区域主题：四个区域用不同地面色调 + 装饰，制造推进感 */
  private drawGround(): void {
    const themes = [
      { ground: 0x3a3226, grid: 0x4a4033 },  // 枫隐村村口：土黄
      { ground: 0x22331f, grid: 0x2f4a2a },  // 废弃竹林：墨绿
      { ground: 0x2b2f3f, grid: 0x3b4157 },  // 神社前庭：青石
      { ground: 0x2a1717, grid: 0x452222 },  // 地下神社：暗红
    ];
    const t = themes[this.areaIndex] ?? themes[0];

    const g = this.add.graphics();
    g.fillStyle(t.ground, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(1, t.grid, 0.55);
    for (let x = 0; x <= GAME_WIDTH; x += TILE_SIZE) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += TILE_SIZE) g.lineBetween(0, y, GAME_WIDTH, y);

    this.drawAreaDecor();
  }

  private drawAreaDecor(): void {
    const d = this.add.graphics();
    if (this.areaIndex === 0) {
      // 鸟居 + 参道
      d.fillStyle(0x8a2b22, 0.9);
      d.fillRect(GAME_WIDTH / 2 - 120, 80, 14, 110);
      d.fillRect(GAME_WIDTH / 2 + 106, 80, 14, 110);
      d.fillRect(GAME_WIDTH / 2 - 140, 74, 280, 12);
      d.fillRect(GAME_WIDTH / 2 - 124, 98, 248, 8);
      d.fillStyle(0x4a4033, 0.5);
      for (let y = 200; y < GAME_HEIGHT; y += 64) d.fillRect(GAME_WIDTH / 2 - 28, y, 56, 40);
    } else if (this.areaIndex === 1) {
      // 竹竿
      for (let i = 0; i < 18; i++) {
        const x = 40 + ((i * 137) % (GAME_WIDTH - 80));
        const seg = 30 + ((i * 53) % 40);
        d.fillStyle(0x4f7a3a, 0.55);
        d.fillRect(x, 40 + (i % 3) * 30, 6, GAME_HEIGHT - 120);
        for (let y = 60; y < GAME_HEIGHT - 100; y += seg) {
          d.fillStyle(0x2f4a2a, 0.7);
          d.fillRect(x - 2, y, 10, 3);
        }
      }
    } else if (this.areaIndex === 2) {
      // 石灯 + 石板
      for (let i = 0; i < 4; i++) {
        const x = 160 + i * 320;
        d.fillStyle(0x5a5a66, 0.8);
        d.fillRect(x - 10, 150, 20, 46);
        d.fillStyle(0xffcc66, 0.45);
        d.fillCircle(x, 142, 14);
        d.lineStyle(2, 0x777788, 0.35);
        d.strokeRect(x - 40, 300 + (i % 2) * 120, 80, 60);
      }
    } else {
      // 地下神社：红柱 + 骨堆
      d.fillStyle(0x5a1a1a, 0.65);
      [200, GAME_WIDTH - 200].forEach((x) => d.fillRect(x - 12, 0, 24, GAME_HEIGHT));
      d.fillStyle(0xcfc7b0, 0.25);
      for (let i = 0; i < 6; i++) {
        const x = 120 + i * 200;
        const y = 480 + (i % 3) * 40;
        d.fillCircle(x, y, 9);
        d.fillCircle(x + 14, y - 6, 7);
        d.fillCircle(x - 14, y - 4, 7);
      }
    }
  }

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();
    const W = GAME_WIDTH, H = GAME_HEIGHT, T = TILE_SIZE;
    const rects: [number, number, number, number][] = [
      [0, 0, W, T], [0, H - T, W, T], [0, 0, T, H], [W - T, 0, T, H],
      [280, 200, T * 3, T * 2], [720, 360, T * 4, T * 3],
      [200, 540, T * 5, T], [200, 540, T, T * 3],
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
    this.enemies = [];
    // 按 areaIndex 刷不同敌人（4 个区域，从易到难）
    switch (this.areaIndex) {
      case 0: // 枫隐村村门口
        this.enemies.push(new RedOni(this, 640, 300));
        this.enemies.push(new RedOni(this, 860, 520));
        this.enemies.push(new BoneSamurai(this, 520, 600));
        break;
      case 1: // 废弃竹林
        this.enemies.push(new RedOni(this, 640, 300));
        this.enemies.push(new Wraith(this, 1100, 280));
        this.enemies.push(new Wraith(this, 240, 500));
        this.enemies.push(new BoneSamurai(this, 520, 600));
        break;
      case 2: // 神社前庭（含精英）
        this.enemies.push(new RedOni(this, 400, 200));
        this.enemies.push(new Wraith(this, 1100, 280));
        this.enemies.push(new BoneSamurai(this, 520, 600));
        this.enemies.push(new EliteGeneral(this, 950, 150));
        break;
      case 3: // 地下神社（精英 → 触发 Boss）
        this.enemies.push(new EliteGeneral(this, 950, 300));
        this.enemies.push(new RedOni(this, 400, 500));
        break;
    }
    this.enemies.forEach((e) => this.addCollidersForEnemy(e));
  }

  // —— 区域门：清完怪才出现，按 F → 下一区域 / 跳 Boss ——
  private createAreaDoor(): void {
    this.areaDoorRect = this.add.rectangle(1160, 600, 40, 64, 0x333344)
      .setStrokeStyle(3, 0x88ccff, 1).setVisible(false);
    this.areaDoorText = this.add.text(1160, 640, '', {
      fontSize: '14px', color: '#88ccff', fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false);
  }

  private showAreaDoor(): void {
    if (this.areaDoorVisible) return;
    this.areaDoorVisible = true;
    const isLast = this.areaIndex >= 3;
    this.areaDoorText.setText(isLast ? '→ 地下神社深处（Boss）' : '→ 下一区域').setVisible(true);
    this.areaDoorRect.setVisible(true);
    // 发光脉冲
    this.tweens.add({ targets: this.areaDoorRect, alpha: 0.5, yoyo: true, repeat: -1, duration: 800 });
  }

  private onAreaDoorInteract(): void {
    if (!this.areaDoorVisible || this.scene.isPaused()) return;
    const px = this.player.x, py = this.player.y;
    const dx = px - this.areaDoorRect.x;
    const dy = py - this.areaDoorRect.y;
    if (Math.hypot(dx, dy) > 80) return;  // 没靠近门
    const nextArea = this.areaIndex + 1;
    if (nextArea > 3) {
      // 最后区域清完 → 跳 Boss
      useGameStore.getState().addSoulShards(10);
      this.scene.start('BossScene');
    } else {
      useGameStore.getState().setAreaIndex(nextArea);
      this.scene.restart({ areaIndex: nextArea });
    }
  }

  private showAreaBanner(): void {
    const areaNames = ['枫隐村村门口', '废弃竹林', '神社前庭', '地下神社'];
    const name = areaNames[this.areaIndex] ?? '未知区域';
    const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, name, {
      fontSize: '36px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: banner, alpha: 1, duration: 500, yoyo: true, hold: 1000,
      onComplete: () => banner.destroy(),
    });
  }

  private checkAreaClear(): void {
    if (this.areaClear) return;
    const alive = this.enemies.filter((e) => !e.isDead());
    if (alive.length === 0) {
      this.areaClear = true;
      this.showAreaDoor();
      // 清完精英也直接给胜利反馈
      const hadElite = this.areaIndex >= 2;
      if (hadElite) {
        this.addFloatingText(GAME_WIDTH / 2, GAME_HEIGHT / 2, '区域清完！', 0x88ff88);
      }
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: number): void {
    const t = this.add.text(x, y, text, {
      fontSize: '28px', color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t, y: y - 60, alpha: 0, duration: 1200, onComplete: () => t.destroy(),
    });
  }

  private addCollidersForEnemy(e: Enemy): void {
    this.physics.add.collider(e as unknown as any, this.walls);
    this.physics.add.collider(e as unknown as any, this.enemies.filter((x) => x !== e) as unknown as any);
    this.physics.add.collider(this.player as unknown as any, e as unknown as any);
  }

  // ——————————————— 事件处理 ———————————————
  private onPlayerAttackHit(args: { x: number; y: number; facing: 'left' | 'right'; damage: number }): void {
    const { rect } = this.skills.resolveNormalAttack({
      x: this.player.x, y: this.player.y, getFacing: () => this.player.getFacing(),
    });
    let target: Enemy | null = null; let minDist = Infinity;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Geom.Rectangle.Contains(rect, e.x, e.y)) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < minDist) { minDist = d; target = e; }
      }
    }
    if (target) {
      const dmg = args.damage || PLAYER_ATTACK_DAMAGE;
      target.takeDamage(dmg);
      this.showDamageFloat(target.x, target.y - 20, dmg, false);
      // Phase 3：酒吞童子妖魂 — 普攻命中触发吸血（BattleScene 已有 maybeLifestealFromNormalAttack）
      this.maybeLifestealFromNormalAttack(dmg);
    }
    void args.x; void args.y;
  }

  private onSkillQStart(args: { dx: number; distance: number; width: number; damage: number }): void {
    const cx = this.player.x + args.dx * (args.distance / 2);
    const rect = new Phaser.Geom.Rectangle(cx - args.distance / 2, this.player.y - args.width / 2, args.distance, args.width);
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Geom.Rectangle.Contains(rect, e.x, e.y)) {
        e.takeDamage(args.damage);
        this.showDamageFloat(e.x, e.y - 20, args.damage, true);
      }
    }
    this.tweens.add({ targets: this.player, alpha: 0.4, duration: 80, yoyo: true, repeat: 3 });
    void SKILL_Q_DASH_DISTANCE; void SKILL_Q_WIDTH;
  }

  private onSkillWStart(args: { x: number; y: number; radius: number; damage: number }): void {
    // 圆范围判定
    const circle = new Phaser.Geom.Circle(args.x, args.y, args.radius);
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Geom.Circle.Contains(circle, e.x, e.y)) {
        e.takeDamage(args.damage);
        this.showDamageFloat(e.x, e.y - 20, args.damage, true);
      }
    }
    // 视觉：画一个消失的光环
    const ring = this.add.graphics();
    ring.lineStyle(4, 0xffffff, 0.8);
    ring.strokeCircle(args.x, args.y, 16);
    this.tweens.add({
      targets: this.tweens.addCounter({ from: 16, to: args.radius, duration: 280 }),
      onUpdate: (t: Phaser.Tweens.Tween) => {
        ring.clear();
        ring.lineStyle(4, 0xffffff, 1 - (t.getValue() as number) / args.radius);
        ring.strokeCircle(args.x, args.y, t.getValue() as number);
      },
      onComplete: () => ring.destroy(),
    });
    void SKILL_W_RADIUS; void SKILL_W_DAMAGE;
  }

  private onSkillEStart(args: { x: number; y: number; dx: number; dy: number }): void {
    // 残影：画一个半透明武士 100ms 后消失
    const afterImage = this.add.graphics();
    afterImage.fillStyle(0x3a3a42, 0.4);
    afterImage.fillRoundedRect(-14 + args.x, -22 + args.y, 28, 44, 6);
    afterImage.fillStyle(0xf5f5dc, 0.4);
    afterImage.fillTriangle(-14 + args.x, -22 + args.y, 14 + args.x, -22 + args.y, 0 + args.x, -36 + args.y);
    this.tweens.add({ targets: afterImage, alpha: 0, duration: 200, onComplete: () => afterImage.destroy() });
    void args.dx; void args.dy;
  }

  private onEnemyAttack(args: { damage: number; enemy: Enemy }) {
    // Phase 2 怨灵：远程弹丸在这里做（发射一颗 projectile）
    void args.enemy;
    const hit = this.player.takeHit(args.damage, this.time.now);
    if (hit) {
      this.showDamageFloat(this.player.x, this.player.y - 20, args.damage, false);
      if (useGameStore.getState().player.hp <= 0) this.showResult(false);
    }
  }

  private onEnemyDead(args: { enemy: Enemy; x: number; y: number; goldMin: number; goldMax: number }) {
    this.kills += 1;
    const gold = Phaser.Math.Between(args.goldMin, args.goldMax);
    useGameStore.getState().addGold(gold);
    this.showGoldFloat(args.x, args.y - 10, gold);

    // 经验（按敌人类型）
    let expGained = ONI_EXP;
    let soulShardsGained = 0;
    if (args.enemy instanceof BoneSamurai) expGained = BONE_EXP;
    else if (args.enemy instanceof Wraith) expGained = WRAITH_EXP;
    else if (args.enemy instanceof EliteGeneral) { expGained = ELITE_EXP; soulShardsGained = 5; }

    this.totalExpEarned += expGained;
    const levelUps = this.levels.addExp(expGained);
    if (soulShardsGained > 0) useGameStore.getState().addSoulShards(soulShardsGained);

    if (levelUps.length > 0) {
      const last = levelUps[levelUps.length - 1];
      this.showLevelUp(last);
    }

    // 装备掉落（普通怪 20% / 精英 100% 且直接穿）
    if (args.enemy instanceof EliteGeneral) {
      const eliteDrop = rollFromPool(COMMON_DROP_POOL);
      this.spawnDrop(args.x, args.y, eliteDrop.id);
    } else if (Math.random() < 0.20) {
      const item = rollFromPool(COMMON_DROP_POOL);
      this.spawnDrop(args.x, args.y, item.id);
    }

    // 检查：本区域敌人是否全清？
    this.checkAreaClear();
    void EQUIPMENT_DB;
  }

  private onEliteSummon(args: { count: number }) {
    for (let i = 0; i < args.count; i++) {
      const x = Phaser.Math.Between(this.player.x - 200, this.player.x + 200);
      const y = Phaser.Math.Between(this.player.y - 200, this.player.y + 200);
      const e = new RedOni(this, Phaser.Math.Clamp(x, 48, 1232), Phaser.Math.Clamp(y, 48, 672));
      this.enemies.push(e);
      this.addCollidersForEnemy(e);
    }
    void args;
  }

  // ——————————————— 飘字 ———————————————
  private showDamageFloat(x: number, y: number, dmg: number, big: boolean): void {
    const txt = this.add.text(x, y, `-${dmg}`, {
      fontFamily: 'monospace',
      fontSize: big ? '24px' : '16px',
      color: big ? '#ffcc33' : '#ffffff',
      fontStyle: big ? 'bold' : 'normal',
    }).setOrigin(0.5, 1).setDepth(50);
    this.tweens.add({
      targets: txt, y: y + DAMAGE_FLOAT_UP, alpha: 0, scaleX: 1.2, scaleY: 1.2,
      duration: DAMAGE_FLOAT_DURATION_MS, ease: 'Cubic.Out', onComplete: () => txt.destroy(),
    });
  }
  private showGoldFloat(x: number, y: number, gold: number): void {
    const txt = this.add.text(x, y, `+${gold}金`, { fontFamily: 'monospace', fontSize: '14px', color: '#ffd766' })
      .setOrigin(0.5, 1).setDepth(50);
    this.tweens.add({ targets: txt, y: y - 20, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
  }
  private showLevelUp(info: { newLevel: number; hpGained: number; atkGained: number; defGained: number; skillGained: number; healedHp: number }): void {
    const txt = this.add.text(GAME_WIDTH / 2, 120,
      `升级！Lv.${info.newLevel}  HP+${info.hpGained}  ATK+${info.atkGained}  DEF+${info.defGained}  技能点+${info.skillGained}`,
      { fontFamily: 'monospace', fontSize: '20px', color: '#ffcc33', fontStyle: 'bold' },
    ).setOrigin(0.5).setDepth(150);
    this.tweens.add({ targets: txt, y: 80, alpha: 0, duration: 1500, onComplete: () => txt.destroy() });
    void info.healedHp;
  }

  // ——————————————— 掉落 ———————————————
  private spawnDrop(x: number, y: number, itemId: string): void {
    const item = EQUIPMENT_DB[itemId];
    if (!item) return;
    const c = RARITY_COLOR[item.rarity];
    const container = this.add.container(x, y);
    const rect = this.add.rectangle(0, 0, 24, 24, c, 0.9).setStrokeStyle(2, 0xffffff, 0.8);
    const label = this.add.text(0, 0, item.slot[0].toUpperCase(), {
      fontFamily: 'monospace', fontSize: '12px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([rect, label]);
    (container as any).itemId = itemId;
    this.tweens.add({ targets: container, alpha: 0.85, duration: 2000, yoyo: true, repeat: 99 });
    this.drops.push(container);
  }

  private onDropClick(pointer: Phaser.Input.Pointer): void {
    if (this.resultPanelVisible) return;
    // 点击拾取最近的 drop（距离 pointer 32px 内）
    const p = { x: pointer.x, y: pointer.y };
    for (const d of [...this.drops]) {
      if (!d.active) continue;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y);
      if (dist < 32) {
        const itemId = (d as any).itemId as string;
        const item = EQUIPMENT_DB[itemId];
        if (!item) { d.destroy(); continue; }
        // equipItem 内部会 recomputeDerivedStats，无需再单独调整属性
        useGameStore.getState().equipItem(item.slot, itemId);
        // 显示装备提示
        const txt = this.add.text(d.x, d.y - 20, `装备：${item.name}`, {
          fontFamily: 'monospace', fontSize: '12px', color: '#ffcc33',
        }).setOrigin(0.5);
        this.tweens.add({ targets: txt, y: d.y - 40, alpha: 0, duration: 900, onComplete: () => txt.destroy() });
        d.destroy();
        this.drops = this.drops.filter((x) => x !== d);
        break;
      }
    }
  }

  // ——————————————— HUD ———————————————
  private createHUD(): void {
    this.hpText = this.add.text(24, 20, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#e5e5e5',
    }).setScrollFactor(0).setDepth(100);
    this.levelText = this.add.text(24, 44, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#9aa0a6',
    }).setScrollFactor(0).setDepth(100);
    this.goldText = this.add.text(24, 68, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffd766',
    }).setScrollFactor(0).setDepth(100);

    // EXP 条
    const barY = 110;
    this.expBar = { outer: null as any, inner: null as any };
    this.expBar.outer = this.add.rectangle(120, barY, 200, 14, 0x22222a, 0.8)
      .setStrokeStyle(1, 0x55555f, 1).setScrollFactor(0).setDepth(100);
    this.expBar.inner = this.add.rectangle(20, barY, 0, 10, 0x66cc88, 1)
      .setScrollFactor(0).setDepth(101);
    this.add.text(24, barY - 10, 'EXP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#9aa0a6',
    }).setScrollFactor(0).setDepth(100);

    // 4 个技能图标（底部横向）
    const skillKeys: ('Q' | 'W' | 'E' | 'R')[] = ['Q', 'W', 'E', 'R'];
    const skillLabels = ['居合斩', '旋风斩', '影步', '鬼神斩'];
    const cx = GAME_WIDTH / 2;
    const spacing = 64;
    const keys = ['Q', 'W', 'E', 'R'];  // 对应键盘键
    skillKeys.forEach((k, i) => {
      const x = cx - spacing * 1.5 + i * spacing;
      this.add.rectangle(x, GAME_HEIGHT - 56, 48, 48, 0x222228, 1)
        .setStrokeStyle(2, 0x444450, 1).setDepth(100).setScrollFactor(0);
      this.add.text(x, GAME_HEIGHT - 68, keys[i], {
        fontFamily: 'monospace', fontSize: '18px', color: '#e5e5e5',
      }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
      this.add.text(x, GAME_HEIGHT - 36, skillLabels[i], {
        fontFamily: 'monospace', fontSize: '10px', color: '#9aa0a6',
      }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
      const overlay = this.add.rectangle(x, GAME_HEIGHT - 56, 48, 48, 0x000000, 0.6)
        .setDepth(102).setScrollFactor(0);
      overlay.setVisible(false);
      this.skillOverlays[k] = overlay;
    });

    // 右上操作提示
    this.add.text(GAME_WIDTH - 20, 20,
      '[ WASD / 方向键 ] 移动   [ 空格 ] 普攻\n[ Q ] 居合斩   [ W ] 旋风斩   [ E ] 影步   [ R ] 鬼神斩\n[ Esc ] 角色面板   [ F ] 区域门',
      { fontFamily: 'monospace', fontSize: '13px', color: '#9aa0a6', align: 'right' },
    ).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 48,
      'Phase 5 · MVP 1.0 · 清完区域后到蓝色门按 F 前进',
      { fontFamily: 'monospace', fontSize: '12px', color: '#6a6a72' },
    ).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
  }

  private refreshHUD(): void {
    const s = useGameStore.getState();
    this.hpText.setText(`HP ${s.player.hp} / ${s.player.maxHp}`);
    this.levelText.setText(`Lv.${s.player.level}  ATK:${s.getEffectiveAtk()}  DEF:${s.getEffectiveDef()}  技能点:${s.player.skillPoints}`);
    this.goldText.setText(`金币: ${s.resources.gold}  击杀: ${this.kills}`);

    // EXP 条（阈值来自 store 派生的 levelExp）
    const need = Math.max(1, s.player.levelExp);
    const ratio = Phaser.Math.Clamp(s.player.exp / need, 0, 1);
    const barW = ratio * 196;
    this.expBar.inner.width = barW;
    this.expBar.inner.x = 24 + barW / 2;

    // 4 技能冷却遮罩（最大冷却来自技能系统实际值，含成长缩减）
    for (const key of ['Q', 'W', 'E', 'R'] as const) {
      const remaining = this.skills.remainingMs(key);
      const max = Math.max(1, this.skills.getMaxCooldown(key));
      const overlay = this.skillOverlays[key] as Phaser.GameObjects.Rectangle;
      if (remaining > 0) {
        overlay.setVisible(true);
        overlay.setScale(1, remaining / max);
      } else {
        overlay.setVisible(false);
      }
    }
  }

  // ——————————————— 胜负面板 ———————————————
  private createResultPanel(): void {
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setDepth(200).setScrollFactor(0);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 320, 0x1a1a20, 1)
      .setStrokeStyle(2, 0x666670, 1).setDepth(201).setScrollFactor(0);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, '', {
      fontFamily: 'monospace', fontSize: '36px', color: '#e5e5e5',
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    const detail = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa0a6', align: 'center',
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    const btn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90,
      '点击屏幕任意位置返回道场',
      { fontFamily: 'monospace', fontSize: '14px', color: '#6a6a72' },
    ).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    this.resultPanel = this.add.container(0, 0, [dim, panel, title, detail, btn]);
    this.resultPanel.setVisible(false).setScrollFactor(0);
  }

  private showResult(victory: boolean): void {
    if (this.resultPanelVisible) return;
    this.resultPanel.setVisible(true);
    this.resultPanelVisible = true;
    const container = this.resultPanel;
    const title = container.list[2] as Phaser.GameObjects.Text;
    const detail = container.list[3] as Phaser.GameObjects.Text;

    const s = useGameStore.getState();
    title.setText(victory ? '关卡胜利！' : '战斗失败...')
      .setColor(victory ? '#ffcc33' : '#cc6666');
    detail.setText(
      `击杀: ${this.kills}  总经验: ${this.totalExpEarned}\n` +
      `金币: ${s.resources.gold}  等级: Lv.${s.player.level}\n` +
      (victory ? '区域已肃清，返回道场继续冒险！' : '武士倒下了... 回据点休整再来'),
    );
    useGameStore.getState().setCombatResult({
      victory, kills: this.kills, goldEarned: s.resources.gold,
    });
  }

  private onResultPanelClick(): void {
    if (!this.resultPanelVisible) return;
    this.resultPanelVisible = false;
    this.resultPanel.setVisible(false);

    // 战败：回据点休整（回满血），不再原地重开
    useGameStore.getState().restAtHome();
    useGameStore.getState().setAreaIndex(0);
    this.scene.start('HomeScene');
  }

  // ——————————————— Projectile 系统占位 —— Phase 3 怨灵远程补齐 ———————————————
  // Phase 2 怨灵远程攻击未启用，updateProjectiles / _projectilePlaceholder 留待 Phase 3 实现
  // Wraith 的 windup 期间仍只近身物理攻击。后续改远程时直接解开这里即可。

  private updateProjectiles(_timeMs: number, deltaMs: number): void {
    if (this.projectiles.length === 0) return;
    const toRemove: number[] = [];
    this.projectiles.forEach((p, idx) => {
      p.life -= deltaMs;
      // Arcade Physics body.update 在 Phaser 4 中签名变化：由场景循环驱动，无需手动调用
      const g = (p.body as any)._graphics as Phaser.GameObjects.Graphics;
      g.clear();
      g.fillStyle(0x6ab0ff, 1);
      g.fillCircle(p.x, p.y, 6);
      // 撞到玩家
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
      if (d < 22) {
        const hit = this.player.takeHit(p.dmg, _timeMs);
        if (hit) {
          this.showDamageFloat(this.player.x, this.player.y - 20, p.dmg, false);
          if (useGameStore.getState().player.hp <= 0) this.showResult(false);
        }
        toRemove.push(idx);
      }
      if (p.life <= 0) toRemove.push(idx);
    });
    // 反向删除
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const p = this.projectiles[idx];
      (p.body as any)._graphics.destroy();
      p.body.destroy();
      this.projectiles.splice(idx, 1);
    }
    void PLAYER_ATTACK_RANGE;
  }

  // ——————————————— Phase 3：鬼神斩 R + 精英两阶段 + 妖魂吸血 ———————————————

  private onSkillRCharge(args: { x: number; y: number }): void {
    // 蓄力特效：红色圆环 + 慢慢收紧
    const g = this.add.graphics();
    g.lineStyle(3, 0xff4444, 0.9);
    g.strokeCircle(args.x, args.y, 20);
    this.tweens.add({
      targets: this.tweens.addCounter({ from: 20, to: SKILL_R_FAN_RADIUS * 0.6, duration: 600 }),
      onUpdate: (t: Phaser.Tweens.Tween) => {
        g.clear();
        g.lineStyle(3, 0xff4444, 0.9 - (t.getValue() as number) / 200);
        g.strokeCircle(args.x, args.y, t.getValue() as number);
      },
      onComplete: () => g.destroy(),
    });
  }

  private onSkillRStart(args: {
    x: number; y: number; dx: number;
    fanRadius: number; fanAngleDeg: number; damage: number;
  }): void {
    const facingRight = args.dx > 0;
    const baseAngle = facingRight ? 0 : 180;  // facing right = 0°, left = 180°
    const half = args.fanAngleDeg / 2;

    // 扇形视觉（Graphics + 半透明填充 + 边缘描边，180ms 后淡出）
    const fan = this.add.graphics();
    fan.fillStyle(0xff4444, 0.35);
    fan.slice(
      args.x, args.y, args.fanRadius,
      Phaser.Math.DegToRad(baseAngle - half), Phaser.Math.DegToRad(baseAngle + half),
    );
    fan.fillPath();
    fan.lineStyle(4, 0xff6666, 1);
    fan.strokePath();
    this.tweens.add({
      targets: fan, alpha: 0, duration: 180, ease: 'Cubic.Out', onComplete: () => fan.destroy(),
    });

    // 扇形范围判定（简化：距离 + 角度）
    let hitCount = 0;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      const dx = e.x - args.x;
      const dy = e.y - args.y;
      const dist = Math.hypot(dx, dy);
      if (dist > args.fanRadius) continue;
      const angDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const lo = (baseAngle - half + 360) % 360;
      const hi = (baseAngle + half + 360) % 360;
      let inFan = false;
      if (lo <= hi) inFan = angDeg >= lo && angDeg <= hi;
      else inFan = angDeg >= lo || angDeg <= hi;
      if (inFan) {
        e.takeDamage(args.damage);
        this.showDamageFloat(e.x, e.y - 20, args.damage, true);
        hitCount++;
      }
    }

    // 鬼神斩击中至少 1 人时屏幕轻微抖动
    if (hitCount > 0) this.cameras.main.shake(150, 0.003);
  }

  private onEliteGhostfire(args: { x: number; y: number; radius: number; damage: number }): void {
    // 地面红色警示圆（0.5s 后爆炸）
    const warn = this.add.graphics();
    warn.fillStyle(0xff4444, 0.35);
    warn.fillCircle(args.x, args.y, args.radius);
    warn.lineStyle(3, 0xff8888, 0.9);
    warn.strokeCircle(args.x, args.y, args.radius);

    this.tweens.add({
      targets: warn, scaleX: 1.08, scaleY: 1.08, alpha: 0.9, duration: 450, yoyo: true,
    });

    this.time.delayedCall(500, () => {
      warn.destroy();
      // 爆炸视觉
      const boom = this.add.graphics();
      boom.fillStyle(0xffaa44, 0.7);
      boom.fillCircle(args.x, args.y, args.radius);
      boom.lineStyle(6, 0xffffcc, 1);
      boom.strokeCircle(args.x, args.y, args.radius);
      this.tweens.add({
        targets: boom, alpha: 0, scaleX: 1.3, scaleY: 1.3, duration: 200,
        onComplete: () => boom.destroy(),
      });

      // AOE 伤害：只有玩家吃（鬼火是对玩家的）
      const p = this.player;
      const d = Phaser.Math.Distance.Between(args.x, args.y, p.x, p.y);
      if (d <= args.radius + 14) {
        const hit = p.takeHit(args.damage, this.time.now);
        if (hit) {
          this.showDamageFloat(p.x, p.y - 20, args.damage, false);
          if (useGameStore.getState().player.hp <= 0) this.showResult(false);
        }
      }
    });
  }

  private onElitePhase2Enter(): void {
    // 屏幕中央提示 1.5s
    const txt = this.add.text(GAME_WIDTH / 2, 200,
      '精英鬼将进入狂暴状态 —— 红色纹路覆盖，速度暴增！',
      { fontFamily: 'monospace', fontSize: '24px', color: '#ff4444', fontStyle: 'bold', align: 'center' },
    ).setOrigin(0.5).setDepth(200).setScrollFactor(0);
    this.tweens.add({
      targets: txt, alpha: 0, y: 160, duration: 1500, ease: 'Cubic.Out', onComplete: () => txt.destroy(),
    });
  }

  /** Phase 3：普攻命中后触发酒吞童子妖魂吸血 */
  private maybeLifestealFromNormalAttack(damage: number): void {
    const heal = soulSystem.tryNormalAttackLifesteal(damage);
    if (heal > 0) {
      const { player } = useGameStore.getState();
      const newHp = Math.min(player.maxHp, player.hp + heal);
      useGameStore.getState().setPlayerHp(newHp);
      // 显示绿色吸血飘字
      this.showDamageFloat(this.player.x, this.player.y - 36, heal, false);
      // 把飘字颜色改为绿色
      const ft = this.children.list.filter((c) => c instanceof Phaser.GameObjects.Text).slice(-1)[0] as Phaser.GameObjects.Text | undefined;
      if (ft) (ft as Phaser.GameObjects.Text).setColor('#66ff88');
    }
    void SOUL_DB;
  }

}
