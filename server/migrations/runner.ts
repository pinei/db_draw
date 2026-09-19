// ─── Migration runner ────────────────────────────────────────────────────────
// Silent on boot: reads data/meta.json (missing = version 0), snapshots
// data/ to data/_backups/ ALWAYS before mutating, applies pending migrations
// in order, bumps the version. On ANY failure the backup is restored and the
// error rethrown so the app refuses to boot on half-migrated data.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './index'

const META_FILE = 'meta.json'
const BACKUPS_DIR = '_backups'
const MAX_BACKUPS = 5

interface MetaHistoryEntry {
  version: number
  name: string
  at: string
  backup: string
}

interface DataMeta {
  version: number
  history: MetaHistoryEntry[]
}

/** dataDirs already migrated in this process (dev HMR can re-run module code). */
const migratedInProcess = new Set<string>()

function metaPath(dataDir: string): string {
  return join(dataDir, META_FILE)
}

function readMeta(dataDir: string): DataMeta {
  try {
    const raw = JSON.parse(readFileSync(metaPath(dataDir), 'utf-8')) as Partial<DataMeta>
    if (typeof raw.version === 'number' && Array.isArray(raw.history)) {
      return { version: raw.version, history: raw.history }
    }
  } catch {
    // missing/corrupt → treat as fresh v0 (backup still taken below)
  }
  return { version: 0, history: [] }
}

function pruneBackups(dataDir: string): void {
  const dir = join(dataDir, BACKUPS_DIR)
  if (!existsSync(dir)) return
  const entries = readdirSync(dir).sort()
  while (entries.length > MAX_BACKUPS) {
    const oldest = entries.shift()
    if (!oldest) break
    try { rmSync(join(dir, oldest), { recursive: true, force: true }) } catch { /* best effort */ }
  }
}

/** Copy data/ (minus previous backups) aside; returns the backup dir name. */
function takeBackup(dataDir: string, toVersion: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `pre-v${toVersion}-${stamp}`
  const dest = join(dataDir, BACKUPS_DIR, name)
  mkdirSync(join(dataDir, BACKUPS_DIR), { recursive: true })
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(dest, { recursive: true })
    return name
  }
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(dataDir)) {
    if (entry === BACKUPS_DIR || entry === META_FILE) continue
    cpSync(join(dataDir, entry), join(dest, entry), { recursive: true })
  }
  return name
}

/** Remove everything restored-overwritable, then copy the backup back. */
function restoreBackup(dataDir: string, backupName: string): void {
  const src = join(dataDir, BACKUPS_DIR, backupName)
  for (const entry of readdirSync(dataDir)) {
    if (entry === BACKUPS_DIR || entry === META_FILE) continue
    rmSync(join(dataDir, entry), { recursive: true, force: true })
  }
  for (const entry of readdirSync(src)) {
    cpSync(join(src, entry), join(dataDir, entry), { recursive: true })
  }
}

export function migrateToLatest(dataDir: string): void {
  if (migratedInProcess.has(dataDir)) return
  const meta = readMeta(dataDir)
  const pending = MIGRATIONS.filter((m) => m.version > meta.version).sort((a, b) => a.version - b.version)
  if (pending.length === 0) {
    migratedInProcess.add(dataDir)
    return
  }
  const target = pending[pending.length - 1].version
  const backupName = takeBackup(dataDir, target)
  console.log(`[migrate] data v${meta.version} → v${target} (${pending.length} pending), backup ${BACKUPS_DIR}/${backupName}`)
  try {
    for (const m of pending) {
      console.log(`[migrate] applying v${m.version} ${m.name}…`)
      m.up(dataDir)
      meta.version = m.version
      meta.history.push({ version: m.version, name: m.name, at: new Date().toISOString(), backup: backupName })
      console.log(`[migrate] v${m.version} ${m.name} ok`)
    }
    writeFileSync(metaPath(dataDir), JSON.stringify(meta, null, 2), 'utf-8')
    pruneBackups(dataDir)
  } catch (e) {
    console.error(`[migrate] FAILED, restoring backup ${backupName}: ${e instanceof Error ? e.message : String(e)}`)
    try {
      restoreBackup(dataDir, backupName)
    } catch (restoreErr) {
      console.error(`[migrate] RESTORE ALSO FAILED: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`)
    }
    throw e
  }
  migratedInProcess.add(dataDir)
}
