import type { Handler } from './types.js';

/**
 * 通用事件总线：Phaser Entity → Phaser System → React UI 解耦。
 * 纯事件订阅/发布，零外部依赖。
 */

class EventBusImpl {
  private listeners = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((h) => {
      try { h(...args); } catch (err) { console.error(`[EventBus] handler for ${event} threw:`, err); }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const EventBus = new EventBusImpl();

/** 事件常量（集中维护，避免字符串散落） */
export const EVT = {
  PLAYER_SPAWNED: 'player:spawned',
  PLAYER_HIT: 'player:hit',
  PLAYER_DEAD: 'player:dead',
  PLAYER_MOVE: 'player:move',
  ENEMY_HIT: 'enemy:hit',
  ENEMY_DEAD: 'enemy:dead',
  ENEMY_ATTACK: 'enemy:attack',
  SCENE_CHANGED: 'scene:changed',
  DROP_PICKED: 'drop:picked',
  EXPERIENCE_GAINED: 'exp:gained',
  INVENTORY_CHANGED: 'ui:inventory-changed',
  RESOURCE_CHANGED: 'ui:resource-changed',
} as const;
