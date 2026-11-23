import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, GRID_COLOR, WALL_COLOR,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { getGameStore } from '../../store/gameStore.js';

/**
 * HomeScene —— 据点道场（安全区 / 非战斗）。
 * 主屋 / 刀匠铺 / 神龛 / 训练场 四个设施交互点（按 F 打开对应 React 面板）。
 * 村口门 → BattleScene（关卡区域推进）。
 *
 * Phase 5：面板改为 React 层（store.setUiPanel），本场景不再自绘菜单、不再 pause。
 */

type FacilityKey = 'main-hall' | 'swordsmith' | 'shrine' | 'training';

interface FacilityMarker {
  key: FacilityKey;
  x: number; y: number;
  label: string;
  color: number;
  desc: string;
}

const FACILITIES: FacilityMarker[] = [
  { key: 'main-hall',   x: 280, y: 260, label: '主屋',   color: 0x8a6a3a, desc: '休整 · 查看状态' },
  { key: 'swordsmith',  x: 760, y: 240, label: '刀匠铺', color: 0xaa5533, desc: '强化装备' },
  { key: 'shrine',      x: 520, y: 460, label: '神龛',   color: 0xdd8844, desc: '祈祷 · 消耗妖魂碎片' },
  { key: 'training',    x: 1020, y: 400, label: '训练场', color: 0x66aa66, desc: '技能升级' },
];

const EXIT_DOOR = { x: GAME_WIDTH - 80, y: GAME_HEIGHT / 2 };

export class HomeScene extends Phaser.Scene {
  private player!: Player;
  private promptText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private selectedFacility: FacilityMarker | null = null;
  private selectedExit = false;
  private introOpen = false;

  constructor() {
    super({ key: 'HomeScene' });
  }

