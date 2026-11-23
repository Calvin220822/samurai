import type Phaser from 'phaser';

/** 全局持有 Phaser.Game，供 React 层暂停 / 恢复当前场景。 */
let gameInstance: Phaser.Game | null = null;

export function setGameInstance(game: Phaser.Game): void {
  gameInstance = game;
}

export function getGameInstance(): Phaser.Game | null {
  return gameInstance;
}

/** 暂停 / 恢复指定场景（场景不存在时静默忽略） */
export function setScenePaused(sceneKey: string | null, paused: boolean): void {
  if (!gameInstance || !sceneKey) return;
  try {
    const scene = gameInstance.scene.getScene(sceneKey);
    if (!scene) return;
    if (paused) gameInstance.scene.pause(sceneKey);
    else gameInstance.scene.resume(sceneKey);
  } catch {
    /* 场景切换过程中可能已销毁，忽略 */
  }
}
