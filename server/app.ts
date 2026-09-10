import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import express, { type NextFunction, type Request, type Response, type Router } from 'express'
import {
  authenticate,
  cloneModelFolder,
  deleteModelFolder,
  hashSecret,
  isAdminEmail,
  isInsideDataDir,
  listModels,
  listModelsDetailed,
  listUsers,
  loadModelDbml,
  loadModelJson,
  parseEmail,
  readUserRecord,
  redactUserRecord,
  saveModelFiles,
  mergeModelPatch,
  isModelSavePatch,
  touchLastModel,
  userDir,
  writeUserRecord,
  sanitizeCodePanelSize,
  type UserRecord,
} from './store'
import { logoFilePath, resolveSiteUrl, sendTokenEmail, type TokenMailEnv } from './tokenEmail'
import {
  TICKET_TTL_SEC,
  clearSessionCookie,
  consumeMagicTicket,
  cookieSecure,
  createSession,
  issueMagicTicket,
  readSid,
  resolveSession,
  revokeSession,
  setSessionCookie,
} from './session'

export interface AppOptions {
  env: TokenMailEnv
  rootDir: string
  dataDir?: string
  serveStatic?: boolean
  distDir?: string
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

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store')
}

function allowedOrigins(env: TokenMailEnv, req: Request): Set<string> {
  const out = new Set<string>()
  const add = (raw: string | undefined) => {
    if (!raw) return
    try {
      const u = new URL(raw)
      out.add(`${u.protocol}//${u.host}`)
    } catch { /* ignore */ }
  }
  add(env.SITE_URL)
  add(resolveSiteUrl(env, req.get('host') ?? undefined))
  const host = req.get('host')
  if (host) {
    add(`http://${host}`)
    add(`https://${host}`)
  }
  return out
}

function csrfOk(env: TokenMailEnv, req: Request): boolean {
  const fetchSite = (req.get('sec-fetch-site') ?? '').toLowerCase()
  if (fetchSite === 'cross-site') return false
  const origin = req.get('origin')
  if (!origin) return true
  try {
    const u = new URL(origin)
    return allowedOrigins(env, req).has(`${u.protocol}//${u.host}`)
  } catch {
    return false
  }
}

function stampLogin(home: string, req: Request): { lastModelId: string; codePanelSize: ReturnType<typeof sanitizeCodePanelSize> } {
  let lastModelId = 'default'
  let codePanelSize: ReturnType<typeof sanitizeCodePanelSize> = null
  try {
    const record = readUserRecord(home)
    if (record) {
      record.lastLoginAt = new Date().toISOString()
      record.lastLoginIp = req.ip
      record.lastLoginUserAgent = req.get('user-agent') ?? undefined
      record.loginCount = (record.loginCount ?? 0) + 1
      if (typeof record.lastModelId === 'string' && record.lastModelId) {
        lastModelId = record.lastModelId
      }
      codePanelSize = sanitizeCodePanelSize(record.codePanelSize)
      writeUserRecord(home, record)
    }
  } catch {
    // best effort — login already succeeded
  }
  return { lastModelId, codePanelSize }
}

function issueSid(dataDir: string, env: TokenMailEnv, req: Request, res: Response, email: string): void {
  const sid = createSession(dataDir, email)
  setSessionCookie(res, sid, cookieSecure(req, env.COOKIE_SECURE))
}

