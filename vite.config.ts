import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiRouter } from './server/app'
import type { TokenMailEnv } from './server/tokenEmail'

const __dirname = dirname(fileURLToPath(import.meta.url))

function apiPlugin(env: TokenMailEnv): Plugin {
  const api = createApiRouter({ env, rootDir: __dirname, serveStatic: false })
  return {
    name: 'api',
    configureServer(server) {
      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        api(req as never, res as never, next)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
    plugins: [vue(), apiPlugin(env)],
  }
})
