import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import express, { type Router } from 'express'
import {
  authenticate,
  isInsideDataDir,
  listModels,
  loadModelJson,
  parseEmail,
  readUserRecord,
  saveModelFiles,
  touchLastModel,
  userDir,
  writeUserRecord,
  type UserRecord,
} from './store'
import { logoFilePath, resolveSiteUrl, sendTokenEmail, type TokenMailEnv } from './tokenEmail'

export interface AppOptions {
  env: TokenMailEnv
  rootDir: string
  dataDir?: string
  serveStatic?: boolean
  distDir?: string
}

function credentials(req: express.Request): { email: string; token: string } | null {
  const email = req.header('x-user-email')
  const token = req.header('x-auth-token')
  if (!email || !token) return null
  return { email, token }
}

function resolveLogo(rootDir: string, distDir?: string): string {
  const fromPublic = logoFilePath(rootDir)
  if (existsSync(fromPublic)) return fromPublic
  if (distDir) {
    const fromDist = join(distDir, 'logo.png')
    if (existsSync(fromDist)) return fromDist
  }
  return fromPublic
}

/** Routes mounted at `/api` (token, login, models). Shared by Vite and production. */
export function createApiRouter(opts: AppOptions): Router {
  const dataDir = opts.dataDir ?? join(opts.rootDir, 'data')
  const distDir = opts.distDir ?? join(opts.rootDir, 'dist')
  const router = express.Router()
  router.use(express.json({ limit: '8mb' }))

  router.post('/auth/token', async (req, res) => {
    const parsed = parseEmail(req.body?.email)
    if (!parsed) { res.status(400).json({ error: 'invalid email' }); return }
    const dir = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, dir)) { res.status(400).json({ error: 'invalid email' }); return }
    const token = randomBytes(32).toString('hex')
    const existing = readUserRecord(dir)
    const record: UserRecord = {
      ...existing,
      email: parsed.email,
      token,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    writeUserRecord(dir, record)
    const mailed = await sendTokenEmail({
      env: opts.env,
      to: parsed.email,
      token,
      siteUrl: resolveSiteUrl(opts.env, req.get('host') ?? undefined),
      logoPath: resolveLogo(opts.rootDir, distDir),
    })
    if (!mailed.ok) {
      console.error(`[auth] token email failed for ${parsed.email}: ${mailed.message}`)
      res.status(502).json({ error: mailed.message })
      return
    }
    console.log(`[auth] token email sent to ${parsed.email}`)
    res.status(200).json({ message: 'Token sent — check your email to sign in' })
  })

  router.post('/auth/login', (req, res) => {
    const parsed = parseEmail(req.body?.email)
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    if (!parsed || !token) { res.status(401).json({ error: 'invalid credentials' }); return }
    const dir = authenticate(dataDir, parsed.email, token)
    if (!dir) { res.status(401).json({ error: 'invalid credentials' }); return }
    let lastModelId = 'default'
    try {
      const record = readUserRecord(dir)
      if (record) {
        record.lastLoginAt = new Date().toISOString()
        record.lastLoginIp = req.ip
        record.lastLoginUserAgent = req.get('user-agent') ?? undefined
        record.loginCount = (record.loginCount ?? 0) + 1
        if (typeof record.lastModelId === 'string' && record.lastModelId) {
          lastModelId = record.lastModelId
        }
        writeUserRecord(dir, record)
      }
    } catch {
      // best effort — login already succeeded
    }
    res.status(200).json({ email: parsed.email, lastModelId })
  })

  router.use('/models', (req, res, next) => {
    const creds = credentials(req)
    const home = creds ? authenticate(dataDir, creds.email, creds.token) : null
    if (!home) { res.status(401).end(); return }
    res.locals.userHome = home
    next()
  })

  router.get('/models', (_req, res) => {
    res.status(200).json({ models: listModels(res.locals.userHome as string) })
  })

  router.get('/models/:name', (req, res) => {
    const name = req.params.name
    if (!/^[a-z0-9_-]+$/i.test(name)) { res.status(404).end(); return }
    const home = res.locals.userHome as string
    const json = loadModelJson(home, name)
    if (!json) { res.status(404).end(); return }
    touchLastModel(home, name)
    res.type('json').send(json)
  })

  router.put('/models/:name', (req, res) => {
    const name = req.params.name
    if (!/^[a-z0-9_-]+$/i.test(name)) { res.status(400).end(); return }
    try {
      const body = { ...(req.body as Record<string, unknown>) }
      const dbml = typeof body._dbml === 'string' ? body._dbml : ''
      const mermaid = typeof body._mermaid === 'string' ? body._mermaid : ''
      delete body._dbml
      delete body._mermaid
      if (body.layout && typeof body.layout === 'object') {
        const layout = body.layout as Record<string, unknown>
        delete layout.codeFormat
        delete layout.codePanelOpen
        delete layout.theme
      }
      const home = res.locals.userHome as string
      saveModelFiles(home, name, body, dbml, mermaid)
      touchLastModel(home, name)
      res.status(204).end()
    } catch {
      res.status(400).end()
    }
  })

  return router
}

export function createApp(opts: AppOptions): express.Express {
  const distDir = opts.distDir ?? join(opts.rootDir, 'dist')
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use('/api', createApiRouter(opts))

  if (opts.serveStatic) {
    app.use(express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
      },
    }))
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(join(distDir, 'index.html'))
    })
  }

  return app
}
