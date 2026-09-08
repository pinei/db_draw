import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Request, Response } from 'express'
import { hashedSecretsEqual, isInsideDataDir, parseEmail, readUserRecord, userDir } from './store'

export const COOKIE_NAME = 'dbdraw_sid'
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60
export const TICKET_TTL_SEC = 30 * 60

export interface SessionRecord {
  email: string
  createdAt: string
  expiresAt: string
}

export interface TicketRecord {
  email: string
  createdAt: string
  expiresAt: string
}

export interface ResolvedSession {
  email: string
  userHome: string
  sidHash: string
}

function hashHex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function pointerPath(dataDir: string, kind: 'sessions' | 'tickets', hash: string): string {
  return join(dataDir, kind, hash.slice(0, 2), `${hash}.json`)
}

function writePointer(file: string, body: object): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
}

function deletePointer(file: string): void {
  try { unlinkSync(file) } catch { /* already gone */ }
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) out[key] = value
  }
  return out
}

export function readSid(req: Request): string | null {
  const sid = parseCookieHeader(req.headers.cookie)[COOKIE_NAME]
  if (!sid || !/^[0-9a-f]{64}$/i.test(sid)) return null
  return sid
}

export function cookieSecure(req: Request, flag?: string): boolean {
  const v = flag?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return req.secure
}

function cookieHeader(sid: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${sid}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function setSessionCookie(res: Response, sid: string, secure: boolean): void {
  res.append('Set-Cookie', cookieHeader(sid, SESSION_TTL_SEC, secure))
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.append('Set-Cookie', `${cookieHeader('', 0, secure)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
}

export function createSession(dataDir: string, email: string): string {
  const sid = randomBytes(32).toString('hex')
  const sidHash = hashHex(sid)
  const now = Date.now()
  const record: SessionRecord = {
    email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SEC * 1000).toISOString(),
  }
  writePointer(pointerPath(dataDir, 'sessions', sidHash), record)
  return sid
}

export function resolveSession(dataDir: string, sid: string): ResolvedSession | null {
  const sidHash = hashHex(sid)
  const file = pointerPath(dataDir, 'sessions', sidHash)
  if (!existsSync(file)) return null
  try {
    const record = JSON.parse(readFileSync(file, 'utf-8')) as SessionRecord
    if (typeof record.email !== 'string' || typeof record.expiresAt !== 'string') {
      deletePointer(file)
      return null
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      deletePointer(file)
      return null
    }
    const parsed = parseEmail(record.email)
    if (!parsed) {
      deletePointer(file)
      return null
    }
    const userHome = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, userHome)) return null
    const user = readUserRecord(userHome)
    if (!user || user.email !== parsed.email) {
      deletePointer(file)
      return null
    }
    return { email: parsed.email, userHome, sidHash }
  } catch {
    return null
  }
}

export function revokeSession(dataDir: string, sid: string): void {
  deletePointer(pointerPath(dataDir, 'sessions', hashHex(sid)))
}

export function issueMagicTicket(dataDir: string, email: string, previousHash?: string): string {
  if (previousHash) deletePointer(pointerPath(dataDir, 'tickets', previousHash))
  const ticket = randomBytes(32).toString('hex')
  const ticketHash = hashHex(ticket)
  const now = Date.now()
  const record: TicketRecord = {
    email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TICKET_TTL_SEC * 1000).toISOString(),
  }
  writePointer(pointerPath(dataDir, 'tickets', ticketHash), record)
  return ticket
}

export function consumeMagicTicket(dataDir: string, ticket: string): { email: string; userHome: string } | null {
  if (!/^[0-9a-f]{64}$/i.test(ticket)) return null
  const ticketHash = hashHex(ticket)
  const file = pointerPath(dataDir, 'tickets', ticketHash)
  if (!existsSync(file)) return null
  try {
    const record = JSON.parse(readFileSync(file, 'utf-8')) as TicketRecord
    if (typeof record.email !== 'string' || typeof record.expiresAt !== 'string') {
      deletePointer(file)
      return null
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      deletePointer(file)
      return null
    }
    const parsed = parseEmail(record.email)
    if (!parsed) {
      deletePointer(file)
      return null
    }
    const userHome = userDir(dataDir, parsed.domain, parsed.username)
    if (!isInsideDataDir(dataDir, userHome)) {
      deletePointer(file)
      return null
    }
    const user = readUserRecord(userHome)
    if (!user || user.email !== parsed.email) {
      deletePointer(file)
      return null
    }
    if (user.magicTicketHash && !hashedSecretsEqual(ticket, user.magicTicketHash)) {
      return null
    }
    deletePointer(file)
    return { email: parsed.email, userHome }
  } catch {
    return null
  }
}
