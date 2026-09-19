// ─── Data migrations (change management for data/) ───────────────────────────
// One file per version, applied in order at boot via migrateToLatest().
// Rules: forward-only (no downs — restore comes from the pre-run backup),
// per-user errors must not abort other users (collect and report), and every
// migration must be safe to re-run (check the condition before writing).

import { migration001RenameModelsToErModels } from './001-rename-models-to-er-models'

export interface Migration {
  version: number
  /** Short human-readable name, used in logs and meta.json history. */
  name: string
  up: (dataDir: string) => void
}

export const MIGRATIONS: Migration[] = [
  migration001RenameModelsToErModels,
]
