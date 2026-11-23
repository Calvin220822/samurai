# 《妖刀武士》技术架构文档

> **版本**：1.0 · **日期**：2026-11-23
> **对应 PRD**：`docs/妖刀武士-产品需求文档-PRD.md` v1.0
> **目标交付**：MVP 1.0 可在 PC 浏览器静态部署的完整游戏

---

## 0. 假设前提

以下假设若有变更可一键替换，全文不夹带未经用户确认的玩法设定：

1. 团队规模：独立开发者 / 小团队（1–3 人）
2. 美术资源：先用占位符（Phaser Graphics 程序化绘制 + 纯色方块），后期替换为正式 Sprite Sheet
3. 目标浏览器：Chrome / Edge 最新版优先，Safari 基本兼容
4. 存档方式：localStorage（版本号 + 元数据）+ IndexedDB（背包/关卡进度）
5. 部署方式：Vite build 产物，可静态部署到 GitHub Pages / Vercel
6. 无后端服务器，纯前端游戏

---

## 1. 技术栈

| 层级 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 游戏引擎 | **Phaser 4** | 最新稳定版 | 2026 年 4 月发布，新渲染器、统一 Filter、GPU Sprite，官方推荐升级 |
| 编程语言 | **TypeScript** | 5.x | 静态类型降低多人协作错误 |
| 构建工具 | **Vite** | 最新稳定版 | HMR 极快，Phaser 官方模板支持，产物直接静态部署 |
| UI 叠层 | **React** | 18+ | 模态面板（背包/角色/暂停/结算）、HUD 技能栏、小地图 |
| 全局状态 | **Zustand** | 最新稳定版 | 轻量、独立于 React、Phaser 也能直接 subscribe |
| 包管理 | **npm** | 随 Node 20 LTS | 生态标准 |
| 版本控制 | Git + GitHub | — | 基础协作 |
| 存档 | **IndexedDB**（主）+ **localStorage**（辅） | — | 避免 5MB 上限，适合结构化存档 |
| 地图编辑（可选） | **Tiled** | 1.10+ | Phaser 4 原生支持 TMX/TSX 导入 |

### 1.1 为什么不是 Phaser 3

Phaser 4 已于 2026 年 4 月正式发布，以下是对本项目最关键的改进：
- 重建的渲染器，Sprite 性能更好
- 统一 Filter 系统（Phaser 3 的 preFX/postFX 已废弃）
- 改进的光照模型（Boss 战可以做更好的视觉反馈）
- 更好的 TypeScript 类型定义覆盖

### 1.2 React 与 Phaser 4 的正确分工（重要）

常见陷阱是让 React 参与每帧游戏循环渲染，这会造成严重性能问题。正确做法：

| 层 | 职责 | 运行时频率 |
|---|---|---|
| **Phaser 4 渲染层** | Canvas/WebGL 渲染、Scene 管理、物理、动画、Sprite、Tilemap、战斗循环 | 60 FPS，每帧 update |
| **React 模态层** | 背包、角色、暂停、结算、据点设施面板 | 仅在面板打开时挂载，关闭时卸载 |
| **React HUD 层** | 技能冷却条、血条、小地图图标 | 低频更新（< 5 次/秒） |
| **Zustand store** | 存档数据、当前角色、资源数值、任务进度 | 状态变化时触发，不触发 React 每帧重渲染 |

**集成方式**：创建 `<PhaserCanvas/>` React 组件，内部用 `useRef` 挂载 `new Phaser.Game(...)` 实例。模态 UI 作为独立 React 组件用绝对定位盖在 Canvas 之上。Phaser Scene 和 React 组件都能直接 `useGameStore.getState()` 读 Zustand store。

---

## 2. 项目目录结构

