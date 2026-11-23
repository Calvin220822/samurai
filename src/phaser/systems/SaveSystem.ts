/**
 * 存档系统（IndexedDB 主存，localStorage 兜底）。
 *
 * 设计要点：
 * - version 字段 + migrate()，后续加字段可平滑升级
 * - 只持久化玩家进度字段（SavePayload），运行时的场景 / 实体不入档
 * - subscribe 防抖自动存档，避免每次伤害都写盘
 */

import { useGameStore, type SavePayload } from '@/store/gameStore.js';

const DB_NAME = 'demon-sword-samurai';
const STORE_NAME = 'save';
const RECORD_KEY = 'primary';
export const SAVE_VERSION = 1;
const LS_KEY = 'demon-sword-samurai-save';

let dbPromise: Promise<IDBDatabase | null> | null = null;
let autoSaveStarted = false;
let hydrating = false;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbGet(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db: IDBDatabase, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, RECORD_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 版本迁移：老档补齐新字段，未来版本不认识的档直接丢弃 */
export function migrate(raw: unknown): SavePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  let version = typeof data.version === 'number' ? data.version : 0;

  if (version === 0) {
    // v0（Phase 3/4 早期档）：补齐 Phase 5 字段
    data.version = 1;
    data.enhancements = data.enhancements ?? {};
    data.skillUpgrades = data.skillUpgrades ?? {};
    data.souls = data.souls ?? [];
    data.maxAreaCleared = data.maxAreaCleared ?? 0;
    version = 1;
  }

  if (version !== SAVE_VERSION) return null;
  return data as unknown as SavePayload;
}

export async function saveGame(): Promise<boolean> {
  if (hydrating) return false;
  const payload = useGameStore.getState().toSavePayload();
  const db = await openDB();
  if (db) {
    const ok = await idbPut(db, payload);
    if (ok) return true;
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export async function loadGame(): Promise<boolean> {
  const db = await openDB();
  let raw: unknown = null;
  if (db) raw = await idbGet(db);
  if (!raw) {
    try {
      const ls = localStorage.getItem(LS_KEY);
      if (ls) raw = JSON.parse(ls);
    } catch {
      raw = null;
    }
  }
  const payload = migrate(raw);
  if (!payload) return false;
  hydrating = true;
  useGameStore.getState().hydrate(payload);
  hydrating = false;
  return true;
}

export async function clearSave(): Promise<void> {
  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    } catch { /* ignore */ }
  }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

export async function hasSave(): Promise<boolean> {
  const db = await openDB();
  if (db) {
    const raw = await idbGet(db);
    if (raw) return true;
  }
  return !!localStorage.getItem(LS_KEY);
}

/** 防抖自动存档：2 秒内多次变化只写一次 */
export function initAutoSave(): void {
  if (autoSaveStarted) return;
  autoSaveStarted = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  useGameStore.subscribe(() => {
    if (hydrating) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void saveGame(); }, 2000);
  });
}
