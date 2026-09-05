// ─── Model metadata helpers (pure) ───────────────────────────────────────────
// Tags are lowercase + digits + underscore; user input is normalized
// (lowercased, trimmed, inner whitespace → _, the rest stripped).

import type { ModelMeta } from '../model/types'
import { TAG_PATTERN } from '../model/types'

/** Normalize free input into a valid tag ('' when nothing usable remains). */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

/** Sanitize an unknown value into a deduped list of valid tags. */
export function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) {
    if (typeof t !== 'string') continue
    const n = normalizeTag(t)
    if (n && TAG_PATTERN.test(n) && !out.includes(n)) out.push(n)
  }
  return out
}

/** Backfill for artifacts saved before meta existed (id always wins). */
export function defaultMeta(id: string, incoming?: Partial<ModelMeta>): ModelMeta {
  return {
    id,
    name: typeof incoming?.name === 'string' && incoming.name ? incoming.name : id,
    description: typeof incoming?.description === 'string' ? incoming.description : '',
    tags: sanitizeTags(incoming?.tags),
  }
}

/** Seed for users with no model yet (saved to models/default/ on first login). */
export function seedMeta(): ModelMeta {
  return {
    id: 'default',
    name: 'Default ER Diagram',
    description:
      'Sample library ER diagram — publishers, books, authors, loans and fines. Edit it or make it yours.',
    tags: ['default'],
  }
}
