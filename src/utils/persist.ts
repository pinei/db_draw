import type { DiagramState, PersistedDiagramState, ModelMeta, ModelSummary } from '../model/types'
import { generateDbml, generateMermaid } from './codePlaceholder'
import { compileDbml } from './dbmlImport'
import { sanitizeTags } from './modelMeta'
import { useAuthStore } from '../stores/auth'

const BASE = '/api/models'
const AUTH_BASE = '/api/auth'

export class AuthError extends Error {
  constructor(message = 'Invalid session — please sign in again') {
    super(message)
    this.name = 'AuthError'
  }
}

function authHeaders(): Record<string, string> {
  const auth = useAuthStore()
  return { 'X-User-Email': auth.email ?? '', 'X-Auth-Token': auth.token ?? '' }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export async function requestToken(email: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Failed to generate token: ${res.status}`)
  return typeof data.message === 'string' ? data.message : 'Token generated'
}

export interface LoginResult {
  email: string
  lastModelId: string | null
}

export async function loginRequest(email: string, token: string): Promise<LoginResult> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    })
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new Error('Invalid email or token')
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const data = await res.json().catch(() => ({})) as { email?: unknown; lastModelId?: unknown }
  if (typeof data.email !== 'string') throw new Error('Unexpected server response')
  return {
    email: data.email,
    lastModelId: typeof data.lastModelId === 'string' ? data.lastModelId : null,
  }
}

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
    res = await fetch(BASE, { headers: authHeaders() })
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
  const res = await fetch(`${BASE}/${name}`, { headers: authHeaders() })
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 204) throw new Error(`Failed to save model "${name}": ${res.status}`)
}
