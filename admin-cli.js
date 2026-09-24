#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))
const dataDir = join(rootDir, 'data')

function parseEmail(value) {
  if (typeof value !== 'string') return null

  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null

  const username = email.slice(0, at)
  const domain = email.slice(at + 1)
  const segment = /^[a-z0-9][a-z0-9._~+-]*$/
  if (!domain.includes('.') || !segment.test(username) || !segment.test(domain)) return null

  return { email, username, domain }
}

function hashSecret(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function usage() {
  console.log(`Usage:
  npm run admin-cli -- create-user <email>
  npm run admin-cli -- delete-user <email>
  npm run admin-cli -- reset-token <email>

Example:
  npm run admin-cli -- create-user developer@example.com
  npm run admin-cli -- delete-user developer@example.com
  npm run admin-cli -- reset-token developer@example.com`)
}

function createUser(emailInput) {
  const parsed = parseEmail(emailInput)
  if (!parsed) {
    throw new Error('informe um email válido')
  }

  const userDir = join(dataDir, 'user', parsed.domain, parsed.username)
  const userFile = join(userDir, 'user.json')
  if (existsSync(userFile)) {
    throw new Error(`o usuário ${parsed.email} já existe`)
  }

  const token = randomBytes(32).toString('hex')
  const record = {
    email: parsed.email,
    tokenHash: hashSecret(token),
    createdAt: new Date().toISOString(),
  }

  mkdirSync(join(userDir, 'models'), { recursive: true })
  writeFileSync(userFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8')

  console.log(`Usuário criado: ${parsed.email}`)
  console.log(`Token: ${token}`)
  console.log(`Arquivo: ${userFile}`)
}

function resetToken(emailInput) {
  const parsed = parseEmail(emailInput)
  if (!parsed) {
    throw new Error('informe um email válido')
  }

  const userFile = join(dataDir, 'user', parsed.domain, parsed.username, 'user.json')
  if (!existsSync(userFile)) {
    throw new Error(`o usuário ${parsed.email} não existe`)
  }

  let record
  try {
    record = JSON.parse(readFileSync(userFile, 'utf8'))
  } catch {
    throw new Error(`não foi possível ler ${userFile}`)
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`não foi possível ler ${userFile}`)
  }

  const token = randomBytes(32).toString('hex')
  record.email = parsed.email
  record.tokenHash = hashSecret(token)
  delete record.token

  writeFileSync(userFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8')

  console.log(`Token regerado: ${parsed.email}`)
  console.log(`Token: ${token}`)
}

function deleteUser(emailInput) {
  const parsed = parseEmail(emailInput)
  if (!parsed) {
    throw new Error('informe um email válido')
  }

  const userDir = join(dataDir, 'user', parsed.domain, parsed.username)
  const userFile = join(userDir, 'user.json')
  if (!existsSync(userFile)) {
    throw new Error(`o usuário ${parsed.email} não existe`)
  }

  rmSync(userDir, { recursive: true, force: true })
  console.log(`Usuário removido: ${parsed.email}`)
  console.log(`Pasta removida: ${userDir}`)
}

function main() {
  const [command, email] = process.argv.slice(2)
  if (command === '--help' || command === '-h' || !command) {
    usage()
    return
  }
  if (command !== 'create-user' && command !== 'delete-user' && command !== 'reset-token') {
    throw new Error(`comando desconhecido: ${command}`)
  }
  if (command === 'create-user') createUser(email)
  else if (command === 'reset-token') resetToken(email)
  else deleteUser(email)
}

try {
  main()
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}