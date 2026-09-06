import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { logoFilePath, resolveSiteUrl, sendTokenEmail, type TokenMailEnv } from './server/tokenEmail'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

// ─── Auth (multi-user) ──────────────────────────────────────────────────────

interface UserRecord {
  email: string
  token: string
  createdAt: string
  lastLoginAt?: string
  lastLoginIp?: string
  lastLoginUserAgent?: string
  loginCount?: number
  lastModelId?: string
}

/** Best-effort: remember the last accessed model on the user record. */
function touchLastModel(userDir: string, modelId: string): void {
  try {
    const file = join(userDir, 'user.json')
    const record = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord
    if (record.lastModelId === modelId) return
    record.lastModelId = modelId
    writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8')
  } catch {
    // best effort — model access already succeeded
  }
}

/** Normalize + validate an email; returns path-safe segments or null. */
function parseEmail(input: unknown): { domain: string; username: string; email: string } | null {
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

function userDir(domain: string, username: string): string {
  return join(DATA_DIR, 'user', domain, username)
}

/** Defense-in-depth: resolved user paths must stay inside DATA_DIR. */
function isInsideDataDir(p: string): boolean {
  const rel = relative(DATA_DIR, p)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function requestCredentials(req: IncomingMessage): { email: string; token: string } | null {
  const email = req.headers['x-user-email']
  const token = req.headers['x-auth-token']
  if (typeof email !== 'string' || typeof token !== 'string' || !email || !token) return null
  return { email, token }
}

/** Validates credentials against the stored user record. Returns the user dir or null. */
function authenticate(email: string, token: string): string | null {
  const parsed = parseEmail(email)
  if (!parsed) return null
  const dir = userDir(parsed.domain, parsed.username)
  if (!isInsideDataDir(dir)) return null
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

function authPlugin(env: TokenMailEnv): Plugin {
  return {
    name: 'auth',
    configureServer(server) {
      server.middlewares.use('/api/auth', async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (req.method !== 'POST' || (path !== '/token' && path !== '/login')) { next(); return }

        let body: any
        try {
          body = await readJsonBody(req)
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' })
          return
        }

        if (path === '/token') {
          const parsed = parseEmail(body.email)
          if (!parsed) { sendJson(res, 400, { error: 'invalid email' }); return }
          const dir = userDir(parsed.domain, parsed.username)
          if (!isInsideDataDir(dir)) { sendJson(res, 400, { error: 'invalid email' }); return }
          const token = randomBytes(32).toString('hex')
          mkdirSync(join(dir, 'models'), { recursive: true })
          const file = join(dir, 'user.json')
          let existing: Partial<UserRecord> = {}
          if (existsSync(file)) {
            try { existing = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord } catch { /* replace */ }
          }
          const record: UserRecord = {
            ...existing,
            email: parsed.email,
            token,
            createdAt: existing.createdAt ?? new Date().toISOString(),
          }
          writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8')
          const host = typeof req.headers.host === 'string' ? req.headers.host : undefined
          const mailed = await sendTokenEmail({
            env,
            to: parsed.email,
            token,
            siteUrl: resolveSiteUrl(env, host),
            logoPath: logoFilePath(__dirname),
          })
          if (!mailed.ok) {
            console.error(`[auth] token email failed for ${parsed.email}: ${mailed.message}`)
            sendJson(res, 502, { error: mailed.message })
            return
          }
          console.log(`[auth] token email sent to ${parsed.email}`)
          sendJson(res, 200, { message: 'Token sent — check your email to sign in' })
          return
        }

        // path === '/login'
        const parsed = parseEmail(body.email)
        if (!parsed || typeof body.token !== 'string' || !body.token) {
          sendJson(res, 401, { error: 'invalid credentials' })
          return
        }
        const dir = authenticate(parsed.email, body.token)
        if (!dir) { sendJson(res, 401, { error: 'invalid credentials' }); return }
        let lastModelId = 'default'
        try {
          const file = join(dir, 'user.json')
          const record = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord
          record.lastLoginAt = new Date().toISOString()
          record.lastLoginIp = req.socket.remoteAddress ?? undefined
          record.lastLoginUserAgent = req.headers['user-agent'] ?? undefined
          record.loginCount = (record.loginCount ?? 0) + 1
          if (typeof record.lastModelId === 'string' && record.lastModelId) {
            lastModelId = record.lastModelId
          }
          writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8')
        } catch {
          // best effort — login already succeeded
        }
        sendJson(res, 200, { email: parsed.email, lastModelId })
      })
    },
  }
}

// ─── Model persistence (per-user) ───────────────────────────────────────────

function persistencePlugin(): Plugin {
  return {
    name: 'persistence',
    configureServer(server) {
      server.middlewares.use('/api/models', (req, res, next) => {
        const creds = requestCredentials(req)
        const home = creds ? authenticate(creds.email, creds.token) : null
        if (!home) { res.statusCode = 401; res.end(); return }

        const name = req.url?.replace(/^\//, '').split('?')[0]
        // GET /api/models (no name) → list the user's models (id + meta)
        if (!name) {
          if (req.method !== 'GET') { next(); return }
          const modelsDir = join(home, 'models')
          const models: Array<{ id: string; meta: unknown }> = []
          if (existsSync(modelsDir)) {
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
          }
          models.sort((a, b) => a.id.localeCompare(b.id))
          sendJson(res, 200, { models })
          return
        }
        if (!/^[a-z0-9_-]+$/i.test(name)) { next(); return }

        const dir      = join(home, 'models', name)
        const jsonPath = join(dir, `${name}.json`)

        if (req.method === 'GET') {
          if (!existsSync(jsonPath)) { res.statusCode = 404; res.end(); return }
          touchLastModel(home, name)
          res.setHeader('Content-Type', 'application/json')
          res.end(readFileSync(jsonPath, 'utf-8'))

        } else if (req.method === 'PUT') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { _dbml, _mermaid, ...state } = JSON.parse(body)
              // UI preferences are not diagram properties — never persist them,
              // even if a client sends them
              if (state.layout) {
                delete state.layout.codeFormat
                delete state.layout.codePanelOpen
                delete state.layout.theme
              }
              mkdirSync(dir, { recursive: true })
              writeFileSync(jsonPath, JSON.stringify(state, null, 2), 'utf-8')
              writeFileSync(join(dir, `${name}.dbml`),    _dbml    ?? '', 'utf-8')
              writeFileSync(join(dir, `${name}.mermaid`), _mermaid ?? '', 'utf-8')
              touchLastModel(home, name)
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 400
              res.end()
            }
          })
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
    plugins: [vue(), authPlugin(env), persistencePlugin()],
  }
})
