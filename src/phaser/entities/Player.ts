import Phaser from 'phaser';
import {
  PLAYER_ACCENT,
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_HIT_FRAME,
  PLAYER_COLOR,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SWORD_COLOR,
  SKILL_E_INVULN_MS,
} from '../config/Constants.js';
import { EVT, EventBus } from '../core/EventBus.js';
import type { SkillSystem } from '../systems/SkillSystem.js';
import { useGameStore } from '@/store/gameStore.js';

type PlayerState = 'IDLE' | 'MOVING' | 'ATTACKING' | 'DYING';

/**
 * 武士主角（Phase 2 版本）。
 *
 * Phase 2 新增：
 * - W 键触发旋风斩 / E 键触发影步
 * - 无敌帧（影步期间），敌人攻击期间玩家若处于 invuln 可规避伤害
 * - 受伤时短暂红闪
 * - 普攻伤害从 store.getEffectiveAtk() 动态取
 */
export class Player extends Phaser.GameObjects.Container {
  private bodyGfx!: Phaser.GameObjects.Graphics;
  private swordGfx!: Phaser.GameObjects.Graphics;
  private facing: 'left' | 'right' = 'right';

  private playerState: PlayerState = 'IDLE';
  private attackCombo = 0;
  private attackTimer = 0;
  private attackHitFrame = false;
  private attackCd = 0;
  private comboReset = 0;

  private invulnUntil = 0;             // 毫秒时间戳，期间免疫伤害
  private hurtFlashUntil = 0;
  private rChargingUntil = 0;           // Phase 3：鬼神斩蓄力期间禁止移动
  private rChargingSwordFlashOn = false;

  private kbd!: {
    up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key;
    upArrow: Phaser.Input.Keyboard.Key; downArrow: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key; rightArrow: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    skillQ: Phaser.Input.Keyboard.Key; skillW: Phaser.Input.Keyboard.Key; skillE: Phaser.Input.Keyboard.Key;
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
    // WASD / 方向键负责移动；Q / E / R 负责技能（与架构文档一致）
    return {
      up: kb.addKey('W'), down: kb.addKey('S'),
      left: kb.addKey('A'), right: kb.addKey('D'),
      upArrow: kb.addKey('UP'), downArrow: kb.addKey('DOWN'),
      leftArrow: kb.addKey('LEFT'), rightArrow: kb.addKey('RIGHT'),
      fire: kb.addKey('SPACE'),
      skillQ: kb.addKey('Q'), skillW: kb.addKey('E'), skillE: kb.addKey('R'),
    };
  }

