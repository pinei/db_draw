import type { DiagramState, PersistedDiagramState, ModelMeta, ModelSummary } from '../model/types'
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

export async function saveModel(name: string, state: DiagramState): Promise<void> {
  // Strip UI preferences (codeFormat, codePanelOpen, theme) — the artifact
  // holds diagram properties only, not application layout
  const { codeFormat, codePanelOpen, theme, ...persistedLayout } = state.layout
  // Attach derived exports as side-channel fields so the server can write them
  const payload = {
    ...state,
    layout: persistedLayout,
    _dbml:    generateDbml(state.schema),
    _mermaid: generateMermaid(state.schema),
  }
  const res = await fetch(`${BASE}/${name}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 204) throw new Error(`Failed to save model "${name}": ${res.status}`)
}
