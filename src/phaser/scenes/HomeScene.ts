import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, GRID_COLOR, WALL_COLOR,
  AREAS,
} from '../config/Constants.js';
import { Player } from '../entities/Player.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { getGameStore } from '../../store/gameStore.js';

/**
 * HomeScene —— Phase 4 据点道场（安全区 / 非战斗）。
 * 主屋 / 刀匠铺 / 神龛 / 训练场 四个设施交互点（按 F 打开面板）。
 * 村口门 → BattleScene（关卡区域推进）。
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
  { key: 'swordsmith',  x: 760, y: 240, label: '刀匠铺', color: 0xaa5533, desc: '修理 · 强化装备' },
  { key: 'shrine',      x: 520, y: 460, label: '神龛',   color: 0xdd8844, desc: '祈祷 · 消耗妖魂碎片' },
  { key: 'training',    x: 1020, y: 400, label: '训练场', color: 0x66aa66, desc: '技能训练 · 解锁' },
];

const EXIT_DOOR = { x: GAME_WIDTH - 80, y: GAME_HEIGHT / 2 };

export class HomeScene extends Phaser.Scene {
  private player!: Player;
  private promptText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private selectedFacility: FacilityMarker | null = null;
  private selectedExit = false;
  private menuOpen = false;
  private facilityLabels: Phaser.GameObjects.Text[] = [];
  private facilityRects: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: 'HomeScene' });
  }

  create(): void {
    const store = getGameStore();
    store.setScene('HomeScene');
    store.setPaused(false);

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
    const pStore = store.player;
    store.setPlayerHp(pStore.maxHp);
    this.physics.add.collider(this.player.body as Phaser.Physics.Arcade.Body, walls.getChildren() as Phaser.GameObjects.Rectangle[]);

    // 设施绘制
    FACILITIES.forEach((f) => this.drawFacility(f));
    this.drawExitDoor();

    // 顶部 banner（装饰，不持有引用）
    this.add.text(GAME_WIDTH / 2, 36, '隐月道场', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // 右上 HUD
    this.hudText = this.add.text(GAME_WIDTH - 20, 16, this.hudTextContent(), {
      fontSize: '14px', color: '#ffffff',
      backgroundColor: '#00000066', padding: { x: 8, y: 6 },
    }).setOrigin(1, 0);
    this.events.on('update', () => this.hudText.setText(this.hudTextContent()));

    // 底部交互提示
    this.promptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '', {
      fontSize: '20px', color: '#ffff88', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);

    // 输入注册（Player 构造函数已经通过 scene.input.keyboard 注册了 WASD/Skill）
    // F 键单独监听设施交互
    this.input.keyboard!.on('keydown-F', () => this.handleInteract());

    // 教学首次启动
    if (!localStorage.getItem('demon_samurai_intro_done')) {
      this.showIntro();
      localStorage.setItem('demon_samurai_intro_done', '1');
    }
  }

  private hudTextContent(): string {
    const p = getGameStore().player;
    const r = getGameStore().resources;
    const effAtk = getGameStore().getEffectiveAtk();
    const effDef = getGameStore().getEffectiveDef();
    return `Lv.${p.level}  HP ${p.hp}/${p.maxHp}\nATK ${effAtk}  DEF ${effDef}\n金币 ${r.gold}  木 ${r.wood}  铁 ${r.iron}  妖魂 ${r.soulShards}`;
  }

  private drawFacility(f: FacilityMarker): void {
    // 主体方块
    const w = 96, h = 80;
    const rect = this.add.rectangle(f.x, f.y, w, h, f.color).setStrokeStyle(3, 0x000000, 0.8);
    // 屋檐（triangle via Graphics）
    const roof = this.add.graphics();
    roof.fillStyle(0x441100, 1);
    roof.fillTriangle(f.x - w / 2 - 8, f.y - h / 2, f.x, f.y - h / 2 - 24, f.x + w / 2 + 8, f.y - h / 2);
    const label = this.add.text(f.x, f.y + h / 2 + 10, f.label, {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.facilityRects.push(rect);
    this.facilityLabels.push(label);
  }

  private drawExitDoor(): void {
    this.add.rectangle(EXIT_DOOR.x, EXIT_DOOR.y, 40, 64, 0x222233).setStrokeStyle(3, 0xffcc66, 1);
    this.add.circle(EXIT_DOOR.x + 8, EXIT_DOOR.y, 3, 0xffcc66);
    this.add.text(EXIT_DOOR.x, EXIT_DOOR.y - 48, '→ 出征', {
      fontSize: '14px', color: '#ffcc66', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  update(_time: number, _deltaMs: number): void {
    if (this.scene.isPaused()) return;
    if (this.menuOpen) return;

    // Player 自己继承 Container 实现了 update，Phaser 自动路由
    const player = this.player;
    const px = player.x, py = player.y;

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
    if (this.scene.isPaused() || this.menuOpen) return;
    if (this.selectedExit) {
      getGameStore().setAreaIndex(0);
      this.scene.start('BattleScene', { areaIndex: 0 });
    } else if (this.selectedFacility) {
      this.openFacilityMenu(this.selectedFacility);
    }
  }

  private openFacilityMenu(f: FacilityMarker): void {
    this.menuOpen = true;
    this.scene.pause();
    const store = getGameStore();
    const effAtk = store.getEffectiveAtk();
    const effDef = store.getEffectiveDef();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.container(cx, cy);
    const bg = this.add.rectangle(0, 0, 480, 300, 0x1a1a22, 0.96).setStrokeStyle(3, 0x555566, 1);
    const title = this.add.text(0, -120, f.label, {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const desc = this.add.text(0, -70, f.desc, { fontSize: '16px', color: '#bbbbcc' }).setOrigin(0.5);

    let body = '';
    let btnText = '';
    let btnColor = '#aaaaaa';

    if (f.key === 'main-hall') {
      body = `HP: ${store.player.hp}/${store.player.maxHp}\n` +
        `等级: ${store.player.level}  技能点: ${store.player.skillPoints}\n` +
        `ATK ${effAtk}  DEF ${effDef}\n` +
        `经验: ${store.player.exp} / ${store.player.levelExp}\n\n` +
        `金币: ${store.resources.gold}  木材: ${store.resources.wood}\n` +
        `铁矿: ${store.resources.iron}  妖魂碎片: ${store.resources.soulShards}`;
      btnText = '点击：休息至满血';
      btnColor = '#88ff88';
    } else if (f.key === 'swordsmith') {
      body = `修理装备 / 强化\n\n当前资源：\n金币 ${store.resources.gold}  木 ${store.resources.wood}  铁 ${store.resources.iron}\n\n消耗 80 金 + 20 木 进行一次强化`;
      btnText = store.resources.gold >= 80 && store.resources.wood >= 20 ? '点击：强化 (80金+20木)' : '资源不足';
      btnColor = store.resources.gold >= 80 && store.resources.wood >= 20 ? '#ffcc44' : '#666666';
    } else if (f.key === 'shrine') {
      body = `祈祷 · 消耗妖魂碎片\n\n当前妖魂碎片: ${store.resources.soulShards}\n祈祷效果：永久最大 HP +20（消耗 10 妖魂碎片）`;
      btnText = store.resources.soulShards >= 10 ? '点击：祈祷 (10妖魂)' : '妖魂不足';
      btnColor = store.resources.soulShards >= 10 ? '#ff88ff' : '#666666';
    } else {
      body = `训练场 · 技能强化\n\n已获得 ${store.player.skillPoints} 技能点\n（Phase 4.5 开放 Q/W/E/R 各自 A/B 两条强化方向）`;
      btnText = '敬请期待';
      btnColor = '#888888';
    }

    const content = this.add.text(0, 0, body, {
      fontSize: '15px', color: '#ffffff', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
    const btn = this.add.text(0, 90, btnText, {
      fontSize: '16px', color: btnColor, backgroundColor: '#222222',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const close = this.add.text(0, 130, '[ESC] 关闭', { fontSize: '14px', color: '#888888' }).setOrigin(0.5);
    panel.add([bg, title, desc, content, btn, close]);

    btn.on('pointerdown', () => {
      if (f.key === 'main-hall') {
        store.setPlayerHp(store.player.maxHp);
        btn.setText('已恢复满血 ✓').setColor('#88ff88');
      } else if (f.key === 'swordsmith' && store.resources.gold >= 80 && store.resources.wood >= 20) {
        store.spendResources({ gold: 80, wood: 20 });
        store.grantSkillPoint();
        btn.setText('强化成功！+1 技能点').setColor('#88ff88');
      } else if (f.key === 'shrine' && store.resources.soulShards >= 10) {
        store.spendResources({ soulShards: 10 });
        store.prayMaxHp();
        btn.setText('神灵庇佑！+20 最大HP').setColor('#88ff88');
      }
    });

    const closeFn = () => {
      panel.destroy();
      this.menuOpen = false;
      this.scene.resume();
      this.input.keyboard!.off('keydown-ESC', closeFn);
    };
    this.input.keyboard!.on('keydown-ESC', closeFn);
  }

  // —— 欢迎引导（首次进入自动触发）——
  private showIntro(): void {
    this.scene.pause();
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
    const panel = this.add.container(cx, cy);
    const bg = this.add.rectangle(0, 0, 600, 220, 0x000000, 0.85).setStrokeStyle(3, 0xffcc44, 1);
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
        this.scene.resume();
      }
    };
    this.input.on('pointerdown', advance);
    void AREAS;  // 避免未使用警告
  }
}
