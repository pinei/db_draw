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
  admin: boolean
}

export interface UserPrefs {
  lastModelId: string | null
  codePanelSize: CodePanelSize | null
}

const CREDS: RequestInit = { credentials: 'include' }

function parseCodePanelSize(raw: unknown): CodePanelSize | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const width = typeof rec.width === 'number' ? rec.width : Number(rec.width)
  const height = typeof rec.height === 'number' ? rec.height : Number(rec.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return { width, height }
}

function parseSessionBody(data: {
  email?: unknown
  lastModelId?: unknown
  codePanelSize?: unknown
  admin?: unknown
}): LoginResult {
  if (typeof data.email !== 'string') throw new Error('Unexpected server response')
  return {
    email: data.email,
    lastModelId: typeof data.lastModelId === 'string' ? data.lastModelId : null,
    codePanelSize: parseCodePanelSize(data.codePanelSize),
    admin: data.admin === true,
  }
}

/** Asks the server to (re)generate a token and email it to the user. */
export async function requestToken(email: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      credentials: 'include',
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
      credentials: 'include',
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
  return parseSessionBody(data)
}

/** Restore the HttpOnly cookie session (no credentials in JS). */
export async function fetchMe(): Promise<LoginResult> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/me`, CREDS)
  } catch {
    throw new Error('Server unavailable — run npm run dev')
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Failed to restore session: ${res.status}`)
  const data = await res.json().catch(() => ({})) as {
    email?: unknown
    lastModelId?: unknown
    codePanelSize?: unknown
  }
  return parseSessionBody(data)
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'include' })
  } catch {
    // local state is cleared regardless
  }
}

/** Load UI prefs from user.json (used on reload when login is skipped). */
export async function loadUserPrefs(): Promise<UserPrefs> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/prefs`, CREDS)
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
export async function saveCodePanelSize(size: CodePanelSize): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${AUTH_BASE}/prefs`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codePanelSize: size }),
    })
  } catch {
    // best effort — local UI already updated
    return
  }
  if (res.status === 401) throw new AuthError()
}