  // 删除错误的 registerKeyExtras —— 用正确的键位即可

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
    const chargeFlash = this.rChargingSwordFlashOn;
    const color = chargeFlash ? Phaser.Display.Color.ValueToColor(0xff3333).color : PLAYER_SWORD_COLOR;
    this.swordGfx.lineStyle(chargeFlash ? 5 : 3, color, 1);
    if (swinging) {
      this.swordGfx.lineBetween(0, -4, 36, -24);
      this.swordGfx.lineBetween(0, -4, 36, 4);
      this.swordGfx.fillStyle(chargeFlash ? 0xff6666 : 0xffffff, 0.35);
      this.swordGfx.fillTriangle(0, -4, 36, -24, 36, 4);
    } else {
      this.swordGfx.lineBetween(10, 2, 26, 0);
    }
  }

  /** 每帧 */
  update(timeMs: number, deltaMs: number): void {
    // —— 受伤红闪 ——
    this.bodyGfx.clear();
    const flash = timeMs < this.hurtFlashUntil;
    this.bodyGfx.fillStyle(flash ? 0xffaaaa : PLAYER_COLOR, 1);
    this.bodyGfx.fillRoundedRect(-14, -22, 28, 44, 6);
    this.bodyGfx.fillStyle(PLAYER_ACCENT, 1);
    this.bodyGfx.fillTriangle(-14, -22, 14, -22, 0, -36);
    this.bodyGfx.fillStyle(0x888888, 1);
    this.bodyGfx.fillRoundedRect(-16, -24, 32, 4, 2);

    if (this.playerState !== 'DYING') {
      this.handleSkills();
      this.handleFire();
    }

    this.attackCd = Math.max(0, this.attackCd - deltaMs);
    this.comboReset = Math.max(0, this.comboReset - deltaMs);
    if (this.comboReset <= 0 && this.attackCombo !== 0) this.attackCombo = 0;

    if (this.playerState === 'ATTACKING') this.doAttacking(deltaMs);
    else if (this.playerState !== 'DYING') this.doMoving();

    if (useGameStore.getState().player.hp <= 0 && this.playerState !== 'DYING') this.die();
  }

  /** Phase 3：技能键 Q / W / E / R 触发四种技能 */
  private handleSkills(): void {
    const now = this.scene.time.now;
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillQ)) {
      this.skills.castQ(this);
      if (this.playerState === 'ATTACKING') this.playerState = 'MOVING';
    }
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillW)) {
      this.skills.castW(this);
    }
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillE)) {
      const mv = this.currentMoveDirection();
      this.skills.castE(this, mv);
      this.invulnUntil = now + SKILL_E_INVULN_MS;
    }
    if (Phaser.Input.Keyboard.JustDown((this.kbd as any).skillR)) {
      const castMs = 600;
      this.skills.castR(this);
      this.rChargingUntil = now + castMs;
      this.rChargingSwordFlashOn = true;
      this.scene.events.emit('skill:r-charge', { x: this.x, y: this.y });
      this.scene.time.delayedCall(castMs, () => { this.rChargingSwordFlashOn = false; });
    }
  }

  /** 当前按键移动方向；用于影步无移动时 fallback 到 facing */
  private currentMoveDirection(): { dx: number; dy: number } {
    const K = this.kbd;
    const left = K.left.isDown || K.leftArrow.isDown;
    const right = K.right.isDown || K.rightArrow.isDown;
    const up = K.up.isDown || K.upArrow.isDown;
    const down = K.down.isDown || K.downArrow.isDown;
    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    return { dx, dy };
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

  private doAttacking(deltaMs: number): void {
    this.attackTimer -= deltaMs;
    if (!this.attackHitFrame && (260 - this.attackTimer) >= PLAYER_ATTACK_HIT_FRAME) {
      this.attackHitFrame = true;
      this.drawSword(true);
      this.scene.events.emit('player:attack-hit', {
        x: this.x, y: this.y, facing: this.facing,
        damage: useGameStore.getState().getEffectiveAtk(),
      });
    }
    if (this.attackTimer <= 0) {
      this.drawSword(false);
      this.playerState = 'MOVING';
      this.attackCd = PLAYER_ATTACK_COOLDOWN_MS;
    }
  }

  private doMoving(): void {
    // Phase 3：鬼神斩蓄力期间禁止移动
    if (this.scene.time.now < this.rChargingUntil) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.playerState = 'IDLE';
      return;
    }
    const mv = this.currentMoveDirection();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(mv.dx * PLAYER_SPEED, mv.dy * PLAYER_SPEED);
    if (mv.dx < 0) this.face('left');
    else if (mv.dx > 0) this.face('right');
    this.playerState = (mv.dx !== 0 || mv.dy !== 0) ? 'MOVING' : 'IDLE';
  }

  private face(dir: 'left' | 'right'): void {
    if (this.facing === dir) return;
    this.facing = dir;
    this.bodyGfx.setScale(dir === 'right' ? 1 : -1, 1);
  }

  // —— 公共 API ——
  getFacing(): 'left' | 'right' { return this.facing; }
  isAttacking(): boolean { return this.playerState === 'ATTACKING'; }
  getComboIndex(): number { return this.attackCombo; }
  isInvulnerable(time: number): boolean { return time < this.invulnUntil; }

  /** 由 BattleScene 在受伤前调用；返回 true 代表实际扣血 */
  takeHit(damage: number, time: number): boolean {
    if (time < this.invulnUntil) return false;  // 影步规避
    this.hurtFlashUntil = time + 120;
    useGameStore.getState().damagePlayer(damage);
    return true;
  }

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
