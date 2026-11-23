import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { createPhaserGame } from '@/phaser/PhaserGame.js';

/**
 * 挂载 Phaser.Game 实例到 div#phaser-container。
 *
 * 关键点：
 * - Phaser.Game 在 useEffect 内创建，React 不参与每帧渲染循环
 * - 返回 cleanup 函数：卸载时 game.destroy() 并置 null，避免内存泄漏
 * - 用 useRef 持有 game 实例，React 组件本身不 re-render
 */
export function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = createPhaserGame({ parentId: containerRef.current.id });
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      id="phaser-container"
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    />
  );
}
