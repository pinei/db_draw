const AUTH_BASE = '/api/auth'

export class AuthError extends Error {
  constructor(message = 'Invalid session — please sign in again') {
    super(message)
    this.name = 'AuthError'
  }
}

export interface CodePanelSize {
  width: number
  height: number
}

export interface LoginResult {
  email: string
  lastModelId: string | null
  codePanelSize: CodePanelSize | null
}

export interface UserPrefs {
  lastModelId: string | null
  codePanelSize: CodePanelSize | null
}

function parseCodePanelSize(raw: unknown): CodePanelSize | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const width = typeof rec.width === 'number' ? rec.width : Number(rec.width)
  const height = typeof rec.height === 'number' ? rec.height : Number(rec.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return { width, height }
}

/** Asks the server to (re)generate a token and email it to the user. */
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
  return typeof data.message === 'string' ? data.message : 'Token sent — check your email'
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
  const data = await res.json().catch(() => ({})) as {
    email?: unknown
    lastModelId?: unknown
    codePanelSize?: unknown
  }
  if (typeof data.email !== 'string') throw new Error('Unexpected server response')
  return {
    email: data.email,
    lastModelId: typeof data.lastModelId === 'string' ? data.lastModelId : null,
    codePanelSize: parseCodePanelSize(data.codePanelSize),
  }
}

function authHeaders(email: string, token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Email': email,
    'X-Auth-Token': token,
  }
}

/** Load UI prefs from user.json (used on reload when login is skipped). */
export async function loadUserPrefs(email: string, token: string): Promise<UserPrefs> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/prefs`, { headers: authHeaders(email, token) })
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Failed to load prefs: ${res.status}`)
  const data = await res.json().catch(() => ({})) as {
    lastModelId?: unknown
    codePanelSize?: unknown
  }
  return {
    lastModelId: typeof data.lastModelId === 'string' ? data.lastModelId : null,
    codePanelSize: parseCodePanelSize(data.codePanelSize),
  }
}

/** Persist Diagram Code panel size into user.json. */
export async function saveCodePanelSize(
  email: string,
  token: string,
  size: CodePanelSize,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/prefs`, {
      method: 'PUT',
      headers: authHeaders(email, token),
      body: JSON.stringify({ codePanelSize: size }),
    })
  } catch {
    // best effort — local UI already updated
    return
  }
  if (res.status === 401) throw new AuthError()
}
