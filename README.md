# 《妖刀武士》(Demon Sword Samurai)

一款使用 **Phaser 4 + React + TypeScript + Vite + Zustand** 开发的 2D 俯视角经营 + 动作战斗 RPG。

## 项目定位

单人 PvE，PC 浏览器，日式黑暗奇幻。玩家扮演一名持有妖刀的流浪武士，以破败道场为据点，修缮设施、出战枫隐村、斩杀妖怪、收集装备与妖魂，揭开黄泉异变的真相。

- **核心循环**：据点经营 → 出征 → 探索 → 战斗 → 掉落 → 成长 → 返回据点升级
- **目标单局**：10–15 分钟
- **MVP 交付**：一个据点、一张主地图、三种普通怪、一种精英、一名 Boss

## 技术栈

| 层 | 技术 |
|---|---|
| 游戏引擎 | Phaser 4 (WebGL + Canvas) |
| 游戏逻辑 | TypeScript |
| UI 叠层 | React 18+ |
| 全局状态 | Zustand |
| 构建 | Vite |
| 存档 | IndexedDB + localStorage |
| 地图 | Tiled (可选) |

## 项目结构

```
src/
  phaser/    # Phaser 游戏核心（Scene / Entity / System，与 React 解耦）
  react/     # React UI 叠层（HUD / Modal / PhaserCanvas 挂载点）
  store/     # Zustand 全局状态（存档 + 实时状态 + 资源）
  assets/    # 原始资源（sprites / tilemaps / audio）
```

## 文档

| 文档 | 说明 |
|---|---|
| [产品需求文档](docs/妖刀武士-产品需求文档-PRD.md) | PRD v1.0，MVP 产品定义稿 |
| [技术架构文档](docs/architecture.md) | Phaser 4 + React + Zustand 架构、目录结构、开发步骤 |
| [美术资源清单](docs/art-assets.md) | MVP 所需全部美术资源规格 + 占位符方案 |

## 开发阶段

| Phase | 目标 | 周期 |
|---|---|---|
| 0 | 技术原型 + 占位符 | 1–2 周 |
| 1 | MVP 0.1 核心战斗 | 2–3 周 |
| 2 | MVP 0.2 战斗循环 | 3–4 周 |
| 3 | MVP 0.3 角色 Build | 3–4 周 |
| 4 | MVP 0.4 关卡闭环 | 4–5 周 |
| 5 | MVP 1.0 试玩打磨 | 2–3 周 |

## 快速启动

```bash
npm install
npm run dev      # Vite dev server，含 PhaserCanvas 占位符场景
npm run build    # 产出可静态部署的 dist/
npm run preview  # 预览 build 产物
```

## 构建约束

- 同屏活跃实体 ≤ 20
- 总纹理内存 ≤ 60 MB
- 帧率目标 60 FPS（Boss 战 ≥ 50 FPS）
- 资源总量 ≤ 20 MB（Phase 5 替换正式资源时需复核）
