import Phaser from 'phaser';
import {
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_HIT_FRAME,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SKILL_R_CAST_MS,
} from '../config/Constants.js';
import { EVT, EventBus } from '../core/EventBus.js';
import type { SkillSystem } from '../systems/SkillSystem.js';
import { useGameStore } from '@/store/gameStore.js';

type PlayerState = 'IDLE' | 'MOVING' | 'ATTACKING' | 'DYING';
type Dir = 'down' | 'up' | 'side';

/** 技能动作播放期间锁定动画切换，避免被 idle/walk 立刻覆盖 */
const ANIM_LOCK_MS: Record<string, number> = {
  attack: 300, q: 300, w: 300, r: SKILL_R_CAST_MS + 80, hit: 220,
};

/**
 * 武士主角（精灵动画版）。
 *
 * 素材：武士行走与待机精灵表 + 妖刀武士动作精灵表。
 * 键位：WASD/方向键移动，空格普攻，Q 居合斩 / W 旋风斩 / E 影步 / R 鬼神斩。
 */
export class Player extends Phaser.GameObjects.Container {
  private sprite!: Phaser.GameObjects.Sprite;
  private facing: 'left' | 'right' = 'right';
  private dir: Dir = 'down';

  private playerState: PlayerState = 'IDLE';
  private attackCombo = 0;
  private attackTimer = 0;
  private attackHitFrame = false;
  private attackCd = 0;
  private comboReset = 0;

  private invulnUntil = 0;
  private hurtFlashUntil = 0;
  private rChargingUntil = 0;
  private actionLockUntil = 0;

  private kbd!: {
    up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key;
    upArrow: Phaser.Input.Keyboard.Key; downArrow: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key; rightArrow: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    skillQ: Phaser.Input.Keyboard.Key; skillW: Phaser.Input.Keyboard.Key;
    skillE: Phaser.Input.Keyboard.Key; skillR: Phaser.Input.Keyboard.Key;
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
    this.createSprite();
    EventBus.emit(EVT.PLAYER_SPAWNED, this);
  }

  private registerInput(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    return {
      up: kb.addKey('W'), down: kb.addKey('S'),
      left: kb.addKey('A'), right: kb.addKey('D'),
      upArrow: kb.addKey('UP'), downArrow: kb.addKey('DOWN'),
      leftArrow: kb.addKey('LEFT'), rightArrow: kb.addKey('RIGHT'),
      fire: kb.addKey('SPACE'),
      skillQ: kb.addKey('Q'), skillW: kb.addKey('W'),
      skillE: kb.addKey('E'), skillR: kb.addKey('R'),
    };
  }

  private createSprite(): void {
    this.sprite = this.scene.add.sprite(0, 0, 'player_idle', 0)
      .setOrigin(0.5, 1)
      .setScale(0.8);
    this.add(this.sprite);
    this.playAction('idle', true);
  }

  /** 每帧 */
  update(timeMs: number, deltaMs: number): void {
    // 受伤红闪
    if (timeMs < this.hurtFlashUntil) this.sprite.setTint(0xff8888);
    else this.sprite.clearTint();

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

  /** 技能键 Q / W / E / R */
  private handleSkills(): void {
    const now = this.scene.time.now;
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillQ)) {
      if (this.skills.castQ(this)) {
        this.playAction('q', true);
        this.actionLockUntil = now + ANIM_LOCK_MS.q;
        if (this.playerState === 'ATTACKING') this.playerState = 'MOVING';
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillW)) {
      if (this.skills.castW(this)) {
        this.playAction('w', true);
        this.actionLockUntil = now + ANIM_LOCK_MS.w;
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillE)) {
      const mv = this.currentMoveDirection();
      const invulnMs = this.skills.castE(this, mv);
      if (invulnMs > 0) {
        this.invulnUntil = now + invulnMs;
        // 影步：半透明残影
        this.sprite.setAlpha(0.45);
        this.scene.time.delayedCall(invulnMs, () => this.sprite.setAlpha(1));
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.kbd.skillR)) {
      if (this.skills.castR(this)) {
        this.rChargingUntil = now + SKILL_R_CAST_MS;
        this.playAction('r', true);
        this.actionLockUntil = now + ANIM_LOCK_MS.r;
      }
    }
  }

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
    this.playAction('attack', true);
    this.actionLockUntil = this.scene.time.now + ANIM_LOCK_MS.attack;
  }

  private doAttacking(deltaMs: number): void {
    this.attackTimer -= deltaMs;
    if (!this.attackHitFrame && (260 - this.attackTimer) >= PLAYER_ATTACK_HIT_FRAME) {
      this.attackHitFrame = true;
      this.scene.events.emit('player:attack-hit', {
        x: this.x, y: this.y, facing: this.facing,
        damage: useGameStore.getState().getEffectiveAtk(),
      });
    }
    if (this.attackTimer <= 0) {
      this.playerState = 'MOVING';
      this.attackCd = PLAYER_ATTACK_COOLDOWN_MS;
      this.playAction('walk', true);
    }
  }

  private doMoving(): void {
    if (this.scene.time.now < this.rChargingUntil) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.playerState = 'IDLE';
      return;
    }
    const mv = this.currentMoveDirection();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(mv.dx * PLAYER_SPEED, mv.dy * PLAYER_SPEED);

    if (mv.dx !== 0 || mv.dy !== 0) {
      if (Math.abs(mv.dx) >= Math.abs(mv.dy)) {
        this.dir = 'side';
        this.face(mv.dx < 0 ? 'left' : 'right');
      } else {
        this.dir = mv.dy > 0 ? 'down' : 'up';
      }
      this.applyFlip();
      this.playerState = 'MOVING';
      this.playAction('walk');
    } else {
      this.playerState = 'IDLE';
      this.playAction('idle');
    }
  }

  private face(dir: 'left' | 'right'): void {
    if (this.facing === dir) return;
    this.facing = dir;
    this.applyFlip();
  }

  /** side 原画面朝左：向右时水平翻转 */
  private applyFlip(): void {
    this.sprite.setFlipX(this.dir === 'side' && this.facing === 'right');
  }

  private playAction(action: string, force = false): void {
    const now = this.scene.time.now;
    if (!force && now < this.actionLockUntil) return;
    const key = ['w', 'hit', 'death'].includes(action) ? action : `${action}-${this.dir}`;
    if (!this.scene.anims.exists(key)) return;
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    this.sprite.play(key, true);
    this.applyFlip();
  }

  // —— 公共 API ——
  getFacing(): 'left' | 'right' { return this.facing; }
  isAttacking(): boolean { return this.playerState === 'ATTACKING'; }
  getComboIndex(): number { return this.attackCombo; }
  isInvulnerable(time: number): boolean { return time < this.invulnUntil; }

  /** 由场景在受伤前调用；返回 true 代表实际扣血 */
  takeHit(damage: number, time: number): boolean {
    if (time < this.invulnUntil) return false;
    this.hurtFlashUntil = time + 120;
    this.playAction('hit', true);
    this.actionLockUntil = time + ANIM_LOCK_MS.hit;
    useGameStore.getState().damagePlayer(damage);
    return true;
  }

  private die(): void {
    this.playerState = 'DYING';
    EventBus.emit(EVT.PLAYER_DEAD, this);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.sprite.play('death', true);
    this.scene.tweens.add({
      targets: this, alpha: 0, duration: 900, delay: 300, ease: 'Cubic.Out',
      onComplete: () => this.destroy(),
    });
  }
}
