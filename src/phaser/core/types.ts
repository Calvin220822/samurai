/**
 * 通用类型定义。
 */

export type Handler = (...args: unknown[]) => void;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Vec2 { x: number; y: number; }

export interface Circle { x: number; y: number; r: number; }

export interface GameBootOptions {
  /** React 挂载点 DOM id */
  parentId: string;
}
