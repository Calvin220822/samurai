import Phaser from 'phaser';
import {
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_WIDTH,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_DAMAGE,
  SKILL_Q_DASH_DISTANCE,
  SKILL_Q_DASH_SPEED,
  SKILL_Q_WIDTH,
} from '../config/Constants.js';
import { computeDamage } from '../core/DamageCalculator.js';
import type { Player } from '../entities/Player.js';

/**
 * 技能系统（Phase 1 骨架）。
 *
 * Phase 1 实现：
 * - 普攻矩形判定
 * - Q 居合斩：瞬时冲刺 + 路径扫描
 */

export interface SkillCooldown {
  Q: number; W: number; E: number; R: number;
}

export class SkillSystem {
  private cooldownMs: SkillCooldown = { Q: 0, W: 0, E: 0, R: 0 };

  reset(): void {
    this.cooldownMs = { Q: 0, W: 0, E: 0, R: 0 };
  }

  tick(deltaMs: number): void {
    (['Q', 'W', 'E', 'R'] as const).forEach((k) => {
      this.cooldownMs[k] = Math.max(0, this.cooldownMs[k] - deltaMs);
    });
  }

  isReady(skill: keyof SkillCooldown): boolean {
    return this.cooldownMs[skill] <= 0;
  }

  remainingMs(skill: keyof SkillCooldown): number {
    return this.cooldownMs[skill];
  }

  /** 执行 Q 居合斩。返回是否成功释放（冷却中返回 false）。 */
  castQ(player: Player): boolean {
    if (!this.isReady('Q')) return false;
    this.cooldownMs.Q = SKILL_Q_COOLDOWN_MS;

    const facing = player.getFacing();
    const dx = facing === 'right' ? 1 : -1;

    // —— 瞬时冲刺物理位移 ——
    const body = (player as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    const scene = (player as unknown as { scene: Phaser.Scene }).scene;
    const dashDuration = (SKILL_Q_DASH_DISTANCE / SKILL_Q_DASH_SPEED) * 1000;

    body.setVelocity(dx * SKILL_Q_DASH_SPEED, 0);
    scene.time.delayedCall(dashDuration, () => { body.setVelocity(0, 0); });

    // —— 让 BattleScene 监听此事件做路径判定 ——
    scene.events.emit('skill:q-start', {
      playerX: player.x, playerY: player.y,
      dx,
      distance: SKILL_Q_DASH_DISTANCE,
      width: SKILL_Q_WIDTH,
      damage: SKILL_Q_DAMAGE,
    });
    return true;
  }

  /** 普攻判定：矩形扫描 facing 方向。 */
  resolveNormalAttack(player: { x: number; y: number; getFacing(): 'left' | 'right' }): {
    dx: number; rect: Phaser.Geom.Rectangle;
  } {
    const facing = player.getFacing();
    const dx = facing === 'right' ? 1 : -1;
    const cx = player.x + dx * (PLAYER_ATTACK_RANGE / 2);
    const cy = player.y;
    const rect = new Phaser.Geom.Rectangle(
      cx - PLAYER_ATTACK_RANGE / 2,
      cy - PLAYER_ATTACK_WIDTH / 2,
      PLAYER_ATTACK_RANGE,
      PLAYER_ATTACK_WIDTH,
    );
    return { dx, rect };
  }

  computeDamage = computeDamage;
}
