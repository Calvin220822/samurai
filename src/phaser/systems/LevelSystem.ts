/**
 * 升级系统。
 *
 * 规则（PRD 7.1–7.5）：
 * - 1–10 级，exp 累积到达下一级 → 升级
 * - 每级 HP +40 / ATK +5 / DEF +1 / 1 个技能点
 * - 升级立即回 20% 新增 HP 作为正向反馈
 *
 * Phase 5：升级后调用 recomputeDerivedStats，ATK / DEF / levelExp 同步刷新。
 */
import {
  EXP_TO_LEVEL, LEVEL_UP_ATK_GAIN, LEVEL_UP_DEF_GAIN, LEVEL_UP_HP_GAIN,
  LEVEL_UP_EXP_GAIN, MAX_LEVEL,
} from '../config/Constants.js';
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
  /** 增加经验，返回本次触发的所有升级事件 */
  addExp(amount: number): LevelUpEvent[] {
    const events: LevelUpEvent[] = [];
    const store = useGameStore.getState();
    let exp = store.player.exp + amount;
    let level = store.player.level;
    let skillPoints = store.player.skillPoints;
    let healedTotal = 0;

    while (level < MAX_LEVEL && exp >= EXP_TO_LEVEL(level)) {
      exp -= EXP_TO_LEVEL(level);
      level += 1;
      skillPoints += LEVEL_UP_EXP_GAIN;
      healedTotal += Math.round(LEVEL_UP_HP_GAIN * 0.2);

      events.push({
        newLevel: level,
        hpGained: LEVEL_UP_HP_GAIN,
        atkGained: LEVEL_UP_ATK_GAIN,
        defGained: LEVEL_UP_DEF_GAIN,
        skillGained: LEVEL_UP_EXP_GAIN,
        healedHp: healedTotal,
      });
    }

    if (level === store.player.level) {
      // 未升级，只累加经验
      useGameStore.setState((s) => ({ player: { ...s.player, exp } }));
      return events;
    }

    useGameStore.setState((s) => ({
      player: { ...s.player, level, exp, skillPoints },
    }));
    store.recomputeDerivedStats();

    // 升级回血
    const st = useGameStore.getState();
    useGameStore.setState({
      player: { ...st.player, hp: Math.min(st.player.maxHp, st.player.hp + healedTotal) },
    });

    return events;
  }
}
