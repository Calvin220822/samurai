import { PhaserCanvas } from '@/react/components/Phaser/PhaserCanvas.js';

/**
 * 应用根组件。
 * Phase 0 只有 Phaser Canvas，后续 Phase 会在此之上叠加
 * React 模态层（ModalHost）和 React HUD 层。
 */
export default function App() {
  return <PhaserCanvas />;
}
