/**
 * 升级系统（Phase 2）。
 *
 * 规则（PRD 7.1–7.5）：
 * - 1–10 级，exp 累积到达下一级 → 升级
 * - 每级 HP +40 / ATK +5 / DEF +1 / 1 个技能点
 * - 升级立即回 20% HP 作为正向反馈
 */
import { EXP_TO_LEVEL, LEVEL_UP_ATK_GAIN, LEVEL_UP_DEF_GAIN, LEVEL_UP_HP_GAIN, LEVEL_UP_EXP_GAIN, MAX_LEVEL } from '../config/Constants.js';
import { useGameStore } from '@/store/gameStore.js';

export interface LevelUpEvent {
  newLevel: number;
  hpGained: number;
  atkGained: number;
  defGained: number;
  skillGained: number;
  healedHp: number;
}

export class LevelSystem {
  /** 增加经验，返回是否有升级 */
  addExp(amount: number): LevelUpEvent[] {
    const events: LevelUpEvent[] = [];
    const store = useGameStore.getState();
    let exp = store.player.exp + amount;
    let level = store.player.level;
    let hp = store.player.hp;
    let maxHp = store.player.maxHp;
    let skillPoints = (store.player as any).skillPoints ?? 0;

    while (level < MAX_LEVEL && exp >= EXP_TO_LEVEL(level)) {
      exp -= EXP_TO_LEVEL(level);
      level += 1;
      maxHp += LEVEL_UP_HP_GAIN;
      const heal = Math.round(LEVEL_UP_HP_GAIN * 0.2);  // 升级瞬间回 20% 新增 HP
      hp = Math.min(maxHp, hp + heal);
      skillPoints += LEVEL_UP_EXP_GAIN;

      events.push({
        newLevel: level,
        hpGained: LEVEL_UP_HP_GAIN,
        atkGained: LEVEL_UP_ATK_GAIN,
        defGained: LEVEL_UP_DEF_GAIN,
        skillGained: LEVEL_UP_EXP_GAIN,
        healedHp: heal,
      });
    }

    useGameStore.setState((s) => ({
      player: { ...s.player, level, exp, hp, maxHp, skillPoints },
    }));
    return events;
  }
}
