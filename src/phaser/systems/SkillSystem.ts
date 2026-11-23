/**
 * 技能系统（Phase 2 完整实现）。
 *
 * 实现：
 * - 普攻矩形判定
 * - Q 居合斩：瞬时冲刺 + 路径扫描
 * - W 旋风斩：圆范围 + 短暂定身
 * - E 影步：朝移动方向短距离位移 + 短暂规避 + 残影
 *
 * 设计：SkillSystem 只管"发射事件 + 物理位移"，实际伤害判定全部在 BattleScene 监听事件做，
 * 保证新增技能不改 SkillSystem 主逻辑。
 */

import Phaser from 'phaser';
import {
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_WIDTH,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_DAMAGE,
  SKILL_Q_DASH_DISTANCE,
  SKILL_Q_DASH_SPEED,
  SKILL_Q_WIDTH,
  SKILL_W_COOLDOWN_MS,
  SKILL_W_RADIUS,
  SKILL_W_DAMAGE,
  SKILL_W_CAST_MS,
  SKILL_E_COOLDOWN_MS,
  SKILL_E_DISTANCE,
  SKILL_E_INVULN_MS,
} from '../config/Constants.js';
import { computeDamage } from '../core/DamageCalculator.js';
import type { Player } from '../entities/Player.js';

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

    scene.events.emit('skill:q-start', {
      x: player.x, y: player.y, dx,
      distance: SKILL_Q_DASH_DISTANCE, width: SKILL_Q_WIDTH,
      damage: SKILL_Q_DAMAGE,
    });
    return true;
  }

  /** W 旋风斩 */
  castW(player: Player): boolean {
    if (!this.isReady('W')) return false;
    this.cd.W = SKILL_W_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);

    // 短暂定身
    body.setVelocity(0, 0);

    scene.events.emit('skill:w-start', {
      x: player.x, y: player.y,
      radius: SKILL_W_RADIUS, damage: SKILL_W_DAMAGE,
    });

    scene.time.delayedCall(SKILL_W_CAST_MS, () => { /* 释放 */ });
    return true;
  }

  /** E 影步 */
  castE(player: Player, moveDir: { dx: number; dy: number }): boolean {
    if (!this.isReady('E')) return false;
    this.cd.E = SKILL_E_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);

    // 位移方向：优先移动方向，否则朝向
    let dx = moveDir.dx !== 0 || moveDir.dy !== 0 ? moveDir.dx : (player.getFacing() === 'right' ? 1 : -1);
    let dy = moveDir.dx !== 0 || moveDir.dy !== 0 ? moveDir.dy : 0;
    const mag = Math.hypot(dx, dy) || 1;
    dx /= mag; dy /= mag;

    // 残影 + 位移
    scene.events.emit('skill:e-start', { x: player.x, y: player.y, dx, dy });

    // 直接 Teleport 到目标点（更干净，不穿墙）
    const targetX = Phaser.Math.Clamp(
      player.x + dx * SKILL_E_DISTANCE,
      48, Phaser.GameObjects.GameObject.prototype.scene ? 1232 : 1232,  // 墙内安全区
    );
    void targetX;

    // 用 body velocity 瞬时冲一段，让 BattleScene 的墙体 collider 自然阻挡穿墙
    const instantSpeed = 2000;
    body.setVelocity(dx * instantSpeed, dy * instantSpeed);
    const durMs = (SKILL_E_DISTANCE / instantSpeed) * 1000;
    scene.time.delayedCall(durMs + 10, () => body.setVelocity(0, 0));

    scene.time.delayedCall(SKILL_E_INVULN_MS, () => {
      scene.events.emit('skill:e-invuln-end');
    });
    return true;
  }

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

  computeDamage = computeDamage;
}

function getArcadeBody(obj: Player): Phaser.Physics.Arcade.Body {
  return (obj as unknown as { body: Phaser.Physics.Arcade.Body }).body;
}
function getScene(obj: Player): Phaser.Scene {
  return (obj as unknown as { scene: Phaser.Scene }).scene;
}
