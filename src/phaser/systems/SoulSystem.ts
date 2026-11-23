/**
 * 妖魂系统（Phase 3）。
 *
 * 妖魂通过 hooks 挂载到 SkillSystem / DamageCalculator / 实体行为上。
 * 战斗中实时生效，无需修改 Entity 代码。
 *
 * 当前 hook 类型：
 *   - `onSkillCast(skillId, player)` → 可以修改 SkillSystem 事件参数
 *   - `modifySkillRadius(skillId, baseRadius)` → 返回修改后的半径
 *   - `onNormalAttackHit(player, damage)` → 可以修改 damage 或触发吸血等 side effect
 *   - `modifyInvulnDuration(baseMs)` → 返回修改后的无敌时间
 */

import { SOUL_DB } from '../data/souls.js';
import { useGameStore } from '@/store/gameStore.js';

type SkillId = 'Q' | 'W' | 'E' | 'R';

export interface SoulHooks {
  modifySkillRadius?: (skillId: SkillId, baseRadius: number) => number;
  modifyInvulnDuration?: (baseMs: number) => number;
  onNormalAttackHit?: (playerHp: number, damage: number) => number;  // 返回实际造成伤害（0 表示未吸血）
  onSkillCast?: (skillId: SkillId) => void;
}

const HOOKS: Record<string, SoulHooks> = {
  tengu: {
    modifySkillRadius: (skillId, base) => skillId === 'W' ? Math.round(base * 1.5) : base,
  },
  shuten_douji: {
    onNormalAttackHit: (_hp, dmg) => Math.random() < 0.15 ? Math.round(dmg * 0.1) : 0,
  },
  kamaitachi: {
    modifyInvulnDuration: (base) => base + 100,
  },
};

export class SoulSystem {
  /** 获取当前装备的所有妖魂 id */
  private getEquippedSoulIds(): string[] {
    return useGameStore.getState().souls;
  }

  /** 聚合某个 hook 的所有妖魂结果 */
  aggregateRadius(skillId: SkillId, baseRadius: number): number {
    let r = baseRadius;
    for (const id of this.getEquippedSoulIds()) {
      const h = HOOKS[id];
      if (h?.modifySkillRadius) r = h.modifySkillRadius(skillId, r);
    }
    return r;
  }

  aggregateInvuln(baseMs: number): number {
    let r = baseMs;
    for (const id of this.getEquippedSoulIds()) {
      const h = HOOKS[id];
      if (h?.modifyInvulnDuration) r = h.modifyInvulnDuration(r);
    }
    return r;
  }

  /** 普攻命中后调用，返回吸血量（0 = 不触发） */
  tryNormalAttackLifesteal(damage: number): number {
    let heal = 0;
    for (const id of this.getEquippedSoulIds()) {
      const h = HOOKS[id];
      if (h?.onNormalAttackHit) {
        const got = h.onNormalAttackHit(0, damage);
        if (got > heal) heal = got;
      }
    }
    return heal;
  }

  emitSkillCast(skillId: SkillId): void {
    for (const id of this.getEquippedSoulIds()) {
      const h = HOOKS[id];
      h?.onSkillCast?.(skillId);
    }
  }

  /** 调试用：列出装备的妖魂 */
  listEquipped(): string[] {
    return this.getEquippedSoulIds().map((id) => SOUL_DB[id]?.name ?? id);
  }
}

export const soulSystem = new SoulSystem();
