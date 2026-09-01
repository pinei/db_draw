import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function persistencePlugin(): Plugin {
  return {
    name: 'persistence',
    configureServer(server) {
      server.middlewares.use('/api/models', (req, res, next) => {
        const name = req.url?.replace(/^\//, '').split('?')[0]
        if (!name) { next(); return }

        const dir     = join(__dirname, 'data', name)
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
  plugins: [vue(), persistencePlugin()],
})
