/**
 * 伤害计算器（集中式）。
 * 所有伤害都走这一处，保证"刀已命中但无反馈"不会发生。
 * Phase 1 简化版：伤害 = base * (1 - 防御减伤率) * 暴击 * 妖魂，防御减伤率上限 50%。
 */

export interface DamageInput {
  base: number;
  attackerIsPlayer: boolean;
  defenderDef: number;
  crit?: boolean;
  critMult?: number;
}

export function computeDamage(input: DamageInput): number {
  const { base, defenderDef, crit, critMult = 1.5 } = input;

  // 防御减伤：防御 10 减伤 30%，上限 50%
  const defRate = Math.min(defenderDef * 0.03, 0.5);
  let dmg = base * (1 - defRate);

  if (crit) dmg *= critMult;

  // 保底：10% 基础伤害，避免防御归零
  return Math.max(Math.round(dmg), Math.round(base * 0.1));
}