  create(): void {
    const store = getGameStore();
    store.setScene('HomeScene');
    store.setPaused(false);
    store.setUiPanel('none');
    // 回到据点＝休整：回满 HP
    store.restAtHome();
    this.selectedFacility = null;
    this.selectedExit = false;

    // 背景：绿色草地（区别于战斗场景深色）
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2f3a2a);
    const grid = this.add.graphics();
    grid.lineStyle(1, GRID_COLOR, 0.3);
    for (let x = 0; x <= GAME_WIDTH; x += 40) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) grid.lineBetween(0, y, GAME_WIDTH, y);

    // 边界 + 中间树/石头障碍
    const walls = this.add.group();
    const makeWall = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, WALL_COLOR);
      this.physics.add.existing(r, true);
      walls.add(r);
    };
    makeWall(0, 0, GAME_WIDTH, 24);
    makeWall(0, GAME_HEIGHT - 24, GAME_WIDTH, 24);
    makeWall(0, 0, 24, GAME_HEIGHT);
    makeWall(GAME_WIDTH - 24, 0, 24, GAME_HEIGHT);
    makeWall(420, 140, 80, 40);
    makeWall(900, 520, 60, 80);
    makeWall(600, 300, 40, 40);

    // 玩家 spawn（道场入口中央）
    const skills = new SkillSystem();
    this.player = new Player(this, 180, GAME_HEIGHT / 2, skills);
    this.physics.add.collider(
      this.player as unknown as Phaser.GameObjects.GameObject,
      walls.getChildren() as Phaser.GameObjects.Rectangle[],
    );

    // 设施绘制
    FACILITIES.forEach((f) => this.drawFacility(f));
    this.drawExitDoor();

    // 顶部 banner
    this.add.text(GAME_WIDTH / 2, 36, '隐月道场', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // 右上 HUD
    this.hudText = this.add.text(GAME_WIDTH - 20, 16, this.hudTextContent(), {
      fontSize: '14px', color: '#ffffff',
      backgroundColor: '#00000066', padding: { x: 8, y: 6 },
    }).setOrigin(1, 0);

    // 底部交互提示
    this.promptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '', {
      fontSize: '20px', color: '#ffff88', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);

    // 输入注册（Player 构造时已注册 WASD/技能键）
    const onInteract = () => this.handleInteract();
    this.input.keyboard!.on('keydown-F', onInteract);

    // 场景销毁时解绑（Esc 角色面板由 React GameOverlay 统一处理）
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-F', onInteract);
    });

    // 教学首次启动
    if (!localStorage.getItem('demon_samurai_intro_done')) {
      localStorage.setItem('demon_samurai_intro_done', '1');
      this.showIntro();
    }
  }

  private hudTextContent(): string {
    const store = getGameStore();
    const p = store.player;
    const r = store.resources;
    return `Lv.${p.level}  HP ${p.hp}/${p.maxHp}\nATK ${store.getEffectiveAtk()}  DEF ${store.getEffectiveDef()}\n` +
      `金币 ${r.gold}  木 ${r.wood}  铁 ${r.iron}  妖魂 ${r.soulShards}`;
  }

  private drawFacility(f: FacilityMarker): void {
    const w = 96, h = 80;
    this.add.rectangle(f.x, f.y, w, h, f.color).setStrokeStyle(3, 0x000000, 0.8);
    const roof = this.add.graphics();
    roof.fillStyle(0x441100, 1);
    roof.fillTriangle(f.x - w / 2 - 8, f.y - h / 2, f.x, f.y - h / 2 - 24, f.x + w / 2 + 8, f.y - h / 2);
    this.add.text(f.x, f.y + h / 2 + 10, f.label, {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
  }

  private drawExitDoor(): void {
    this.add.rectangle(EXIT_DOOR.x, EXIT_DOOR.y, 40, 64, 0x222233).setStrokeStyle(3, 0xffcc66, 1);
    this.add.circle(EXIT_DOOR.x + 8, EXIT_DOOR.y, 3, 0xffcc66);
    this.add.text(EXIT_DOOR.x, EXIT_DOOR.y - 48, '→ 出征', {
      fontSize: '14px', color: '#ffcc66', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  update(time: number, deltaMs: number): void {
    // React 面板 / 引导打开时冻结玩家
    if (this.introOpen || getGameStore().isUiOpen()) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.promptText.setVisible(false);
      return;
    }

    this.player.update(time, deltaMs);
    this.hudText.setText(this.hudTextContent());

    const px = this.player.x, py = this.player.y;
    const nearFacility = FACILITIES.find((f) => Phaser.Math.Distance.Between(px, py, f.x, f.y) < 80);
    const nearExit = Phaser.Math.Distance.Between(px, py, EXIT_DOOR.x, EXIT_DOOR.y) < 60;

    if (nearFacility) {
      this.promptText.setText(`[F] ${nearFacility.label} — ${nearFacility.desc}`).setVisible(true);
      this.selectedFacility = nearFacility;
      this.selectedExit = false;
    } else if (nearExit) {
      this.promptText.setText('[F] 出征 → 枫隐村').setVisible(true);
      this.selectedFacility = null;
      this.selectedExit = true;
    } else {
      this.promptText.setVisible(false);
      this.selectedFacility = null;
      this.selectedExit = false;
    }
  }

  private handleInteract(): void {
    if (this.introOpen || getGameStore().isUiOpen()) return;
    if (this.selectedExit) {
      getGameStore().setAreaIndex(0);
      this.scene.start('BattleScene', { areaIndex: 0 });
    } else if (this.selectedFacility) {
      this.openFacilityPanel(this.selectedFacility);
    }
  }

  /** 设施 → 打开对应 React 面板（统一由 GameOverlay 渲染） */
  private openFacilityPanel(f: FacilityMarker): void {
    const store = getGameStore();
    if (f.key === 'main-hall') {
      store.restAtHome();
      store.setUiPanel('character');
    } else if (f.key === 'swordsmith') {
      store.setUiPanel('build');
    } else if (f.key === 'shrine') {
      store.setUiPanel('shrine');
    } else {
      // 训练场：技能升级在角色面板「技能」区
      store.setUiPanel('character');
    }
  }

  /** 欢迎引导（首次进入自动触发，不暂停场景，靠 introOpen 冻结） */
  private showIntro(): void {
    this.introOpen = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    let step = 0;
    const lines = [
      '欢迎来到隐月道场，武士。',
      'WASD 移动，空格普攻，Q/W/E/R 释放技能。',
      '靠近设施按 F 交互，靠近出口按 F 出征。',
      '击败精英鬼将和赤月鬼将，收集妖魂碎片。',
      '点击继续...',
    ];
    const panel = this.add.container(cx, cy).setDepth(500);
    const bg = this.add.rectangle(0, 0, 620, 220, 0x000000, 0.9).setStrokeStyle(3, 0xffcc44, 1);
    const text = this.add.text(0, 0, lines[0], {
      fontSize: '20px', color: '#ffffff', align: 'center', lineSpacing: 8,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    panel.add([bg, text]);

    const advance = () => {
      step++;
      if (step < lines.length) {
        text.setText(lines[step]);
      } else {
        panel.destroy();
        this.input.off('pointerdown', advance);
        this.introOpen = false;
      }
    };
    this.input.on('pointerdown', advance);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', advance);
    });
  }
}
