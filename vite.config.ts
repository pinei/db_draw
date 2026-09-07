import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import express from 'express'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiRouter } from './server/app'
import type { TokenMailEnv } from './server/tokenEmail'

const __dirname = dirname(fileURLToPath(import.meta.url))

function apiPlugin(env: TokenMailEnv): Plugin {
  // Full Express app so req/res get Express helpers (res.status, res.json, …).
  // A bare Router on Vite's Connect stack receives raw Node ServerResponse.
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(createApiRouter({ env, rootDir: __dirname }))
  return {
    name: 'api',
    configureServer(server) {
      server.middlewares.use('/api', app)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
    plugins: [vue(), apiPlugin(env)],
  }
})
