import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { timingSafeEqual } from 'node:crypto'

export interface UserRecord {
  email: string
  token: string
  createdAt: string
  lastLoginAt?: string
  lastLoginIp?: string
  lastLoginUserAgent?: string
  loginCount?: number
  lastModelId?: string
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
    const a = Buffer.from(token)
    const b = Buffer.from(record.token)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
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
