import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'

export interface CodePanelSize {
  width: number
  height: number
}

export interface UserRecord {
  email: string
  /** Legacy plaintext login token — accepted until the next generate. */
  token?: string
  /** sha256 hex of the long-lived pasteable login token. */
  tokenHash?: string
  magicTicketHash?: string
  magicTicketExpiresAt?: string
  createdAt: string
  lastLoginAt?: string
  lastLoginIp?: string
  lastLoginUserAgent?: string
  loginCount?: number
  lastModelId?: string
  /** Last user-resized Diagram Code panel size (pixels). */
  codePanelSize?: CodePanelSize
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashedSecretsEqual(provided: string, storedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(storedHex)) return false
  const a = Buffer.from(hashSecret(provided), 'hex')
  const b = Buffer.from(storedHex, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Clamp and validate a code-panel size from client/user.json. */
export function sanitizeCodePanelSize(raw: unknown): CodePanelSize | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const w = typeof rec.width === 'number' ? rec.width : Number(rec.width)
  const h = typeof rec.height === 'number' ? rec.height : Number(rec.height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return {
    width: Math.round(Math.min(2000, Math.max(220, w))),
    height: Math.round(Math.min(2000, Math.max(80, h))),
  }
}

export function parseEmail(input: unknown): { domain: string; username: string; email: string } | null {
  if (typeof input !== 'string') return null
  const email = input.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null
  const username = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain.includes('.')) return null
  const segment = /^[a-z0-9][a-z0-9._~+-]*$/
  if (!segment.test(username) || !segment.test(domain)) return null
  return { domain, username, email }
}

/** True if `email` is in ADMIN_EMAILS (comma/space-separated). Allowlist stays on the server. */
export function isAdminEmail(email: string, allowlist: string | undefined): boolean {
  if (!allowlist) return false
  const parsed = parseEmail(email)
  if (!parsed) return false
  for (const part of allowlist.split(/[,;\s]+/)) {
    const allowed = parseEmail(part)
    if (allowed && allowed.email === parsed.email) return true
  }
  return false
}

export function userDir(dataDir: string, domain: string, username: string): string {
  return join(dataDir, 'user', domain, username)
}

export function isInsideDataDir(dataDir: string, p: string): boolean {
  const rel = relative(dataDir, p)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function authenticate(dataDir: string, email: string, token: string): string | null {
  const parsed = parseEmail(email)
  if (!parsed) return null
  const dir = userDir(dataDir, parsed.domain, parsed.username)
  if (!isInsideDataDir(dataDir, dir)) return null
  const file = join(dir, 'user.json')
  if (!existsSync(file)) return null
  try {
    const record = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord
    if (record.email !== parsed.email) return null
    if (typeof record.tokenHash === 'string' && record.tokenHash) {
      if (!hashedSecretsEqual(token, record.tokenHash)) return null
    } else if (typeof record.token === 'string' && record.token) {
      const a = Buffer.from(token)
      const b = Buffer.from(record.token)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    } else {
      return null
    }
    return dir
  } catch {
    return null
  }
}

export function touchLastModel(userHome: string, modelId: string): void {
  try {
    const file = join(userHome, 'user.json')
    const record = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord
    if (record.lastModelId === modelId) return
    record.lastModelId = modelId
    writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8')
  } catch {
    // best effort — model access already succeeded
  }
}

export function readUserRecord(userHome: string): UserRecord | null {
  try {
    return JSON.parse(readFileSync(join(userHome, 'user.json'), 'utf-8')) as UserRecord
  } catch {
    return null
  }
}

export function writeUserRecord(userHome: string, record: UserRecord): void {
  mkdirSync(join(userHome, 'models'), { recursive: true })
  writeFileSync(join(userHome, 'user.json'), JSON.stringify(record, null, 2), 'utf-8')
}

export function listModels(userHome: string): Array<{ id: string; meta: unknown }> {
  const modelsDir = join(userHome, 'models')
  const models: Array<{ id: string; meta: unknown }> = []
  if (!existsSync(modelsDir)) return models
  for (const entry of readdirSync(modelsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9_-]+$/i.test(entry.name)) continue
    let meta: unknown = null
    try {
      const data = JSON.parse(readFileSync(join(modelsDir, entry.name, `${entry.name}.json`), 'utf-8'))
      if (data && typeof data.meta === 'object' && data.meta !== null) {
        const m = data.meta as Record<string, unknown>
        meta = {
          id: entry.name,
          name: typeof m.name === 'string' ? m.name : entry.name,
          description: typeof m.description === 'string' ? m.description : '',
          tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === 'string') : [],
        }
      }
    } catch {
      // missing/corrupt artifact → listed with null meta
    }
    models.push({ id: entry.name, meta })
  }
  models.sort((a, b) => a.id.localeCompare(b.id))
  return models
}

export function loadModelJson(userHome: string, name: string): string | null {
  const jsonPath = join(userHome, 'models', name, `${name}.json`)
  if (!existsSync(jsonPath)) return null
  return readFileSync(jsonPath, 'utf-8')
}

export function saveModelFiles(
  userHome: string,
  name: string,
  state: Record<string, unknown>,
  dbml: string,
  mermaid: string,
): void {
  const dir = join(userHome, 'models', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(state, null, 2), 'utf-8')
  writeFileSync(join(dir, `${name}.dbml`), dbml, 'utf-8')
  writeFileSync(join(dir, `${name}.mermaid`), mermaid, 'utf-8')
}
