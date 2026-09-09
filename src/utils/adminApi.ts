import { AuthError } from './authApi'

const BASE = '/api/admin'
const CREDS: RequestInit = { credentials: 'include' }

export interface AdminUserSummary {
  email: string
  createdAt: string | null
  lastLoginAt: string | null
  loginCount: number
  models: number
}

export interface AdminModelEntry {
  id: string
  meta: { id: string; name: string; description: string; tags: string[] } | null
  tables: number
  relationships: number
}

export interface AdminUserDetail {
  user: Record<string, unknown>
  models: AdminModelEntry[]
}

async function adminGet(path: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, CREDS)
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (res.status === 404) throw new Error('Not found')
  if (!res.ok) throw new Error(`Admin request failed: ${res.status}`)
  return res
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const res = await adminGet('/users')
  const data = await res.json().catch(() => ({})) as { users?: unknown }
  if (!Array.isArray(data.users)) return []
  const out: AdminUserSummary[] = []
  for (const raw of data.users) {
    if (!raw || typeof raw !== 'object') continue
    const u = raw as Record<string, unknown>
    if (typeof u.email !== 'string') continue
    out.push({
      email: u.email,
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : null,
      lastLoginAt: typeof u.lastLoginAt === 'string' ? u.lastLoginAt : null,
      loginCount: typeof u.loginCount === 'number' ? u.loginCount : 0,
      models: typeof u.models === 'number' ? u.models : 0,
    })
  }
  return out
}

export async function loadAdminUser(email: string): Promise<AdminUserDetail> {
  const res = await adminGet(`/user?email=${encodeURIComponent(email)}`)
  const data = await res.json().catch(() => ({})) as { user?: unknown; models?: unknown }
  if (!data.user || typeof data.user !== 'object') throw new Error('Unexpected server response')
  const models: AdminModelEntry[] = []
  if (Array.isArray(data.models)) {
    for (const raw of data.models) {
      if (!raw || typeof raw !== 'object') continue
      const m = raw as Record<string, unknown>
      if (typeof m.id !== 'string') continue
      let meta: AdminModelEntry['meta'] = null
      if (m.meta && typeof m.meta === 'object') {
        const mm = m.meta as Record<string, unknown>
        meta = {
          id: typeof mm.id === 'string' ? mm.id : m.id,
          name: typeof mm.name === 'string' && mm.name ? mm.name : m.id,
          description: typeof mm.description === 'string' ? mm.description : '',
          tags: Array.isArray(mm.tags) ? mm.tags.filter((t): t is string => typeof t === 'string') : [],
        }
      }
      models.push({
        id: m.id,
        meta,
        tables: typeof m.tables === 'number' ? m.tables : 0,
        relationships: typeof m.relationships === 'number' ? m.relationships : 0,
      })
    }
  }
  return { user: data.user as Record<string, unknown>, models }
}

export async function listOwnModelIds(): Promise<string[]> {
  let res: Response
  try {
    res = await fetch('/api/models', CREDS)
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Failed to list models: ${res.status}`)
  const data = await res.json().catch(() => ({})) as { models?: unknown }
  const ids: string[] = []
  if (Array.isArray(data.models)) {
    for (const raw of data.models) {
      if (raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string') {
        ids.push((raw as { id: string }).id)
      }
    }
  }
  return ids
}

export async function cloneAdminModel(input: {
  email: string
  model: string
  id: string
  name: string
  description: string
  tags: string[]
}): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${BASE}/clone`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  const data = await res.json().catch(() => ({})) as { id?: unknown; error?: unknown }
  if (res.status === 409) throw new Error(typeof data.error === 'string' ? data.error : 'Model id already exists')
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Clone failed: ${res.status}`)
  if (typeof data.id !== 'string') throw new Error('Unexpected server response')
  return data.id
}

export async function deleteAdminModel(email: string, modelId: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE}/delete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, model: modelId }),
    })
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (res.status === 204) return
  const data = await res.json().catch(() => ({})) as { error?: unknown }
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Delete failed: ${res.status}`)
}

export async function loadAdminModelDbml(email: string, modelId: string): Promise<string> {
  const q = `email=${encodeURIComponent(email)}&model=${encodeURIComponent(modelId)}`
  const res = await adminGet(`/dbml?${q}`)
  const data = await res.json().catch(() => ({})) as { dbml?: unknown }
  if (typeof data.dbml !== 'string') throw new Error('Unexpected server response')
  return data.dbml
}
