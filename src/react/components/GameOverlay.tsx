import { useEffect, useMemo, useState } from 'react';
import {
  useGameStore, enhanceCost, MAX_ENHANCE_LEVEL, MAX_SKILL_LEVEL,
  type SkillId, type UiPanel,
} from '@/store/gameStore.js';
import { EQUIPMENT_DB, RARITY_LABEL, SLOT_LABEL, type SlotId } from '@/phaser/data/equipment.js';
import { SOUL_DB } from '@/phaser/data/souls.js';
import { setScenePaused } from '@/phaser/gameInstance.js';
import { clearSave, saveGame } from '@/phaser/systems/SaveSystem.js';
import './GameOverlay.css';

const SLOT_ORDER: SlotId[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'];

const SKILL_INFO: Record<SkillId, { name: string; a: string; b: string }> = {
  Q: { name: '居合斩', a: '伤害 +15%/级', b: '冷却 -10%/级' },
  W: { name: '旋风斩', a: '范围 +15%/级', b: '伤害 +15%/级' },
  E: { name: '影步', a: '冷却 -12%/级', b: '无敌 +80ms/级' },
  R: { name: '鬼神斩', a: '伤害 +20%/级', b: '冷却 -15%/级' },
};

const TABS: { key: UiPanel; label: string }[] = [
  { key: 'character', label: '角色' },
  { key: 'build', label: '锻造' },
  { key: 'shrine', label: '神龛' },
];

/**
 * React 悬浮 UI 层：角色 / 锻造 / 神龛 三个面板。
 *
 * - store.uiPanel 驱动显隐；面板打开时暂停当前 Phaser 场景
 * - Esc 打开 / 关闭，避免 Phaser 场景暂停后输入失效
 */
export function GameOverlay() {
  const uiPanel = useGameStore((s) => s.uiPanel);
  const currentScene = useGameStore((s) => s.currentScene);
  const player = useGameStore((s) => s.player);
  const resources = useGameStore((s) => s.resources);
  const equipment = useGameStore((s) => s.equipment);
  const enhancements = useGameStore((s) => s.enhancements);
  const skillUpgrades = useGameStore((s) => s.skillUpgrades);
  const souls = useGameStore((s) => s.souls);

  const [msg, setMsg] = useState('');
  const open = uiPanel !== 'none';
  const canOpen = currentScene === 'BattleScene' || currentScene === 'HomeScene';

  // 面板打开时暂停当前场景，关闭时恢复
  useEffect(() => {
    if (!currentScene) return;
    setScenePaused(currentScene, open);
    return () => { if (open) setScenePaused(currentScene, false); };
  }, [open, currentScene]);

  // Esc：打开 / 关闭面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useGameStore.getState();
      if (s.uiPanel !== 'none') {
        s.setUiPanel('none');
        e.preventDefault();
      } else if (s.currentScene === 'BattleScene' || s.currentScene === 'HomeScene') {
        s.setUiPanel('character');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setMsg(''); }, [uiPanel]);

  const stats = useMemo(() => {
    const st = useGameStore.getState();
    return { atk: st.getEffectiveAtk(), def: st.getEffectiveDef() };
    // equipment / enhancements 变化时重算
  }, [equipment, enhancements, player.level, player.bonusMaxHp]);

  const setPanel = (p: UiPanel) => useGameStore.getState().setUiPanel(p);

  const handleEnhance = (slot: SlotId) => {
    const ok = useGameStore.getState().enhanceSlot(slot);
    setMsg(ok ? `强化成功：${SLOT_LABEL[slot]} → +${useGameStore.getState().enhancements[slot]}` : '强化失败：未装备 / 已满级 / 资源不足');
  };

  const handleUpgrade = (skill: SkillId, branch: 'a' | 'b') => {
    const ok = useGameStore.getState().upgradeSkill(skill, branch);
    setMsg(ok ? `技能强化成功：${SKILL_INFO[skill].name}` : '技能点不足 / 已满级');
  };

  const handlePray = () => {
    const st = useGameStore.getState();
    if (st.resources.soulShards < 10) { setMsg('妖魂碎片不足（需要 10）'); return; }
    st.spendResources({ soulShards: 10 });
    st.prayMaxHp();
    setMsg('神灵庇佑：最大 HP +20');
  };

  const handleRest = () => {
    useGameStore.getState().restAtHome();
    setMsg('已休息至满血');
  };

  const handleSave = async () => {
    const ok = await saveGame();
    setMsg(ok ? '已存档' : '存档失败');
  };

  const handleReset = async () => {
    if (!window.confirm('确认清除存档并重新开始？此操作不可撤销。')) return;
    await clearSave();
    window.location.reload();
  };

  if (!open) {
    return canOpen ? (
      <div className="go-root">
        <button className="go-fab" onClick={() => setPanel('character')}>☰ 角色 / 面板 (Esc)</button>
      </div>
    ) : null;
  }

  const hpRatio = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
  const expRatio = Math.max(0, Math.min(1, player.exp / Math.max(1, player.levelExp)));

  return (
    <div className="go-root">
      <div className="go-overlay" onMouseDown={() => setPanel('none')}>
        <div className="go-modal" onMouseDown={(e) => e.stopPropagation()}>
          <div className="go-head">
            <span className="go-title">隐月道场</span>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`go-tab${uiPanel === t.key ? ' active' : ''}`}
                onClick={() => setPanel(t.key)}
              >
                {t.label}
              </button>
            ))}
            <button className="go-close" onClick={() => setPanel('none')}>关闭 (Esc)</button>
          </div>

          <div className="go-body">
            {uiPanel === 'character' && (
              <div className="go-grid">
                <div className="go-card">
                  <h3>属性</h3>
                  <div className="go-profile">
                    <img className="go-portrait" src="/assets/portrait_0.png" alt="妖刀武士" />
                    <div className="go-profile-stats">
                      <div className="go-stat-row"><span>HP</span><b>{player.hp} / {player.maxHp}</b></div>
                      <div className="go-bar hp"><i style={{ width: `${hpRatio * 100}%` }} /></div>
                      <div className="go-stat-row"><span>等级</span><b>Lv.{player.level}</b></div>
                      <div className="go-bar exp"><i style={{ width: `${expRatio * 100}%` }} /></div>
                      <div className="go-stat-row"><span>经验</span><b>{player.exp} / {player.levelExp}</b></div>
                      <div className="go-stat-row"><span>攻击 / 防御</span><b>{stats.atk} / {stats.def}</b></div>
                      <div className="go-stat-row"><span>技能点</span><b>{player.skillPoints}</b></div>
                      <button className="go-btn" style={{ marginTop: 10 }} onClick={handleRest}>休息至满血</button>
                    </div>
                  </div>
                </div>

                <div className="go-card">
                  <h3>资源</h3>
                  <div className="go-stat-row"><span>金币</span><b>{resources.gold}</b></div>
                  <div className="go-stat-row"><span>木材</span><b>{resources.wood}</b></div>
                  <div className="go-stat-row"><span>铁矿</span><b>{resources.iron}</b></div>
                  <div className="go-stat-row"><span>妖魂碎片</span><b>{resources.soulShards}</b></div>
                </div>

                <div className="go-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>装备（共 {SLOT_ORDER.length} 部位）</h3>
                  {SLOT_ORDER.map((slot) => {
                    const id = equipment[slot];
                    const item = id ? EQUIPMENT_DB[id] : null;
                    const lv = enhancements[slot];
                    const cost = enhanceCost(lv);
                    const canEnhance = !!item && lv < MAX_ENHANCE_LEVEL
                      && resources.gold >= cost.gold && resources.iron >= cost.iron;
                    return (
                      <div className="go-slot" key={slot}>
                        <span className="slot-name">{SLOT_LABEL[slot]}</span>
                        <span className={`slot-item${item ? '' : ' empty'}`}>
                          {item ? `${item.name} · ${RARITY_LABEL[item.rarity]}` : '未装备'}
                        </span>
                        <span className="slot-lv">+{lv}</span>
                        <button
                          className="go-btn"
                          disabled={!canEnhance}
                          onClick={() => handleEnhance(slot)}
                          title={item ? `消耗 ${cost.gold} 金 + ${cost.iron} 铁` : '未装备'}
                        >
                          {lv >= MAX_ENHANCE_LEVEL ? '已满级' : `强化 ${cost.gold}金`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="go-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>技能升级（每级消耗 1 技能点，当前 {player.skillPoints}）</h3>
                  {(Object.keys(SKILL_INFO) as SkillId[]).map((skill) => {
                    const info = SKILL_INFO[skill];
                    const up = skillUpgrades[skill];
                    return (
                      <div className="go-skill" key={skill}>
                        <span className="sk-name">{skill} {info.name}</span>
                        <span className="sk-branch">
                          A {info.a} <span className="sk-lv">Lv.{up.a}/{MAX_SKILL_LEVEL}</span>
                          <button className="go-btn" disabled={player.skillPoints <= 0 || up.a >= MAX_SKILL_LEVEL} onClick={() => handleUpgrade(skill, 'a')}>强化</button>
                        </span>
                        <span className="sk-branch">
                          B {info.b} <span className="sk-lv">Lv.{up.b}/{MAX_SKILL_LEVEL}</span>
                          <button className="go-btn" disabled={player.skillPoints <= 0 || up.b >= MAX_SKILL_LEVEL} onClick={() => handleUpgrade(skill, 'b')}>强化</button>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="go-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>妖魂</h3>
                  {souls.length === 0 && <div className="go-hint">尚未获得妖魂。击败精英怪与 Boss 有机会获得。</div>}
                  {souls.map((id) => {
                    const soul = SOUL_DB[id];
                    if (!soul) return null;
                    return (
                      <div className="go-soul" key={id}>
                        <b>{soul.name}</b>
                        <span>{soul.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {uiPanel === 'build' && (
              <div className="go-card">
                <h3>刀匠铺 · 装备强化</h3>
                <div className="go-hint" style={{ marginBottom: 10 }}>
                  强化消耗金币与铁矿。当前：金币 {resources.gold} · 铁矿 {resources.iron}
                </div>
                {SLOT_ORDER.map((slot) => {
                  const id = equipment[slot];
                  const item = id ? EQUIPMENT_DB[id] : null;
                  const lv = enhancements[slot];
                  const cost = enhanceCost(lv);
                  const canEnhance = !!item && lv < MAX_ENHANCE_LEVEL
                    && resources.gold >= cost.gold && resources.iron >= cost.iron;
                  return (
                    <div className="go-slot" key={slot}>
                      <span className="slot-name">{SLOT_LABEL[slot]}</span>
                      <span className={`slot-item${item ? '' : ' empty'}`}>{item ? item.name : '未装备'}</span>
                      <span className="slot-lv">+{lv} / {MAX_ENHANCE_LEVEL}</span>
                      <button className="go-btn" disabled={!canEnhance} onClick={() => handleEnhance(slot)}>
                        {lv >= MAX_ENHANCE_LEVEL ? '已满级' : `强化 (${cost.gold}金/${cost.iron}铁)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {uiPanel === 'shrine' && (
              <div className="go-grid">
                <div className="go-card">
                  <h3>祈祷</h3>
                  <div className="go-hint" style={{ marginBottom: 10 }}>
                    消耗 10 妖魂碎片，永久提升最大 HP +20。当前碎片：{resources.soulShards}
                  </div>
                  <button className="go-btn" disabled={resources.soulShards < 10} onClick={handlePray}>祈祷（10 妖魂）</button>
                </div>
                <div className="go-card">
                  <h3>休整</h3>
                  <div className="go-hint" style={{ marginBottom: 10 }}>恢复全部 HP。HP：{player.hp} / {player.maxHp}</div>
                  <button className="go-btn" onClick={handleRest}>休息至满血</button>
                </div>
                <div className="go-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>已获得妖魂</h3>
                  {souls.length === 0 && <div className="go-hint">暂无妖魂。</div>}
                  {souls.map((id) => {
                    const soul = SOUL_DB[id];
                    if (!soul) return null;
                    return (
                      <div className="go-soul" key={id}>
                        <b>{soul.name}</b>
                        <span>{soul.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {msg && <div className="go-msg">{msg}</div>}
          </div>

          <div className="go-foot">
            <span>Esc 关闭面板 · WASD 移动 · 空格普攻 · Q/W/E/R 技能 · F 交互</span>
            <span className="spacer" />
            <button className="go-btn" onClick={handleSave}>立即存档</button>
            <button className="go-btn danger" onClick={handleReset}>重置存档</button>
          </div>
        </div>
      </div>
    </div>
  );
}