```
/
├── index.html                        # Vite 入口，只挂载 <PhaserCanvas/>
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx                      # React 入口
│   ├── App.tsx                       # 根组件：PhaserCanvas + ReactModalLayer
│   │
│   ├── phaser/                       # Phaser 游戏核心（与 React 解耦）
│   │   ├── PhaserGame.ts             # Phaser.Game 工厂 + 场景注册
│   │   ├── config/
│   │   │   ├── GameConfig.ts         # Phaser 全局配置（分辨率/物理/场景）
│   │   │   └── Constants.ts          # 跨系统常量（攻击距离/冷却/颜色）
│   │   ├── core/                     # 框架层
│   │   │   ├── EventBus.ts           # 全局事件总线（解耦）
│   │   │   ├── StateMachine.ts       # 通用有限状态机（角色/Boss 行为）
│   │   │   ├── DamageCalculator.ts   # 伤害计算（防御/暴击/妖魂加成）
│   │   │   ├── CollisionLayers.ts    # 碰撞层定义
│   │   │   └── types.ts              # 共享类型
│   │   ├── scenes/                   # Phaser Scene
│   │   │   ├── BootScene.ts          # 启动占位 + 全局事件注册
│   │   │   ├── PreloadScene.ts       # 资源预加载 + 进度条
│   │   │   ├── TitleScene.ts         # 标题界面（MVP 简化为一个按钮）
│   │   │   ├── HomeScene.ts          # 隐月道场（据点经营，PvE 安全区）
│   │   │   ├── BattleScene.ts        # 枫隐村 + 竹林 + 神社前庭（探索 + 普通战斗）
│   │   │   └── BossScene.ts          # 地下神社 + 赤月鬼将（独立 Scene 方便阶段重置）
│   │   ├── entities/                 # 游戏实体
│   │   │   ├── Entity.ts             # 基类（位置/碰撞/状态/事件）
│   │   │   ├── Player.ts             # 武士主角（移动/普攻/技能/受击）
│   │   │   ├── enemies/
│   │   │   │   ├── Enemy.ts          # 基类（AI 状态机/预警/掉落）
│   │   │   │   ├── RedOni.ts         # 赤鬼
│   │   │   │   ├── BoneSamurai.ts    # 骸骨武士
│   │   │   │   ├── Wraith.ts         # 怨灵
│   │   │   │   ├── EliteGeneral.ts   # 精英鬼将
│   │   │   │   └── BossAkatsuki.ts   # Boss 赤月鬼将（两阶段）
│   │   │   └── drops/LootItem.ts     # 地面掉落物
│   │   ├── systems/                  # 业务系统（数据驱动）
│   │   │   ├── InputSystem.ts        # 键盘/鼠标 → 标准化动作
│   │   │   ├── SkillSystem.ts        # Q/W/E/R 释放框架（冷却/方向/判定）
│   │   │   ├── EquipmentSystem.ts    # 6 部位装备槽 + 属性汇总
│   │   │   ├── SoulSystem.ts         # 3 妖魂槽 + 被动 hook 挂载
│   │   │   ├── LevelSystem.ts        # 经验/升级/技能点
│   │   │   ├── EconomySystem.ts      # 金币/木材/铁矿/妖魂碎片
│   │   │   ├── SaveSystem.ts         # IndexedDB 读写
│   │   │   ├── FacilitySystem.ts      # 据点设施修复 + 升级
│   │   │   └── SpawnSystem.ts        # 区域刷怪
│   │   ├── data/                     # 纯配置（与代码分离）
│   │   │   ├── enemies.ts             # 怪物属性表
│   │   │   ├── equipment.ts           # PRD 8.5 节 20 件装备
│   │   │   ├── souls.ts               # PRD 9.3 节 6 种妖魂
│   │   │   ├── skills.ts              # PRD 6.8 节 + 强化方向
│   │   │   └── facilities.ts          # 据点设施升级表
│   │   └── placeholders/             # 占位符生成器（Phaser Graphics）
│   │       ├── drawSamurai.ts
│   │       ├── drawEnemies.ts
│   │       ├── drawTilemaps.ts
│   │       └── drawEffects.ts
│   │
│   ├── store/                         # Zustand 全局状态
│   │   ├── gameStore.ts               # 单一 store：存档 + 实时状态 + 资源
│   │   └── selectors.ts               # 常用 selector 封装
│   │
│   ├── react/                         # React UI 叠层
│   │   ├── components/
│   │   │   ├── PhaserCanvas.tsx       # Phaser.Game 挂载点
│   │   │   ├── HUD/                   # 技能栏、小地图、血条
│   │   │   └── Modal/                 # 背包、角色、暂停、结算、设施
│   │   └── hooks/                     # 常用 Zustand 订阅 hooks
│   │
│   └── assets/                        # 原始资源（不进入最终打包）
│       ├── sprites/                   # Sprite Sheet 原始图
│       ├── tilemaps/                  # Tiled 地图源文件
│       ├── audio/                     # 音效
│       └── dist/                      # PreloadScene 加载此目录下的资源
```

**关键**：Phaser 层、React 层、Zustand store 是**三个独立目录**，Phaser 层只 import Zustand store（不 import React），React 层也只 import Zustand store（不 import Phaser 类型）。

---

## 3. 核心架构模式

### 3.1 Scene 分层（关键设计）

Phaser Scene 有 `runWhenPaused` 选项，解决"模态面板打开时游戏暂停但 UI 保持响应"：

