/**
 * 技能系统（Phase 3 版本）。
 *
 * 与 Phase 2 相比：
 * - 新增 castR（鬼神斩：蓄力 + 扇形范围 + 不可移动）
 * - 集成 SoulSystem hooks：妖魂修改 W 半径 / E 无敌时间 / 普攻吸血
 */

import Phaser from 'phaser';
import {
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_WIDTH,
  SKILL_Q_COOLDOWN_MS, SKILL_Q_DAMAGE, SKILL_Q_DASH_DISTANCE, SKILL_Q_DASH_SPEED, SKILL_Q_WIDTH,
  SKILL_W_COOLDOWN_MS, SKILL_W_RADIUS, SKILL_W_DAMAGE, SKILL_W_CAST_MS,
  SKILL_E_COOLDOWN_MS, SKILL_E_DISTANCE, SKILL_E_INVULN_MS,
  SKILL_R_COOLDOWN_MS, SKILL_R_CAST_MS, SKILL_R_FAN_RADIUS, SKILL_R_FAN_ANGLE_DEG, SKILL_R_DAMAGE,
} from '../config/Constants.js';
import type { Player } from '../entities/Player.js';
import { soulSystem } from './SoulSystem.js';

export interface SkillCooldown { Q: number; W: number; E: number; R: number; }

export class SkillSystem {
  private cd: SkillCooldown = { Q: 0, W: 0, E: 0, R: 0 };

  reset(): void { this.cd = { Q: 0, W: 0, E: 0, R: 0 }; }
  tick(deltaMs: number): void {
    (['Q', 'W', 'E', 'R'] as const).forEach((k) => {
      this.cd[k] = Math.max(0, this.cd[k] - deltaMs);
    });
  }

  isReady(s: keyof SkillCooldown): boolean { return this.cd[s] <= 0; }
  remainingMs(s: keyof SkillCooldown): number { return this.cd[s]; }

  /** Q 居合斩 */
  castQ(player: Player): boolean {
    if (!this.isReady('Q')) return false;
    this.cd.Q = SKILL_Q_COOLDOWN_MS;

    const facing = player.getFacing();
    const dx = facing === 'right' ? 1 : -1;
    const body = getArcadeBody(player);
    const scene = getScene(player);
    const dashDuration = (SKILL_Q_DASH_DISTANCE / SKILL_Q_DASH_SPEED) * 1000;

    body.setVelocity(dx * SKILL_Q_DASH_SPEED, 0);
    scene.time.delayedCall(dashDuration, () => body.setVelocity(0, 0));

    soulSystem.emitSkillCast('Q');
    scene.events.emit('skill:q-start', {
      x: player.x, y: player.y, dx,
      distance: SKILL_Q_DASH_DISTANCE, width: SKILL_Q_WIDTH,
      damage: SKILL_Q_DAMAGE,
    });
    return true;
  }

  /** W 旋风斩 —— 天狗妖魂可放大半径 */
  castW(player: Player): boolean {
    if (!this.isReady('W')) return false;
    this.cd.W = SKILL_W_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);
    body.setVelocity(0, 0);

    const radius = soulSystem.aggregateRadius('W', SKILL_W_RADIUS);
    soulSystem.emitSkillCast('W');
    scene.events.emit('skill:w-start', {
      x: player.x, y: player.y, radius, damage: SKILL_W_DAMAGE,
    });

    scene.time.delayedCall(SKILL_W_CAST_MS, () => { /* 释放 */ });
    return true;
  }

  /** E 影步 —— 镰鼬妖魂可延长无敌时间 */
  castE(player: Player, moveDir: { dx: number; dy: number }): boolean {
    if (!this.isReady('E')) return false;
    this.cd.E = SKILL_E_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);

    let dx = moveDir.dx !== 0 || moveDir.dy !== 0 ? moveDir.dx : (player.getFacing() === 'right' ? 1 : -1);
    let dy = moveDir.dx !== 0 || moveDir.dy !== 0 ? moveDir.dy : 0;
    const mag = Math.hypot(dx, dy) || 1;
    dx /= mag; dy /= mag;

    scene.events.emit('skill:e-start', { x: player.x, y: player.y, dx, dy });

    const instantSpeed = 2000;
    body.setVelocity(dx * instantSpeed, dy * instantSpeed);
    const durMs = (SKILL_E_DISTANCE / instantSpeed) * 1000;
    scene.time.delayedCall(durMs + 10, () => body.setVelocity(0, 0));

    const invulnMs = soulSystem.aggregateInvuln(SKILL_E_INVULN_MS);
    scene.time.delayedCall(invulnMs, () => scene.events.emit('skill:e-invuln-end'));
    soulSystem.emitSkillCast('E');
    return true;
  }

  /** R 鬼神斩 —— 蓄力期间不可移动，120° 大扇形 */
  castR(player: Player): boolean {
    if (!this.isReady('R')) return false;
    this.cd.R = SKILL_R_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);
    body.setVelocity(0, 0);

    // 蓄力期间持续 emit 技能事件，BattleScene 可做蓄力特效
    scene.events.emit('skill:r-charge', { x: player.x, y: player.y });

    scene.time.delayedCall(SKILL_R_CAST_MS, () => {
      const facing = player.getFacing();
      const dx = facing === 'right' ? 1 : -1;
      scene.events.emit('skill:r-start', {
        x: player.x, y: player.y, dx,
        fanRadius: SKILL_R_FAN_RADIUS, fanAngleDeg: SKILL_R_FAN_ANGLE_DEG,
        damage: SKILL_R_DAMAGE,
      });
      soulSystem.emitSkillCast('R');
    });
    return true;
  }

  /** 普攻矩形（给 BattleScene 用） */
  resolveNormalAttack(player: { x: number; y: number; getFacing(): 'left' | 'right' }) {
    const facing = player.getFacing();
    const dx = facing === 'right' ? 1 : -1;
    const cx = player.x + dx * (PLAYER_ATTACK_RANGE / 2);
    const rect = new Phaser.Geom.Rectangle(
      cx - PLAYER_ATTACK_RANGE / 2,
      player.y - PLAYER_ATTACK_WIDTH / 2,
      PLAYER_ATTACK_RANGE, PLAYER_ATTACK_WIDTH,
    );
    return { dx, rect };
  }
}

function getArcadeBody(obj: Player): Phaser.Physics.Arcade.Body {
  return (obj as unknown as { body: Phaser.Physics.Arcade.Body }).body;
}
function getScene(obj: Player): Phaser.Scene {
  return (obj as unknown as { scene: Phaser.Scene }).scene;
}
