/**
 * 技能系统。
 *
 * 键位：Q 居合斩 / W 旋风斩 / E 影步 / R 鬼神斩。
 *
 * Phase 5：接入两条成长线
 * - 妖魂（SoulSystem）：改变技能形态（W 半径 / E 无敌）
 * - 技能升级（store.skillUpgrades）：A 路线强化主效果，B 路线强化冷却/副效果
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
import { useGameStore, type SkillId } from '@/store/gameStore.js';

export interface SkillCooldown { Q: number; W: number; E: number; R: number; }

export class SkillSystem {
  private cd: SkillCooldown = { Q: 0, W: 0, E: 0, R: 0 };
  private cdMax: SkillCooldown = {
    Q: SKILL_Q_COOLDOWN_MS, W: SKILL_W_COOLDOWN_MS,
    E: SKILL_E_COOLDOWN_MS, R: SKILL_R_COOLDOWN_MS,
  };

  reset(): void { this.cd = { Q: 0, W: 0, E: 0, R: 0 }; }

  tick(deltaMs: number): void {
    (['Q', 'W', 'E', 'R'] as const).forEach((k) => {
      this.cd[k] = Math.max(0, this.cd[k] - deltaMs);
    });
  }

  isReady(s: SkillId): boolean { return this.cd[s] <= 0; }
  remainingMs(s: SkillId): number { return this.cd[s]; }
  getMaxCooldown(s: SkillId): number { return this.cdMax[s]; }
  /** 0 = 就绪，1 = 刚好释放 */
  cooldownRatio(s: SkillId): number {
    const max = this.cdMax[s];
    return max <= 0 ? 0 : Math.min(1, this.cd[s] / max);
  }

  // —— 成长系数 ——
  private mods(skill: SkillId) {
    return useGameStore.getState().skillMods(skill);
  }
  private qDamage(): number { return Math.round(SKILL_Q_DAMAGE * (1 + 0.15 * this.mods('Q').a)); }
  private qCd(): number { return Math.round(SKILL_Q_COOLDOWN_MS * (1 - 0.10 * this.mods('Q').b)); }
  private wRadius(): number {
    const base = SKILL_W_RADIUS * (1 + 0.15 * this.mods('W').a);
    return soulSystem.aggregateRadius('W', base);
  }
  private wDamage(): number { return Math.round(SKILL_W_DAMAGE * (1 + 0.15 * this.mods('W').b)); }
  private eCd(): number { return Math.round(SKILL_E_COOLDOWN_MS * (1 - 0.12 * this.mods('E').a)); }
  private eInvuln(): number {
    return soulSystem.aggregateInvuln(SKILL_E_INVULN_MS + 80 * this.mods('E').b);
  }
  private rDamage(): number { return Math.round(SKILL_R_DAMAGE * (1 + 0.20 * this.mods('R').a)); }
  private rCd(): number { return Math.round(SKILL_R_COOLDOWN_MS * (1 - 0.15 * this.mods('R').b)); }

  /** Q 居合斩：向前冲刺，路径矩形伤害 */
  castQ(player: Player): boolean {
    if (!this.isReady('Q')) return false;
    this.cd.Q = this.cdMax.Q = this.qCd();

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
      damage: this.qDamage(),
    });
    return true;
  }

  /** W 旋风斩：原地圆形范围 */
  castW(player: Player): boolean {
    if (!this.isReady('W')) return false;
    this.cd.W = this.cdMax.W = SKILL_W_COOLDOWN_MS;

    const scene = getScene(player);
    const body = getArcadeBody(player);
    body.setVelocity(0, 0);

    soulSystem.emitSkillCast('W');
    scene.events.emit('skill:w-start', {
      x: player.x, y: player.y,
      radius: this.wRadius(), damage: this.wDamage(),
      castMs: SKILL_W_CAST_MS,
    });
    return true;
  }

  /** E 影步：短位移 + 无敌，返回无敌时长（0 表示未释放） */
  castE(player: Player, moveDir: { dx: number; dy: number }): number {
    if (!this.isReady('E')) return 0;
    this.cd.E = this.cdMax.E = this.eCd();

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

    soulSystem.emitSkillCast('E');
    return this.eInvuln();
  }

  /** R 鬼神斩：600ms 蓄力后 120° 大扇形 */
  castR(player: Player): boolean {
    if (!this.isReady('R')) return false;
    this.cd.R = this.cdMax.R = this.rCd();

    const scene = getScene(player);
    const body = getArcadeBody(player);
    body.setVelocity(0, 0);

    scene.events.emit('skill:r-charge', { x: player.x, y: player.y });

    scene.time.delayedCall(SKILL_R_CAST_MS, () => {
      if (!player.active) return;
      const facing = player.getFacing();
      const dx = facing === 'right' ? 1 : -1;
      scene.events.emit('skill:r-start', {
        x: player.x, y: player.y, dx,
        fanRadius: SKILL_R_FAN_RADIUS, fanAngleDeg: SKILL_R_FAN_ANGLE_DEG,
        damage: this.rDamage(),
      });
      soulSystem.emitSkillCast('R');
    });
    return true;
  }

  /** 普攻矩形（给场景做命中判定） */
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