| Scene | 层级 | runWhenPaused | 说明 |
|---|---|---|---|
| BootScene | 最底 | false | 启动即销毁 |
| PreloadScene | 底 | false | 加载完销毁 |
| TitleScene | 世界层 | false | MVP 简化版，后续可扩展 |
| HomeScene | 世界层 | false | 据点场景，设施交互 |
| BattleScene | 世界层 | false | 探索 + 普通战斗 |
| BossScene | 世界层 | false | 地下神社 + 赤月鬼将 |

暂停期间 `this.game.loop.sleep()`，世界层的 `update()` 不再执行，**技能冷却自动停止**（PRD 5.6 节要求）。React 模态层盖在 Canvas 之上，不随 Phaser 暂停停止。

### 3.2 事件总线（解耦）

```typescript
// EventBus.emit('player:damaged', { amount, source });
// EventBus.on('enemy:hit', ({ target, source }) => { /* 妖魂效果 */ });
```

**原则**：Entity 负责发射事件，System / UI / 妖魂 hook 负责监听和响应。Entity 之间**不直接相互调用方法**，避免循环依赖。

### 3.3 伤害计算（集中一处）

```typescript
// DamageCalculator.ts — 唯一伤害公式
finalDamage = Math.max(
  baseDamage * (1 - Math.min(defenseReductionRate, 0.5)),  // 防御上限 50%
  baseDamage * 0.1                                         // 保底 10% 伤害，避免防御归零
) * critMultiplier
  * product(soulBonuses)
  * equipmentBonus;
```

**普攻、四个技能、Boss 所有攻击**都调用这一处。避免"刀已命中但敌人无反馈"（PRD 5.3 节验收项）。

### 3.4 技能系统（数据驱动）

```typescript
// data/skills.ts
export const SKILLS = {
  Q: { cooldown: 5, range: 4, damage: 2.0, type: 'dash-slash', ... },
  W: { cooldown: 8, radius: 3, damage: 1.2, type: 'aoe-circle', ... },
  E: { cooldown: 6, distance: 5, invulnMs: 200, type: 'dodge', ... },
  R: { cooldown: 30, fanRadius: 5, fanAngle: 120, damage: 5.0,
       type: 'fan-slash', castMs: 600, canInterrupt: true, ... },
};
```

SkillSystem 是**通用释放器**：根据 `type` 选择判定方式（`dash-slash` → 路径检测 / `aoe-circle` → 圆范围查询 / `fan-slash` → 扇形查询 / `dodge` → 不造成伤害）。

**技能强化**（PRD 6.7 节）只修改配置数值，不改 SkillSystem 代码。

### 3.5 妖魂效果（hook 挂载，不修改 Entity）

```typescript
// SoulSystem.ts
registerOnHitHook((hit) => { /* 鬼蜘蛛之魂：普攻附加中毒 */ });
registerSkillDamageModifier('W', (base) => base * 1.10); // 酒吞童子之魂
registerStatBonus('moveSpeed', 0.05);  // 天狗之魂
```

新增妖魂 = 配置加一条 + 注册 hooks。不影响现有技能和敌人代码。

### 3.6 Zustand store 结构

```typescript
interface GameStore {
  // — 存档数据（持久化到 IndexedDB） —
  version: number;
  player: {
    level: number; exp: number; hp: number;
    skillPoints: number;
    skillUpgrades: Record<'Q'|'W'|'E'|'R', 'A'|'B'|null>;
  };
  equipment: Record<Slot, string | null>;
  souls: string[];
  inventory: { id: string; count: number }[];
  resources: { gold: number; wood: number; iron: number; soulShards: number };
  facilities: Record<FacilityId, { level: number; repaired: boolean }>;
  quests: { mainCompleted: boolean; discoveries: string[] };

  // — 实时状态（不持久化） —
  currentScene: 'home' | 'battle' | 'boss' | null;
  battleResult: null | { victory: boolean; timeMs: number; kills: number };
  isPaused: boolean;

  // — Actions —
  updatePlayer: (partial: Partial<...>) => void;
  addResource: (kind, amount) => void;
  equipItem: (slot, itemId) => void;
  unequipSoul: (soulId) => void;
  save: () => Promise<void>;
  load: () => Promise<void>;
  reset: () => void;
}
```

### 3.7 Phaser ↔ Zustand 通信