/** Routes mounted at `/api` (token, login, models). Shared by Vite and production. */
export function createApiRouter(opts: AppOptions): Router {
  const dataDir = opts.dataDir ?? join(opts.rootDir, 'data')
  const distDir = opts.distDir ?? join(opts.rootDir, 'dist')
  const router = express.Router()
  router.use(express.json({ limit: '8mb' }))
  router.use((_req, res, next) => {
    noStore(res)
    next()
  })

  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next()
      return
    }
    if (csrfOk(opts.env, req)) {
      next()
      return
    }
    res.status(403).json({ error: 'forbidden origin' })
  })

  const requireSession = (req: Request, res: Response, next: NextFunction) => {
    const sid = readSid(req)
    const session = sid ? resolveSession(dataDir, sid) : null
    if (!session) {
      if (sid) clearSessionCookie(res, cookieSecure(req, opts.env.COOKIE_SECURE))
      res.status(401).end()
      return
    }
    res.locals.userHome = session.userHome
    res.locals.email = session.email
    next()
  }

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    requireSession(req, res, () => {
      if (!isAdminEmail(res.locals.email as string, opts.env.ADMIN_EMAILS)) {
        res.status(404).end()
        return
      }
      next()
    })
  }

  router.post('/auth/token', async (req, res) => {
    const parsed = parseEmail(req.body?.email)
    if (!parsed) { res.status(400).json({ error: 'invalid email' }); return }
    const dir = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, dir)) { res.status(400).json({ error: 'invalid email' }); return }
    const token = randomBytes(32).toString('hex')
    const existing = readUserRecord(dir)
    const ticket = issueMagicTicket(dataDir, parsed.email, existing?.magicTicketHash)
    const record: UserRecord = {
      ...existing,
      email: parsed.email,
      tokenHash: hashSecret(token),
      magicTicketHash: hashSecret(ticket),
      magicTicketExpiresAt: new Date(Date.now() + TICKET_TTL_SEC * 1000).toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    delete record.token
    writeUserRecord(dir, record)
    const mailed = await sendTokenEmail({
      env: opts.env,
      to: parsed.email,
      token,
      ticket,
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
    const { lastModelId, codePanelSize } = stampLogin(dir, req)
    issueSid(dataDir, opts.env, req, res, parsed.email)
    res.status(200).json({
      email: parsed.email,
      lastModelId,
      codePanelSize,
      admin: isAdminEmail(parsed.email, opts.env.ADMIN_EMAILS),
    })
  })

  router.get('/auth/magic', (req, res) => {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : ''
    const consumed = ticket ? consumeMagicTicket(dataDir, ticket) : null
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (!consumed) {
      res.redirect(302, '/')
      return
    }
    try {
      const record = readUserRecord(consumed.userHome)
      if (record) {
        delete record.magicTicketHash
        delete record.magicTicketExpiresAt
        writeUserRecord(consumed.userHome, record)
      }
    } catch { /* best effort */ }
    stampLogin(consumed.userHome, req)
    issueSid(dataDir, opts.env, req, res, consumed.email)
    res.redirect(302, '/')
  })

  router.get('/auth/me', requireSession, (_req, res) => {
    const home = res.locals.userHome as string
    const record = readUserRecord(home)
    const email = res.locals.email as string
    res.status(200).json({
      email,
      lastModelId: typeof record?.lastModelId === 'string' ? record.lastModelId : null,
      codePanelSize: sanitizeCodePanelSize(record?.codePanelSize),
      admin: isAdminEmail(email, opts.env.ADMIN_EMAILS),
    })
  })

  router.post('/auth/logout', (req, res) => {
    const sid = readSid(req)
    if (sid) revokeSession(dataDir, sid)
    clearSessionCookie(res, cookieSecure(req, opts.env.COOKIE_SECURE))
    res.status(204).end()
  })

  router.get('/auth/prefs', requireSession, (_req, res) => {
    const record = readUserRecord(res.locals.userHome as string)
    res.status(200).json({
      lastModelId: typeof record?.lastModelId === 'string' ? record.lastModelId : null,
      codePanelSize: sanitizeCodePanelSize(record?.codePanelSize),
    })
  })

  router.put('/auth/prefs', requireSession, (req, res) => {
    const home = res.locals.userHome as string
    const size = sanitizeCodePanelSize(req.body?.codePanelSize)
    if (!size) { res.status(400).json({ error: 'invalid codePanelSize' }); return }
    const record = readUserRecord(home)
    if (!record) { res.status(401).end(); return }
    record.codePanelSize = size
    writeUserRecord(home, record)
    res.status(204).end()
  })

  router.use('/models', requireSession)

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
      const home = res.locals.userHome as string

      if (isModelSavePatch(body)) {
        const result = mergeModelPatch(home, name, {
          meta: body.meta,
          schema: body.schema,
          presentation: (body.presentation && typeof body.presentation === 'object')
            ? body.presentation as {
              entityPositions?: unknown
              connectorPoints?: unknown
              labelPositions?: unknown
              routeOverrides?: unknown
              layout?: unknown
            }
            : undefined,
          exports: (body.exports && typeof body.exports === 'object')
            ? body.exports as { dbml?: unknown; mermaid?: unknown }
            : undefined,
        })
        if (!result.ok) {
          res.status(result.status).json({ error: result.error })
          return
        }
        touchLastModel(home, name)
        res.status(204).end()
        return
      }

      // Legacy full snapshot (still used by older clients / full replace)
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
      saveModelFiles(home, name, body, dbml, mermaid)
      touchLastModel(home, name)
      res.status(204).end()
    } catch {
      res.status(400).end()
    }
  })

  router.get('/admin/users', requireAdmin, (_req, res) => {
    res.status(200).json({ users: listUsers(dataDir) })
  })

  router.get('/admin/user', requireAdmin, (req, res) => {
    const parsed = parseEmail(typeof req.query.email === 'string' ? req.query.email : '')
    if (!parsed) { res.status(400).json({ error: 'invalid email' }); return }
    const home = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, home)) { res.status(400).json({ error: 'invalid email' }); return }
    const record = readUserRecord(home)
    if (!record || record.email !== parsed.email) { res.status(404).end(); return }
    res.status(200).json({
      user: redactUserRecord(record),
      models: listModelsDetailed(home),
    })
  })

  router.get('/admin/dbml', requireAdmin, (req, res) => {
    const parsed = parseEmail(typeof req.query.email === 'string' ? req.query.email : '')
    const modelId = typeof req.query.model === 'string' ? req.query.model.trim() : ''
    if (!parsed || !/^[a-z0-9_-]+$/i.test(modelId)) {
      res.status(400).json({ error: 'invalid email or model' })
      return
    }
    const home = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, home)) { res.status(400).json({ error: 'invalid email' }); return }
    const record = readUserRecord(home)
    if (!record || record.email !== parsed.email) { res.status(404).end(); return }
    const dbml = loadModelDbml(home, modelId)
    if (dbml == null) { res.status(404).end(); return }
    res.status(200).json({ dbml })
  })

  router.post('/admin/clone', requireAdmin, (req, res) => {
    const from = parseEmail(req.body?.email)
    const srcId = typeof req.body?.model === 'string' ? req.body.model.trim() : ''
    const destId = typeof req.body?.id === 'string' ? req.body.id.trim().toLowerCase() : ''
    if (!from || !srcId || !destId) {
      res.status(400).json({ error: 'invalid email, model or id' })
      return
    }
    const srcHome = userDir(dataDir, from.domain, from.username)
    const destHome = res.locals.userHome as string
    if (!isInsideDataDir(dataDir, srcHome) || !isInsideDataDir(dataDir, destHome)) {
      res.status(400).json({ error: 'invalid email' })
      return
    }
    const srcRecord = readUserRecord(srcHome)
    if (!srcRecord || srcRecord.email !== from.email) { res.status(404).end(); return }
    const result = cloneModelFolder(dataDir, srcHome, srcId, destHome, destId, {
      name: req.body?.name,
      description: req.body?.description,
      tags: req.body?.tags,
    })
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    res.status(201).json({ id: destId })
  })

  router.post('/admin/delete', requireAdmin, (req, res) => {
    const parsed = parseEmail(req.body?.email)
    const modelId = typeof req.body?.model === 'string' ? req.body.model.trim() : ''
    if (!parsed || !modelId) {
      res.status(400).json({ error: 'invalid email or model' })
      return
    }
    const home = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, home)) {
      res.status(400).json({ error: 'invalid email' })
      return
    }
    const record = readUserRecord(home)
    if (!record || record.email !== parsed.email) { res.status(404).end(); return }
    const result = deleteModelFolder(dataDir, home, modelId)
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    res.status(204).end()
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
