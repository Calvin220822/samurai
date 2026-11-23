import { PhaserCanvas } from '@/react/components/Phaser/PhaserCanvas.js';
import { GameOverlay } from '@/react/components/GameOverlay.js';

/**
 * 应用根组件。
 * Phaser Canvas 铺底，React 悬浮层（角色 / 锻造 / 神龛面板）叠加其上。
 */
export default function App() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <PhaserCanvas />
      <GameOverlay />
    </div>
  );
}
