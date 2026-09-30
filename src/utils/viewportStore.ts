// ─── Viewport (zoom/pan) persistence ─────────────────────────────────────────
// Per browser, per user + model + scope. Never part of the diagram artifact,
// so panning/zooming (including on read-only models) never triggers a save.

export interface Viewport {
  offset: { x: number; y: number }
  scale: number
}

const PREFIX = 'dbdraw.viewport.v1'
const MODEL_SLOT = '_model'

export const MIN_CANVAS_SCALE = 0.2
export const MAX_CANVAS_SCALE = 3

export function clampCanvasScale(scale: number): number {
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, scale))
}

export function viewportKey(email: string, modelId: string, scopeId: string | null): string {
  return `${PREFIX}:${email}:${modelId}:${scopeId ?? MODEL_SLOT}`
}

/** Validates a raw viewport shape (localStorage entry or legacy artifact layout). */
export function sanitizeViewport(raw: unknown): Viewport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const offset = r.offset as Record<string, unknown> | undefined
  const x = offset?.x
  const y = offset?.y
  const scale = r.scale
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return null
  return { offset: { x, y }, scale: clampCanvasScale(scale) }
}

export function readViewport(key: string): Viewport | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? sanitizeViewport(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeViewport(key: string, vp: Viewport): void {
  try {
    localStorage.setItem(key, JSON.stringify(vp))
  } catch { /* quota exceeded / non-browser */ }
}