```typescript
// Phaser Scene 内读 store：
const { hp, maxHp } = useGameStore.getState().player;

// 避免每帧订阅 re-render，Phaser 主动 poll（60 FPS poll 一个 number 代价可忽略）：
update(time, delta) {
  const store = useGameStore.getState();
  // ... 用 store.player.hp 判断是否倒下
}

// 写入 store（触发 React UI 低频更新）：
useGameStore.getState().addResource('gold', 50);
```

---

## 4. 关键技术决策

### 4.1 移动与碰撞

- **物理系统**：Phaser 4 Arcade Physics（AABB + 圆形碰撞，Box2D/Matter.js 过重）
- **碰撞层**：Tilemap 的 `collision` 层定义墙体；Entity 自身有独立圆形碰撞体
- **斜向速度归一化**：`velocity.x * 0.707, velocity.y * 0.707`
- **不可穿越障碍**：Q 居合斩和 E 影步的终点位置需做碰撞检测，穿墙时停止在最近合法位置

### 4.2 Boss 两阶段（状态机）

```
BossAkatsuki FSM:
  IDLE → PATROL → DETECTED → ATTACK_PHASE1 (HP > 60%)
                                 ↓ HP 跌破 60%
                              ATTACK_PHASE2 (HP ≤ 60%)
```

BossScene 独立的原因：两阶段切换时需要清除地面危险区、重置技能计时器、播放阶段切换演出。

### 4.3 存档安全

- **version 字段必须存在**：`{ version: 1, ... }`，未来版本迭代时可写 migration 函数
- **写回前做深拷贝 + 版本号校验**，损坏则回退上一个版本
- 玩家主动选"重新开始"时，先弹二次确认

### 4.4 性能预算（MVP 目标）

| 指标 | 目标 |
|---|---|
| 同屏活跃实体 | ≤ 20（玩家 + 15 普通怪 + 2 精英 + Boss 分身） |
| 单次 Sprite Sheet 帧数 | ≤ 64 帧 / 单方向动作 |
| 总纹理内存 | ≤ 60MB |
| 帧率 | 60 FPS（Boss 战 ≥ 50 FPS） |
| 首屏加载 | ≤ 3 秒 |

**防线**：Boss 战触发时 SpawnSystem 停止刷新新敌人；伤害数字、掉落物用 `Phaser.GameObjects.Group` + 对象池复用。

### 4.5 敌人 AI 最小实现（不引入行为树）

```typescript
// Enemy.update — 三层决策
const distToPlayer = this.distanceTo(player);
if (distToPlayer > attackRange) {
  this.state = 'CHASE';
  this.moveTowards(player);
} else if (this.attackCooldown <= 0) {
  this.state = 'ATTACK_WINDUP';  // 前摇（抬手动画 + 地面预警）
  this.time.delayedCall(windupMs, () => { /* 发射伤害事件 */ });
  this.attackCooldown = attackInterval;
} else {
  this.state = 'IDLE';
}
```

**攻击预警必须是视觉信号**（地面红色圆形 / 敌人抬手动画），而非仅靠音效——PRD 10.1 节明确要求。

---

## 5. 开发步骤安排

与 PRD 第 19 章版本规划对齐，每个 Phase 有**可验证交付物**。

### Phase 0：Pre-production（1–2 周）

| 任务 | 交付物 |
|---|---|
| 初始化 Vite + React + Phaser 4 + Zustand 项目 | `package.json` 可 `npm install && npm run dev`，浏览器显示占位符场景 |
| 目录骨架 | 按第 2 节结构建立，空文件带 TODO |
| 技术原型 | 武士方块在 Tilemap 俯视角地图上移动，碰撞正确 |
| 占位符生成器 | `placeholders/` 目录下生成敌人/场景/特效的 Graphics 绘制函数 |
| 数据模板 | `data/` 四个配置文件带示例条目 |

**验证**：方向键控制方块移动，墙壁阻挡，Phaser 窗口 60 FPS 稳定。

### Phase 1：MVP 0.1 核心战斗（2–3 周）

| 任务 | 交付物 |
|---|---|
| Player 完整实现 | Idle / Walk / Attack / Hit / Death 状态切换，普攻判定正确 |
| Skill Q 居合斩 | 突进 + 路径判定 + 5 秒冷却，不可穿墙 |
| 赤鬼 Enemy | 追击 + 抬手前摇 + 单次攻击 + 掉落金币 |
| 伤害数字 | 命中飘字，暴击数字更大 |
| 胜负判定 | Player HP=0 → 失败面板；赤鬼全灭 → 胜利面板（简化） |

**验证**：进场景，移动、普攻 2–3 次杀赤鬼、HP 归零出失败面板。

### Phase 2：MVP 0.2 战斗循环（3–4 周）

