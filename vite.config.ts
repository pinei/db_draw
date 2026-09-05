import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

// ─── Auth (multi-user) ──────────────────────────────────────────────────────

interface UserRecord {
  email: string
  token: string
  createdAt: string
  lastLoginAt?: string
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

function authPlugin(): Plugin {
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
          const record: UserRecord = { email: parsed.email, token, createdAt: new Date().toISOString() }
          writeFileSync(join(dir, 'user.json'), JSON.stringify(record, null, 2), 'utf-8')
          // Dev phase: no email delivery — token goes to the server stdout
          console.log(`[auth] token for ${parsed.email}: ${token}`)
          sendJson(res, 200, { message: 'Token gerado — verifique o console do servidor (npm run dev)' })
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
        try {
          const file = join(dir, 'user.json')
          const record = JSON.parse(readFileSync(file, 'utf-8')) as UserRecord
          record.lastLoginAt = new Date().toISOString()
          writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8')
        } catch {
          // best effort — login already succeeded
        }
        sendJson(res, 200, { email: parsed.email })
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
        if (!name || !/^[a-z0-9_-]+$/i.test(name)) { next(); return }

        const dir      = join(home, 'models', name)
        const jsonPath = join(dir, `${name}.json`)

        if (req.method === 'GET') {
          if (!existsSync(jsonPath)) { res.statusCode = 404; res.end(); return }
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

export default defineConfig({
  plugins: [vue(), authPlugin(), persistencePlugin()],
})
