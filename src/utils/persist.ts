import type { DiagramState, ErScope, PersistedDiagramState, ModelMeta, ModelSummary } from '../model/types'
import { generateDbml, generateMermaid } from './codePlaceholder'
import { compileDbml } from './dbmlImport'
import { sanitizeTags } from './modelMeta'
import { AuthError } from './authApi'

export { AuthError }

const BASE = '/api/models'
const CREDS: RequestInit = { credentials: 'include' }

// Validation summary for the Apply button — single compile path shared with
// the import (compileDbml); the actual diagram patch happens in the store.
export function validateDbml(text: string): { success: boolean; message: string } {
  try {
    const compiled = compileDbml(text)
    if (!compiled.ok) return { success: false, message: compiled.message }
    const { tables, refs } = compiled.value
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
    return { success: true, message: `✓ Valid DBML — ${tables.length} ${plural(tables.length, 'table', 'tables')}, ${refs.length} ${plural(refs.length, 'relationship', 'relationships')}` }
  } catch (err: unknown) {
    return { success: false, message: `✗ Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function listModels(): Promise<ModelSummary[]> {
  let res: Response
  try {
    res = await fetch(BASE, CREDS)
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Failed to list models: ${res.status}`)
  const data = await res.json().catch(() => ({})) as { models?: unknown }
  if (!Array.isArray(data.models)) return []
  const out: ModelSummary[] = []
  for (const m of data.models) {
    if (typeof m !== 'object' || m === null) continue
    const { id, meta } = m as { id?: unknown; meta?: unknown }
    if (typeof id !== 'string' || !/^[a-z0-9_-]+$/i.test(id)) continue
    let clean: ModelMeta | null = null
    if (typeof meta === 'object' && meta !== null) {
      const mm = meta as Record<string, unknown>
      clean = {
        id,
        name: typeof mm.name === 'string' && mm.name ? mm.name : id,
        description: typeof mm.description === 'string' ? mm.description : '',
        tags: sanitizeTags(mm.tags),
      }
    }
    out.push({ id, meta: clean })
  }
  return out
}

function isValidScope(data: unknown): data is ErScope {
  if (typeof data !== 'object' || data === null) return false
  const s = data as Record<string, unknown>
  return typeof s.id === 'string' && /^[a-z0-9_-]+$/i.test(s.id)
    && typeof s.name === 'string'
    && Array.isArray(s.entityIds)
    && typeof s.positions === 'object' && s.positions !== null
}

/** Scopes live in their own files: er-models/<model>/<model>.scope.<id>.json */
export async function listScopes(modelId: string): Promise<ErScope[]> {
  let res: Response
  try {
    res = await fetch(`${BASE}/${modelId}/scopes`, CREDS)
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Failed to list scopes: ${res.status}`)
  const data = await res.json().catch(() => ({})) as { scopes?: unknown }
  if (!Array.isArray(data.scopes)) return []
  return data.scopes.filter(isValidScope)
}

export async function saveScope(modelId: string, scope: ErScope): Promise<void> {
  const res = await fetch(`${BASE}/${modelId}/scopes/${scope.id}`, {
    ...CREDS,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scope),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({})) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : `Failed to save scope "${scope.id}": ${res.status}`)
  }
}

export async function deleteScope(modelId: string, scopeId: string): Promise<void> {
  const res = await fetch(`${BASE}/${modelId}/scopes/${scopeId}`, { ...CREDS, method: 'DELETE' })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete scope "${scopeId}": ${res.status}`)
  }
}

export async function loadModel(name: string): Promise<PersistedDiagramState | null> {
  const res = await fetch(`${BASE}/${name}`, CREDS)
  if (res.status === 401) throw new AuthError()
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to load model "${name}": ${res.status}`)
  const data = await res.json()
  // Strip derived export fields that are not part of DiagramState
  delete data._dbml
  delete data._mermaid
  return data as PersistedDiagramState
}

/** Which slices to include in a partial model PUT. */
export interface ModelSaveSlices {
  meta?: boolean
  schema?: boolean
  presentation?: boolean
  exports?: boolean
}

export function anySaveSlice(slices: ModelSaveSlices): boolean {
  return !!(slices.meta || slices.schema || slices.presentation || slices.exports)
}

/** Build the sliced PUT envelope. Client remains authoritative for dbml/mermaid. */
export function buildModelSavePayload(state: DiagramState, slices: ModelSaveSlices): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (slices.meta) payload.meta = state.meta
  if (slices.schema) payload.schema = state.schema
  if (slices.presentation) {
    const { codeFormat: _cf, codePanelOpen: _cpo, sidePanelView: _spv, theme: _th, ...persistedLayout } = state.layout
    payload.presentation = {
      entityPositions: state.entityPositions,
      connectorPoints: state.connectorPoints,
      labelPositions: state.labelPositions,
      routeOverrides: state.routeOverrides,
      layout: persistedLayout,
    }
  }
  if (slices.exports) {
    // Generated on the client from the live schema (Apply / structural edits).
    // Presentation-only saves omit this so on-disk .dbml/.mermaid stay put.
    payload.exports = {
      dbml: generateDbml(state.schema),
      mermaid: generateMermaid(state.schema),
    }
  }
  return payload
}

export async function saveModelSlices(
  name: string,
  state: DiagramState,
  slices: ModelSaveSlices,
): Promise<void> {
  if (!anySaveSlice(slices)) return
  const payload = buildModelSavePayload(state, slices)
  const res = await fetch(`${BASE}/${name}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({})) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : `Failed to save model "${name}": ${res.status}`)
  }
}

/** Full snapshot save (create / seed) — all slices including exports. */
export async function saveModel(name: string, state: DiagramState): Promise<void> {
  await saveModelSlices(name, state, {
    meta: true,
    schema: true,
    presentation: true,
    exports: true,
  })
}
