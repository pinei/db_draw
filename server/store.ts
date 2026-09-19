import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync, renameSync, rmSync } from 'node:fs'
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

export interface AdminModelEntry {
  id: string
  meta: { id: string; name: string; description: string; tags: string[] } | null
  tables: number
  relationships: number
}

export interface AdminUserSummary {
  email: string
  createdAt: string | null
  lastLoginAt: string | null
  loginCount: number
  models: number
}

export function redactUserRecord(record: UserRecord): Record<string, unknown> {
  const { token, tokenHash, magicTicketHash, ...rest } = record
  return {
    ...rest,
    hasToken: typeof token === 'string' && token.length > 0,
    hasTokenHash: typeof tokenHash === 'string' && tokenHash.length > 0,
    hasMagicTicket: typeof magicTicketHash === 'string' && magicTicketHash.length > 0,
  }
}

export function listUsers(dataDir: string): AdminUserSummary[] {
  const root = join(dataDir, 'user')
  const out: AdminUserSummary[] = []
  if (!existsSync(root)) return out
  for (const domainEnt of readdirSync(root, { withFileTypes: true })) {
    if (!domainEnt.isDirectory()) continue
    const domainDir = join(root, domainEnt.name)
    for (const userEnt of readdirSync(domainDir, { withFileTypes: true })) {
      if (!userEnt.isDirectory()) continue
      const home = join(domainDir, userEnt.name)
      if (!isInsideDataDir(dataDir, home)) continue
      const record = readUserRecord(home)
      if (!record?.email) continue
      out.push({
        email: record.email,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
        lastLoginAt: typeof record.lastLoginAt === 'string' ? record.lastLoginAt : null,
        loginCount: typeof record.loginCount === 'number' ? record.loginCount : 0,
        models: listModels(home).length,
      })
    }
  }
  // Most recently logged in first (ISO datetimes sort lexicographically);
  // never-logged-in (null) last, email as deterministic tiebreak
  out.sort((a, b) => {
    if (a.lastLoginAt !== b.lastLoginAt) {
      if (a.lastLoginAt === null) return 1
      if (b.lastLoginAt === null) return -1
      return a.lastLoginAt < b.lastLoginAt ? 1 : -1
    }
    return a.email.localeCompare(b.email)
  })
  return out
}

function schemaCounts(data: unknown): { tables: number; relationships: number } {
  if (!data || typeof data !== 'object') return { tables: 0, relationships: 0 }
  const schema = (data as { schema?: unknown }).schema
  if (!schema || typeof schema !== 'object') return { tables: 0, relationships: 0 }
  const entities = (schema as { entities?: unknown }).entities
  const rels = (schema as { relationships?: unknown }).relationships
  return {
    tables: Array.isArray(entities) ? entities.length : 0,
    relationships: Array.isArray(rels) ? rels.length : 0,
  }
}

