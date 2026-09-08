import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'

const serverDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(serverDir, '..')
const distDir = join(rootDir, 'dist')

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv(join(rootDir, '.env'))

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('Missing dist/ — run npm run build first')
  process.exit(1)
}

const env = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  SITE_URL: process.env.SITE_URL,
  COOKIE_SECURE: process.env.COOKIE_SECURE,
}

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '127.0.0.1'
const app = createApp({ env, rootDir, serveStatic: true, distDir })

app.listen(port, host, () => {
  console.log(`[dbdraw] listening on ${host}:${port}`)
})
