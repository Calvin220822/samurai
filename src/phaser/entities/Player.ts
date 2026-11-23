import Phaser from 'phaser';
import {
  PLAYER_ACCENT,
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_HIT_FRAME,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_COLOR,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SWORD_COLOR,
} from '../config/Constants.js';
import { EVT, EventBus } from '../core/EventBus.js';
import type { SkillSystem } from '../systems/SkillSystem.js';
import { useGameStore } from '@/store/gameStore.js';

type PlayerState = 'IDLE' | 'MOVING' | 'ATTACKING' | 'DYING';

/**
 * 武士主角（Phase 1 版本）。
 *
 * - 普攻 3 连斩状态机：IDLE → ATTACKING → IDLE
 * - 攻击期间锁移动
 * - FIRE (SPACE) 触发普攻；Q 触发 SkillSystem.castQ
 * - 生效帧 emit 'player:attack-hit'，BattleScene 监听做矩形判定
 */
export class Player extends Phaser.GameObjects.Container {
  // —— 视觉 ——
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private swordGfx!: Phaser.GameObjects.Graphics;
  private facing: 'left' | 'right' = 'right';

  // —— 战斗状态（改名避免与基类 GameObject.state 冲突）——
  private playerState: PlayerState = 'IDLE';
  private attackCombo = 0;
  private attackTimer = 0;
  private attackHitFrame = false;
  private attackCd = 0;
  private comboReset = 0;

  // —— 输入键（改名避免与基类 Container.input 冲突）——
  private kbd!: {
    up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key;
    upArrow: Phaser.Input.Keyboard.Key; downArrow: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key; rightArrow: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
  };
  private fireWasDown = false;
  private skills: SkillSystem;

  constructor(scene: Phaser.Scene, x: number, y: number, skills: SkillSystem) {
    super(scene, x, y);
    this.skills = skills;

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject, false);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS);
    body.setOffset(-PLAYER_RADIUS, -PLAYER_RADIUS);
    body.setCollideWorldBounds(true);

    this.kbd = this.registerInput(scene);
    this.createGraphics();
    EventBus.emit(EVT.PLAYER_SPAWNED, this);
  }

  private registerInput(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    return {
      up: kb.addKey('W'), down: kb.addKey('S'),
      left: kb.addKey('A'), right: kb.addKey('D'),
      upArrow: kb.addKey('UP'), downArrow: kb.addKey('DOWN'),
      leftArrow: kb.addKey('LEFT'), rightArrow: kb.addKey('RIGHT'),
      fire: kb.addKey('SPACE'), q: kb.addKey('Q'),
    };
  }

  private createGraphics(): void {
    this.bodyGfx = this.scene.add.graphics();
    this.bodyGfx.fillStyle(PLAYER_COLOR, 1);
    this.bodyGfx.fillRoundedRect(-14, -22, 28, 44, 6);
    this.bodyGfx.fillStyle(PLAYER_ACCENT, 1);
    this.bodyGfx.fillTriangle(-14, -22, 14, -22, 0, -36);
    this.bodyGfx.fillStyle(0x888888, 1);
    this.bodyGfx.fillRoundedRect(-16, -24, 32, 4, 2);
    this.add(this.bodyGfx);

    this.swordGfx = this.scene.add.graphics();
    this.drawSword(false);
    this.add(this.swordGfx);
  }

  private drawSword(swinging: boolean): void {
    this.swordGfx.clear();
    this.swordGfx.lineStyle(3, PLAYER_SWORD_COLOR, 1);
    if (swinging) {
      this.swordGfx.lineBetween(0, -4, 36, -24);
      this.swordGfx.lineBetween(0, -4, 36, 4);
      this.swordGfx.fillStyle(0xffffff, 0.35);
      this.swordGfx.fillTriangle(0, -4, 36, -24, 36, 4);
    } else {
      this.swordGfx.lineBetween(10, 2, 26, 0);
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.playerState !== 'DYING') {
      this.handleQ();
      this.handleFire();
    }

    this.attackCd = Math.max(0, this.attackCd - deltaMs);
    this.comboReset = Math.max(0, this.comboReset - deltaMs);
    if (this.comboReset <= 0 && this.attackCombo !== 0) this.attackCombo = 0;

    if (this.playerState === 'ATTACKING') this.doAttacking(deltaMs);
    else if (this.playerState !== 'DYING') this.doMoving();

    if (useGameStore.getState().player.hp <= 0 && this.playerState !== 'DYING') this.die();
  }

  private handleQ(): void {
    if (Phaser.Input.Keyboard.JustDown(this.kbd.q)) {
      this.skills.castQ(this);
      if (this.playerState === 'ATTACKING') this.playerState = 'MOVING';
    }
  }

  private handleFire(): void {
    const down = this.kbd.fire.isDown;
    const pressed = down && !this.fireWasDown;
    this.fireWasDown = down;
    if (!pressed || this.playerState === 'ATTACKING' || this.attackCd > 0) return;

    this.playerState = 'ATTACKING';
    this.attackTimer = 260;
    this.attackHitFrame = false;
    this.attackCombo = (this.attackCombo + 1) % 3;
    this.comboReset = 1200;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private doAttacking(_deltaMs: number): void {
    this.attackTimer -= _deltaMs;
    if (!this.attackHitFrame && (260 - this.attackTimer) >= PLAYER_ATTACK_HIT_FRAME) {
      this.attackHitFrame = true;
      this.drawSword(true);
      this.scene.events.emit('player:attack-hit', {
        x: this.x, y: this.y, facing: this.facing, combo: this.attackCombo,
      });
    }
    if (this.attackTimer <= 0) {
      this.drawSword(false);
      this.playerState = 'MOVING';
      this.attackCd = PLAYER_ATTACK_COOLDOWN_MS;
    }
  }

  private doMoving(): void {
    const K = this.kbd;
    const left = K.left.isDown || K.leftArrow.isDown;
    const right = K.right.isDown || K.rightArrow.isDown;
    const up = K.up.isDown || K.upArrow.isDown;
    const down = K.down.isDown || K.downArrow.isDown;
    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(dx * PLAYER_SPEED, dy * PLAYER_SPEED);
    if (dx < 0) this.face('left'); else if (dx > 0) this.face('right');
    this.playerState = (dx !== 0 || dy !== 0) ? 'MOVING' : 'IDLE';
    if (dx !== 0 || dy !== 0) EventBus.emit(EVT.PLAYER_MOVE, { x: this.x, y: this.y });
  }

  private face(dir: 'left' | 'right'): void {
    if (this.facing === dir) return;
    this.facing = dir;
    this.bodyGfx.setScale(dir === 'right' ? 1 : -1, 1);
  }

  getFacing(): 'left' | 'right' { return this.facing; }
  isAttacking(): boolean { return this.playerState === 'ATTACKING'; }
  getComboIndex(): number { return this.attackCombo; }
  getAttackDamage(): number { return PLAYER_ATTACK_DAMAGE; }

  private die(): void {
    this.playerState = 'DYING';
    EventBus.emit(EVT.PLAYER_DEAD, this);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this, alpha: 0, duration: 800, ease: 'Cubic.Out',
      onComplete: () => this.destroy(),
    });
  }
}