export function listModelsDetailed(userHome: string): AdminModelEntry[] {
  const modelsDir = join(userHome, 'models')
  const models: AdminModelEntry[] = []
  if (!existsSync(modelsDir)) return models
  for (const entry of readdirSync(modelsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9_-]+$/i.test(entry.name)) continue
    let meta: AdminModelEntry['meta'] = null
    let tables = 0
    let relationships = 0
    try {
      const data = JSON.parse(readFileSync(join(modelsDir, entry.name, `${entry.name}.json`), 'utf-8')) as unknown
      const counts = schemaCounts(data)
      tables = counts.tables
      relationships = counts.relationships
      if (data && typeof data === 'object' && 'meta' in data && typeof (data as { meta: unknown }).meta === 'object' && (data as { meta: unknown }).meta !== null) {
        const m = (data as { meta: Record<string, unknown> }).meta
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
    models.push({ id: entry.name, meta, tables, relationships })
  }
  models.sort((a, b) => a.id.localeCompare(b.id))
  return models
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

export function loadModelDbml(userHome: string, name: string): string | null {
  if (!/^[a-z0-9_-]+$/i.test(name)) return null
  const dbmlPath = join(userHome, 'models', name, `${name}.dbml`)
  if (!existsSync(dbmlPath)) return null
  return readFileSync(dbmlPath, 'utf-8')
}

export const MODEL_ID_RE = /^[a-z0-9_-]+$/i

function sanitizeCloneTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) {
    if (typeof t !== 'string') continue
    const n = t.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '')
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** Raw folder copy into destHome/models/destId, then rename id-prefixed files and patch meta. */
export function cloneModelFolder(
  dataDir: string,
  srcHome: string,
  srcId: string,
  destHome: string,
  destId: string,
  meta: { name?: string; description?: string; tags?: unknown },
): { ok: true } | { ok: false; status: number; error: string } {
  if (!MODEL_ID_RE.test(srcId) || !MODEL_ID_RE.test(destId)) {
    return { ok: false, status: 400, error: 'invalid model id' }
  }
  const srcDir = join(srcHome, 'models', srcId)
  const destDir = join(destHome, 'models', destId)
  if (!isInsideDataDir(dataDir, srcDir) || !isInsideDataDir(dataDir, destDir)) {
    return { ok: false, status: 400, error: 'invalid path' }
  }
  if (!existsSync(srcDir)) return { ok: false, status: 404, error: 'source model not found' }
  if (existsSync(destDir)) return { ok: false, status: 409, error: `Model "${destId}" already exists` }
  mkdirSync(join(destHome, 'models'), { recursive: true })
  try {
    cpSync(srcDir, destDir, { recursive: true })
    for (const name of readdirSync(destDir)) {
      if (name === srcId || name.startsWith(`${srcId}.`)) {
        const next = destId + name.slice(srcId.length)
        if (next !== name) renameSync(join(destDir, name), join(destDir, next))
      }
    }
    const jsonPath = join(destDir, `${destId}.json`)
    if (existsSync(jsonPath)) {
      const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>
      const prev = (data.meta && typeof data.meta === 'object') ? data.meta as Record<string, unknown> : {}
      data.meta = {
        ...prev,
        id: destId,
        name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : destId,
        description: typeof meta.description === 'string' ? meta.description.trim() : '',
        tags: sanitizeCloneTags(meta.tags),
      }
      writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
    }
    return { ok: true }
  } catch {
    try { rmSync(destDir, { recursive: true, force: true }) } catch { /* leftover */ }
    return { ok: false, status: 500, error: 'clone failed' }
  }
}

/** Remove models/<id>/ (folder + files). Clears lastModelId when it pointed at this model. */
export function deleteModelFolder(
  dataDir: string,
  userHome: string,
  modelId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!MODEL_ID_RE.test(modelId)) {
    return { ok: false, status: 400, error: 'invalid model id' }
  }
  const dir = join(userHome, 'models', modelId)
  if (!isInsideDataDir(dataDir, dir)) {
    return { ok: false, status: 400, error: 'invalid path' }
  }
  if (!existsSync(dir)) return { ok: false, status: 404, error: 'model not found' }
  try {
    rmSync(dir, { recursive: true, force: true })
    const record = readUserRecord(userHome)
    if (record && record.lastModelId === modelId) {
      delete record.lastModelId
      writeUserRecord(userHome, record)
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 500, error: 'delete failed' }
  }
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

function stripUiLayoutPrefs(layout: Record<string, unknown>): Record<string, unknown> {
  const next = { ...layout }
  delete next.codeFormat
  delete next.codePanelOpen
  delete next.theme
  return next
}

export interface ModelSavePatch {
  meta?: unknown
  schema?: unknown
  presentation?: {
    entityPositions?: unknown
    connectorPoints?: unknown
    labelPositions?: unknown
    routeOverrides?: unknown
    layout?: unknown
  }
  exports?: {
    dbml?: unknown
    mermaid?: unknown
  }
}

/**
 * Merge a partial model PUT into models/<name>/.
 * - JSON is merged field-wise (missing slices keep prior values).
 * - .dbml / .mermaid are rewritten only when exports.dbml / exports.mermaid are strings.
 * - Creating a new model requires at least schema (or a full prior file).
 */
export function mergeModelPatch(
  userHome: string,
  name: string,
  patch: ModelSavePatch,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!MODEL_ID_RE.test(name)) {
    return { ok: false, status: 400, error: 'invalid model id' }
  }
  const jsonPath = join(userHome, 'models', name, `${name}.json`)
  const dbmlPath = join(userHome, 'models', name, `${name}.dbml`)
  const mermaidPath = join(userHome, 'models', name, `${name}.mermaid`)

  let current: Record<string, unknown> = {}
  const existed = existsSync(jsonPath)
  if (existed) {
    try {
      current = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>
    } catch {
      return { ok: false, status: 400, error: 'corrupt model' }
    }
  } else if (patch.schema === undefined && patch.presentation === undefined) {
    return { ok: false, status: 404, error: 'model not found' }
  }

  const next: Record<string, unknown> = { ...current }
  if (patch.meta !== undefined) next.meta = patch.meta
  if (patch.schema !== undefined) next.schema = patch.schema

  if (patch.presentation) {
    const p = patch.presentation
    if (p.entityPositions !== undefined) next.entityPositions = p.entityPositions
    if (p.connectorPoints !== undefined) next.connectorPoints = p.connectorPoints
    if (p.labelPositions !== undefined) next.labelPositions = p.labelPositions
    if (p.routeOverrides !== undefined) next.routeOverrides = p.routeOverrides
    if (p.layout !== undefined && p.layout && typeof p.layout === 'object') {
      const prevLayout = (next.layout && typeof next.layout === 'object')
        ? next.layout as Record<string, unknown>
        : {}
      next.layout = {
        ...prevLayout,
        ...stripUiLayoutPrefs(p.layout as Record<string, unknown>),
      }
    }
  }

  if (!existed) {
    if (next.schema === undefined) {
      return { ok: false, status: 400, error: 'schema required to create model' }
    }
    if (next.entityPositions === undefined) next.entityPositions = {}
    if (next.connectorPoints === undefined) next.connectorPoints = {}
    if (next.labelPositions === undefined) next.labelPositions = {}
    if (next.routeOverrides === undefined) next.routeOverrides = {}
    if (next.layout === undefined) {
      next.layout = {
        connectorStyle: 'curved',
        notationStyle: 'crowsfoot',
        canvasOffset: { x: 0, y: 0 },
        canvasScale: 1,
      }
    }
  }

  try {
    const dir = join(userHome, 'models', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(jsonPath, JSON.stringify(next, null, 2), 'utf-8')

    const ex = patch.exports
    if (ex && typeof ex.dbml === 'string') {
      writeFileSync(dbmlPath, ex.dbml, 'utf-8')
    } else if (!existed && !existsSync(dbmlPath)) {
      writeFileSync(dbmlPath, '', 'utf-8')
    }
    if (ex && typeof ex.mermaid === 'string') {
      writeFileSync(mermaidPath, ex.mermaid, 'utf-8')
    } else if (!existed && !existsSync(mermaidPath)) {
      writeFileSync(mermaidPath, '', 'utf-8')
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 500, error: 'save failed' }
  }
}

/** True when the body uses the sliced PATCH envelope (not a legacy full snapshot). */
export function isModelSavePatch(body: Record<string, unknown>): boolean {
  return 'presentation' in body
    || 'exports' in body
    || ('schema' in body && !('entityPositions' in body))
}
