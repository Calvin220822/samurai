import Phaser from 'phaser';
import {
  GAME_HEIGHT, GAME_WIDTH, GRID_COLOR, GROUND_COLOR, TILE_SIZE, WALL_COLOR,
  PLAYER_ATTACK_DAMAGE, PLAYER_ATTACK_RANGE,
  SKILL_Q_DASH_DISTANCE, SKILL_Q_WIDTH,
  SKILL_W_RADIUS, SKILL_W_DAMAGE,
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
import { applyEquipmentStatDelta, useGameStore } from '@/store/gameStore.js';
import { EQUIPMENT_DB, COMMON_DROP_POOL, rollFromPool, RARITY_COLOR } from '@/phaser/data/equipment.js';

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
    useGameStore.getState().resetForBattle();
    useGameStore.getState().setScene('battle');
    this.kills = 0; this.totalExpEarned = 0;

    this.drawGround();
    this.buildWalls();
    this.spawnPlayer();
    this.spawnWave();
    this.createHUD();
    this.createResultPanel();

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
    this.events.on('enemy:attack', this.onEnemyAttack, this);
    this.events.on('enemy:dead', this.onEnemyDead, this);
    this.events.on('elite:summon', this.onEliteSummon, this);

    this.input.on('pointerdown', this.onResultPanelClick, this);
    this.input.on('pointerdown', this.onDropClick, this);
  }

  shutdown(): void {
    this.events.off('player:attack-hit', this.onPlayerAttackHit, this);
    this.events.off('skill:q-start', this.onSkillQStart, this);
    this.events.off('skill:w-start', this.onSkillWStart, this);
    this.events.off('skill:e-start', this.onSkillEStart, this);
    this.events.off('enemy:attack', this.onEnemyAttack, this);
    this.events.off('enemy:dead', this.onEnemyDead, this);
    this.events.off('elite:summon', this.onEliteSummon, this);
    this.input.off('pointerdown', this.onResultPanelClick, this);
    this.input.off('pointerdown', this.onDropClick, this);
  }

  update(time: number, deltaMs: number): void {
    if (this.resultPanelVisible) return;

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
  private drawGround(): void {
    const g = this.add.graphics();
    g.fillStyle(GROUND_COLOR, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(1, GRID_COLOR, 0.5);
    for (let x = 0; x <= GAME_WIDTH; x += TILE_SIZE) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += TILE_SIZE) g.lineBetween(0, y, GAME_WIDTH, y);
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
    // 波次：2 赤鬼 + 1 骸骨武士 + 1 怨灵 + 1 精英鬼将
    this.enemies.push(new RedOni(this, 640, 300));
    this.enemies.push(new RedOni(this, 860, 520));
    this.enemies.push(new BoneSamurai(this, 520, 600));
    this.enemies.push(new Wraith(this, 1100, 280));
    this.enemies.push(new EliteGeneral(this, 950, 150));
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
      target.takeDamage(args.damage || PLAYER_ATTACK_DAMAGE);
      this.showDamageFloat(target.x, target.y - 20, args.damage || PLAYER_ATTACK_DAMAGE, false);
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
    if (args.enemy instanceof BoneSamurai) expGained = BONE_EXP;
    else if (args.enemy instanceof Wraith) expGained = WRAITH_EXP;
    else if (args.enemy instanceof EliteGeneral) expGained = ELITE_EXP;
    this.totalExpEarned += expGained;

    // 精英死亡 → 关卡胜利
    if (args.enemy instanceof EliteGeneral) {
      this.levels.addExp(expGained);
      this.showResult(true);
      return;
    }

    // 普通怪：先尝试升级，再掉装备（几率）
    const levelUps = this.levels.addExp(expGained);
    if (levelUps.length > 0) {
      const last = levelUps[levelUps.length - 1];
      this.showLevelUp(last);
    }

    // 装备掉落（普通怪 20% / 精英已在关卡胜利处理）
    if (Math.random() < 0.20) {
      const item = rollFromPool(COMMON_DROP_POOL);
      this.spawnDrop(args.x, args.y, item.id);
    }
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
        const store = useGameStore.getState();
        const oldId = store.equipment[item.slot];
        store.equipItem(item.slot, itemId);
        applyEquipmentStatDelta(item.slot, oldId, itemId);
        this.showGoldFloat(d.x, d.y - 10, 0);   // 不用，占位
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
    const skillLabels = ['居合斩', '旋风斩', '影步', '鬼神斩(Phase3)'];
    const cx = GAME_WIDTH / 2;
    const spacing = 64;
    const keys = ['Q', 'E', 'R', 'F'];  // 对应键盘键
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
    this.add.text(GAME_WIDTH - 360, 20,
      '[ WASD / 方向键 ] 移动\n[ 空格 ] 普攻（3 连斩）\n[ Q ] 居合斩   [ E ] 旋风斩   [ R ] 影步\n点击装备可拾取穿戴',
      { fontFamily: 'monospace', fontSize: '13px', color: '#9aa0a6', align: 'right' },
    ).setScrollFactor(0).setDepth(100);

    this.add.text(GAME_WIDTH - 360, GAME_HEIGHT - 48,
      `Phase 2 · MVP 0.2 战斗循环 · 击杀精英鬼将即可胜利`,
      { fontFamily: 'monospace', fontSize: '12px', color: '#6a6a72' },
    ).setScrollFactor(0).setDepth(100);
  }

  private refreshHUD(): void {
    const s = useGameStore.getState();
    this.hpText.setText(`HP ${s.player.hp} / ${s.player.maxHp}`);
    this.levelText.setText(`Lv.${s.player.level}  ATK:${s.getEffectiveAtk()}  DEF:${s.getEffectiveDef()}  技能点:${s.player.skillPoints}`);
    this.goldText.setText(`金币: ${s.resources.gold}  击杀: ${this.kills}`);

    // EXP 条
    const lv = s.player.level;
    const need = 100 + (lv - 1) * 150;
    const ratio = Phaser.Math.Clamp(s.player.exp / need, 0, 1);
    const barW = ratio * 196;
    this.expBar.inner.width = barW;
    this.expBar.inner.x = 24 + barW / 2;

    // 4 技能冷却遮罩
    const cooldowns: Array<[keyof typeof this.skillOverlays, number]> = [
      ['Q', 5000], ['W', 8000], ['E', 6000], ['R', 30000],
    ];
    for (const [key, max] of cooldowns) {
      const remaining = this.skills.remainingMs(key);
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
      '点击屏幕任意位置重新挑战',
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
      (victory ? '精英鬼将已被封印，返回道场继续冒险！' : '武士倒下了... 整装再来'),
    );
    useGameStore.getState().setCombatResult({
      victory, kills: this.kills, goldEarned: s.resources.gold,
    });
  }

  private onResultPanelClick(): void {
    if (!this.resultPanelVisible) return;
    // 重开
    useGameStore.getState().resetForBattle();
    this.resultPanel.setVisible(false);
    this.resultPanelVisible = false;

    for (const e of [...this.enemies]) e.destroy();
    this.enemies = [];
    for (const d of this.drops) d.destroy();
    this.drops = [];
    this.projectiles = [];

    this.spawnWave();
    for (const e of this.enemies) this.addCollidersForEnemy(e);

    this.player.x = 160; this.player.y = 160;
    const body = (this.player as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    body.setVelocity(0, 0);
    this.skills.reset();

    this.kills = 0; this.totalExpEarned = 0;
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
}
