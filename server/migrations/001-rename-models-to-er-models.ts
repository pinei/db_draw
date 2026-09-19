// v1: rename every user's `models/` folder to `er-models/`.
// Skips users without a `models/` folder (fresh or already migrated).
// Fails loudly when BOTH folders exist — merging would risk overwriting
// models, so a human resolves it and the runner restores the backup.

import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { isInsideDataDir } from '../store'
import type { Migration } from './index'

export const migration001RenameModelsToErModels: Migration = {
  version: 1,
  name: 'rename-models-to-er-models',
  up(dataDir: string): void {
    const root = join(dataDir, 'user')
    if (!existsSync(root)) return
    const errors: string[] = []
    for (const domainEnt of readdirSync(root, { withFileTypes: true })) {
      if (!domainEnt.isDirectory()) continue
      const domainDir = join(root, domainEnt.name)
      for (const userEnt of readdirSync(domainDir, { withFileTypes: true })) {
        if (!userEnt.isDirectory()) continue
        const home = join(domainDir, userEnt.name)
        if (!isInsideDataDir(dataDir, home)) continue
        try {
          const from = join(home, 'models')
          const to = join(home, 'er-models')
          if (!existsSync(from)) continue
          if (existsSync(to)) {
            throw new Error(`both models/ and er-models/ exist for ${domainEnt.name}/${userEnt.name}`)
          }
          renameSync(from, to)
        } catch (e) {
          errors.push(`${domainEnt.name}/${userEnt.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(`v1 rename-models-to-er-models failed for ${errors.length} user(s): ${errors.join('; ')}`)
    }
  },
}
