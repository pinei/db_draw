const AUTH_BASE = '/api/auth'

export class AuthError extends Error {
  constructor(message = 'Invalid session — please sign in again') {
    super(message)
    this.name = 'AuthError'
  }
}

export interface LoginResult {
  email: string
  lastModelId: string | null
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
  const data = await res.json().catch(() => ({})) as { email?: unknown; lastModelId?: unknown }
  if (typeof data.email !== 'string') throw new Error('Unexpected server response')
  return {
    email: data.email,
    lastModelId: typeof data.lastModelId === 'string' ? data.lastModelId : null,
  }
}