| 任务 | 交付物 |
|---|---|
| W 旋风斩 / E 影步 / R 鬼神斩 | 范围判定 / 位移带短暂规避 / 扇形大伤害 |
| 骸骨武士 + 怨灵 | 骸骨：前方扇形斩；怨灵：远程弹丸 + 低 HP |
| 精英鬼将 | 重斩 + 冲锋（路径预警）+ HP<50% 召唤赤鬼 |
| 经验 + 升级 | 击杀获金币/经验；达标弹升级提示 + HP 回复 20% |
| 简易背包 | 网格展示、拾取装备、穿戴后属性实时变化 |
| 主 HUD | 左上头像/血条/经验、底部 React 技能栏（含冷却遮罩） |

**验证**：进枫隐村，依次击杀三种普通怪、躲避怨灵弹丸、击败精英鬼将触发升级。

### Phase 3：MVP 0.3 角色 Build（3–4 周）

| 任务 | 交付物 |
|---|---|
| 装备 6 部位系统 | 穿脱切换，属性对比用颜色标注（React CharacterPanel） |
| 妖魂 3 槽位（先实现 3 种） | 酒吞童子 / 天狗 / 镰鼬，非战斗可更换 |
| 技能强化面板 | 每个技能 A/B 两条互斥方向 |
| 完整角色面板 | React CharacterPanel：等级/8 属性/装备槽/妖魂槽/对比 |
| Boss 赤月鬼将（第一阶段） | HP 条登场、横斩 + 地面重击 + 冲锋，前摇明显 |

**验证**：装备后属性变化正确；妖魂装备后 W 伤害确实提高 10%；Boss 横斩可通过移动离开扇形。

### Phase 4：MVP 0.4 关卡闭环（4–5 周）

| 任务 | 交付物 |
|---|---|
| 完整地图 A–F 六区域 | Tilemap 实现、区域过渡、关键路径清晰 |
| Boss 两阶段切换 | HP 跌破 60% 速度提升 + 新增鬼火爆发 |
| 关卡结算面板 | 通关用时/等级/击杀/装备/妖魂/封印楔（React ResultPanel） |
| 存档系统 | IndexedDB 读写；关闭页面再打开进度不丢 |
| 据点设施（刀匠铺 + 神龛 + 训练场） | 固定交互点、F 打开面板、升级消耗资源 |
| 教学引导 | 据点教移动 → 村口教普攻 → 多怪教 W → 竹林教 E → 首次掉落教背包 → Boss 前教预警 |

**验证**：完整走通"道场整备 → 枫隐村 → 精英 → Boss → 返回升级"，存档刷新后保留。

### Phase 5：MVP 1.0 试玩版打磨（2–3 周）

| 任务 | 交付物 |
|---|---|
| 音效占位 | 普攻命中音、暴击音、技能释放音、Boss 登场音、升级音 |
| 视觉反馈增强 | 技能残影、地面裂纹、Boss 倒地消散、妖魂光效 |
| 暂停菜单 | Esc 打开，React 模态面板，世界层正确暂停 |
| 平衡性初调 | 按试玩数据调 HP/冷却/掉落率（PRD 数值均为起点） |
| Bug 修复 + 性能 | 对象池化、低帧率场景优化 |
| 部署测试 | 静态部署，Chrome/Edge/Safari 三端验证 |

**验证**：试玩者 10–15 分钟完整通关，能说出四个技能用途差异。

---

## 6. 风险预判与缓解

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| React 参与每帧渲染 | HUD 每帧 setState | HUD 层用 `requestAnimationFrame` 只拉取数值，React 只在数值变化时 re-render |
| 移动体感不跟手 | Arcade Physics 默认参数 | Phase 0 投入 1 周调手感，参数集中在 `GameConfig.ts` |
| Boss 攻击无法躲避 | 连续技能组合无空档 | 每个攻击前摇 ≥ 600ms，技能间强制间隔 ≥ 1200ms（硬约束写在配置里） |
| 妖魂效果不感知 | 只加属性不加行为 | Phase 3 验收：装备妖魂后 5 秒内能说出"我感觉到不同" |
| 存档损坏 | 版本迭代无迁移 | `version` 字段 + SaveSystem migration 函数 |
| 性能瓶颈（Boss 战） | 同屏实体过多 | 对象池复用伤害数字/粒子，SpawnSystem 动态收缩 |
| 数值平衡失控 | 玩家秒 Boss 或被秒 | DamageCalculator 集中公式 + TTK 验算（普通怪 3–8s / 精英 15–30s / Boss 90–180s） |
