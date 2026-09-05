import type { DiagramState, PersistedDiagramState } from '../model/types'
import { generateDbml, generateMermaid } from './codePlaceholder'
import { compileDbml } from './dbmlImport'
import { useAuthStore } from '../stores/auth'

const BASE = '/api/models'
const AUTH_BASE = '/api/auth'

export class AuthError extends Error {
  constructor(message = 'Sessão inválida — entre novamente') {
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
    throw new Error('Servidor indisponível — rode npm run dev')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Falha ao gerar token: ${res.status}`)
  return typeof data.message === 'string' ? data.message : 'Token gerado'
}

export async function loginRequest(email: string, token: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    })
  } catch {
    throw new Error('Servidor indisponível — rode npm run dev')
  }
  if (res.status === 401) throw new Error('E-mail ou token inválido')
  if (!res.ok) throw new Error(`Falha no login: ${res.status}`)
  const data = await res.json().catch(() => ({}))
  if (typeof data.email !== 'string') throw new Error('Resposta inesperada do servidor')
  return data.email
}

// Validation summary for the Apply button — single compile path shared with
// the import (compileDbml); the actual diagram patch happens in the store.
export function validateDbml(text: string): { success: boolean; message: string } {
  try {
    const compiled = compileDbml(text)
    if (!compiled.ok) return { success: false, message: compiled.message }
    const { tables, refs } = compiled.value
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
    return { success: true, message: `✓ DBML válido — ${tables.length} ${plural(tables.length, 'tabela', 'tabelas')}, ${refs.length} ${plural(refs.length, 'relação', 'relações')}` }
  } catch (err: unknown) {
    return { success: false, message: `✗ Erro: ${err instanceof Error ? err.message : String(err)}` }
  }
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
