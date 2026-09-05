// ─── DBML → diagram import (incremental sync) ────────────────────────────────
// Pure functions (no Vue/Pinia): compile validated DBML text, diff it against
// the current ErSchema matched BY EXACT NAME, and build a patched schema.
//
// Preservation rules (the whole point of this module):
// - matched entities/relationships keep their ids → positions, connector
//   overrides and label overrides keyed by id survive untouched;
// - matched relationships keep their cardinalities unless the parsed operator
//   contradicts the many/one side (optionality is preserved per side);
// - only genuinely new relationships get default cardinalities from the operator.
// New ids/positions are assigned by the store action (placement needs layout).

import type { Cardinality, ErEntity, ErRelationship, ErSchema } from '../model/types'
import { Compiler, MemoryProjectLayout, Filepath } from '@dbml/parse'

// ─── Parsed shapes (structural — runtime keys differ from the lib's docs) ────

interface ParsedInlineRef {
  tableName: string
  fieldNames?: string[]
  relation?: string
}

interface ParsedField {
  name?: string
  type?: { type_name?: string }
  pk?: boolean
  unique?: boolean
  not_null?: boolean
  dbdefault?: unknown
  inline_refs?: ParsedInlineRef[]
}

interface ParsedIndex {
  pk?: boolean
  columns?: Array<string | { value?: unknown }>
}

interface ParsedTable {
  name?: string
  fields?: ParsedField[]
  // composite PKs land here (the interpreter clears per-column pk for them)
  indexes?: ParsedIndex[]
}

interface ParsedEndpoint {
  tableName?: string
  fieldNames?: string[]
  relation?: string
}

interface ParsedRef {
  endpoints?: ParsedEndpoint[]
}

interface ParsedDb {
  tables?: ParsedTable[]
  refs?: ParsedRef[]
  enums?: unknown[]
  tableGroups?: unknown[]
  notes?: unknown[]
}

interface DbmlIssue {
  code?: string | number
  message?: unknown
  start?: unknown
}

// Code 5002 "Two endpoints are the same": explicit self-refs the binder rejects.
// getValue() returns undefined whenever ANY error exists, so the import pass
// compiles a sanitized copy (5002 lines removed) and synthesizes these rels.
const SELF_REF_CODE = 5002

// ─── Normalized refs ─────────────────────────────────────────────────────────

// from/to = left/right table as written; many-ness derived from the operator
// (explicit endpoints carry per-end relation '1'/'*'; inline carries '>'/'<')
export interface NormalizedRef {
  fromTable: string
  fromField: string
  toTable: string
  toField: string
  fromMany: boolean
  toMany: boolean
  label?: string
}

export interface CompiledDbml {
  tables: ParsedTable[]
  refs: NormalizedRef[]
  ignored: number
}

function offsetToLineCol(text: string, offset: unknown): string {
  const i = typeof offset === 'number' ? Math.max(0, Math.min(offset, text.length)) : 0
  const upto = text.slice(0, i)
  const line = (upto.match(/\n/g) || []).length + 1
  const col = i - (upto.lastIndexOf('\n') + 1) + 1
  return `${line}:${col}`
}

function formatIssues(text: string, issues: DbmlIssue[]): string {
  return issues
    .map((e) => `${offsetToLineCol(text, e.start)} ${String(e.message ?? 'error')}`)
    .join('; ')
}

function compileSource(text: string) {
  const project = new MemoryProjectLayout()
  // Filepath.from requires an ABSOLUTE path — a relative one throws
  const filepath = Filepath.from('/schema.dbml')
  project.setSource(filepath, text)
  return new Compiler(project).interpretFile(filepath)
}

// Single-line `Ref: A.x <> B.y // label` — the form we generate and the common
// hand-typed form (long-form `Ref { ... }` blocks are out of scope)
const REF_LINE_RE = /^\s*Ref:\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*(<>|>|<|-)\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\s*\/\/(.*))?$/

function opToMany(op: string): [boolean, boolean] {
  if (op === '<>') return [true, true]
  if (op === '>') return [true, false]
  if (op === '<') return [false, true]
  return [false, false]
}

// ─── Compile: validate + extract tables/refs ─────────────────────────────────

export function compileDbml(text: string): { ok: true; value: CompiledDbml } | { ok: false; message: string } {
  let working = text
  const selfLoopRefs: NormalizedRef[] = []
  let ignored = 0

  const first = compileSource(working)
  const issues = first.getErrors() as unknown as DbmlIssue[]
  const hardErrors = issues.filter((e) => e.code !== SELF_REF_CODE)
  if (hardErrors.length > 0) {
    return { ok: false, message: `✗ ${formatIssues(text, hardErrors)}` }
  }

  // Tolerated 5002s poison getValue() → drop those lines and recompile.
  // Their line/col in messages refers to the ORIGINAL text (validateDbml path
  // never sanitizes), so positions stay truthful everywhere else.
  const selfRefIssues = issues.filter((e) => e.code === SELF_REF_CODE)
  if (selfRefIssues.length > 0) {
    const lines = working.split('\n')
    const drop = new Set<number>()
    for (const e of selfRefIssues) {
      if (typeof e.start !== 'number') continue
      drop.add(working.slice(0, e.start).split('\n').length - 1)
    }
    const dropped = [...drop].sort((a, b) => b - a)
    for (const i of dropped) {
      const line = lines[i] ?? ''
      const m = REF_LINE_RE.exec(line)
      if (m) {
        const [, t, f, op] = m
        const [fromMany, toMany] = opToMany(op)
        selfLoopRefs.push({ fromTable: t, fromField: f, toTable: t, toField: f, fromMany, toMany })
      } else {
        ignored++ // long-form self-ref: can't map, counted as ignored
      }
      lines.splice(i, 1)
    }
    working = lines.join('\n')
  }

  const result = selfRefIssues.length > 0 ? compileSource(working) : first
  const rest = result.getErrors() as unknown as DbmlIssue[]
  if (rest.length > 0) {
    return { ok: false, message: `✗ ${formatIssues(text, rest)}` }
  }
  const db = result.getValue() as unknown as ParsedDb | undefined
  if (!db) return { ok: false, message: '✗ Error: parse produced no result' }

  const tables = (db.tables ?? []).filter((t) => typeof t.name === 'string')
  if (tables.length === 0) {
    return { ok: false, message: '✗ Nothing to apply — no Table blocks in code' }
  }
  const knownTables = new Set(tables.map((t) => t.name as string))

  // Explicit refs + labels come straight from the source lines (the AST
  // endpoints lack labels and the operator, carrying only per-end '1'/'*')
  const refs: NormalizedRef[] = [...selfLoopRefs]
  for (const line of working.split('\n')) {
    const m = REF_LINE_RE.exec(line)
    if (!m) continue
    const [, fromTable, fromField, op, toTable, toField, comment] = m
    if (!knownTables.has(fromTable) || !knownTables.has(toTable)) {
      ignored++ // unreachable post-validation, but never crash on it
      continue
    }
    const [fromMany, toMany] = opToMany(op)
    const label = comment?.trim() || undefined
    refs.push({ fromTable, fromField, toTable, toField, fromMany, toMany, label })
  }

  // Inline `[ref: > T.f]` refs from the AST
  for (const table of tables) {
    for (const field of table.fields ?? []) {
      for (const inline of field.inline_refs ?? []) {
        if (!inline.tableName || (inline.fieldNames ?? []).length !== 1) {
          ignored++ // composite FK: not representable, counted
          continue
        }
        if (!knownTables.has(inline.tableName)) {
          ignored++
          continue
        }
        // '>' = this side many (A.x > B.y); '<' = other side many
        const fromMany = inline.relation !== '<'
        refs.push({
          fromTable: table.name as string,
          fromField: field.name as string,
          toTable: inline.tableName,
          toField: inline.fieldNames?.[0] as string,
          fromMany,
          toMany: !fromMany,
          label: undefined,
        })
      }
    }
  }

  // Inline + explicit duplicates (our old generator emitted both): one wins
  const seen = new Set<string>()
  const deduped = refs.filter((r) => {
    const key = refKey(r)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Ignored inventory: no-counterpart features + constrained columns.
  // [not null] on an FK-side endpoint field IS consumed (one-side optionality
  // inference) and doesn't count; anywhere else it has no counterpart.
  const nnConsumed = new Set<string>()
  for (const r of deduped) {
    if (r.fromMany) nnConsumed.add(`${r.fromTable} ${r.fromField}`)
    if (r.toMany) nnConsumed.add(`${r.toTable} ${r.toField}`)
    if (!r.fromMany && !r.toMany) {
      nnConsumed.add(`${r.fromTable} ${r.fromField}`)
      nnConsumed.add(`${r.toTable} ${r.toField}`)
    }
  }
  ignored += (db.enums ?? []).length + (db.tableGroups ?? []).length + (db.notes ?? []).length
  for (const table of tables) {
    for (const field of table.fields ?? []) {
      const nnConsumedHere = !!field.not_null && nnConsumed.has(`${table.name} ${field.name}`)
      if (field.unique || field.dbdefault != null || (field.not_null && !nnConsumedHere)) ignored++
    }
  }

  return { ok: true, value: { tables, refs: deduped, ignored } }
}

function refKey(r: NormalizedRef): string {
  const op = r.fromMany && r.toMany ? '<>' : r.fromMany ? '>' : r.toMany ? '<' : '-'
  return `${r.fromTable}.${r.fromField} ${op} ${r.toTable}.${r.toField}`
}

// ─── Cardinalities ───────────────────────────────────────────────────────────

function isManySide(c: Cardinality): boolean {
  return c === 'ONE_OR_MANY' || c === 'ZERO_OR_MANY'
}

// Defaults for genuinely new relationships (> → ONE_OR_MANY→ONE etc.).
// The many-side axis stays ONE_OR_MANY (unknowable in DBML); the one-side
// axis comes from [not null] on the opposite (FK-side) field when known.
function defaultCardinalities(ref: NormalizedRef, nnOf: (table: string, field: string) => boolean): [Cardinality, Cardinality] {
  return [
    ref.fromMany ? 'ONE_OR_MANY' : nnOf(ref.toTable, ref.toField) ? 'ONE' : 'ZERO_OR_ONE',
    ref.toMany ? 'ONE_OR_MANY' : nnOf(ref.fromTable, ref.fromField) ? 'ONE' : 'ZERO_OR_ONE',
  ]
}

// Keep the side's optionality (ZERO_*) when the many/one side flips
function withManySide(c: Cardinality, many: boolean): Cardinality {
  const optional = c === 'ZERO_OR_ONE' || c === 'ZERO_OR_MANY'
  if (many) return optional ? 'ZERO_OR_MANY' : 'ONE_OR_MANY'
  return optional ? 'ZERO_OR_ONE' : 'ONE'
}

// ─── Id synthesis ────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'entity'
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
  taken.add(id)
  return id
}

// ─── Diff + patch ────────────────────────────────────────────────────────────

export interface DbmlPatch {
  schema: ErSchema
  createdEntityIds: string[]
  removedEntityIds: string[]
  changedEntityIds: string[]
  removedRelIds: string[]
  // neighbor (already-placed) entity ids per created entity, for placement
  neighbors: Record<string, string[]>
  stats: {
    tables: number
    rels: number
    createdEntities: number
    removedEntities: number
    changedEntities: number
    createdRels: number
    removedRels: number
    changedRels: number
    ignored: number
  }
  summary: string
}

function normType(t: string): string {
  return t.replace(/\(.*\)/, '').trim().toUpperCase()
}

function fieldSig(f: ErField): string {
  return `${f.name}:${f.type}:${f.isPK ? 'pk' : ''}`
}

export function buildDbmlPatch(current: ErSchema, compiled: CompiledDbml): DbmlPatch {
  const taken = new Set<string>([
    ...current.entities.map((e) => e.id),
    ...current.entities.flatMap((e) => e.fields.map((f) => f.id)),
    ...current.relationships.map((r) => r.id),
  ])
  const byName = new Map(current.entities.map((e) => [e.name, e]))

  // [not null] flags by Table.field, for one-side optionality inference
  const nnSet = new Set<string>()
  for (const table of compiled.tables) {
    for (const col of table.fields ?? []) {
      if (col.not_null && typeof col.name === 'string') nnSet.add(`${table.name} ${col.name}`)
    }
  }
  const nnOf = (table: string, field: string): boolean => nnSet.has(`${table} ${field}`)

  const createdEntityIds: string[] = []
  const removedEntityIds: string[] = []
  const changedEntityIds: string[] = []
  const neighbors: Record<string, string[]> = {}

  // ── Entities + fields (order mirrors the Table block) ──
  const nextEntities: ErEntity[] = []
  const idOfName = new Map<string, string>()
  for (const table of compiled.tables) {
    const name = table.name as string
    const existing = byName.get(name)
    const entityId = existing ? existing.id : uniqueId(slug(name), taken)
    if (!existing) {
      createdEntityIds.push(entityId)
      neighbors[entityId] = []
    }
    idOfName.set(name, entityId)

    const oldByName = new Map((existing?.fields ?? []).map((f) => [f.name, f]))
    // composite PK members (interpreter moves them to indexes[].pk)
    const compositePk = new Set<string>()
    for (const ix of table.indexes ?? []) {
      if (!ix.pk) continue
      for (const c of ix.columns ?? []) {
        const name = typeof c === 'string' ? c : typeof c.value === 'string' ? c.value : null
        if (name) compositePk.add(name)
      }
    }
    const nextFields: ErField[] = []
    for (const col of table.fields ?? []) {
      if (typeof col.name !== 'string') continue
      const old = oldByName.get(col.name)
      const parsedType = (col.type?.type_name ?? 'TEXT').toUpperCase()
      nextFields.push({
        id: old ? old.id : uniqueId(`${entityId}_${slug(col.name)}`, taken),
        name: col.name,
        // same type ignoring case/args → keep our formatting (VARCHAR(150))
        type: old && normType(old.type) === normType(parsedType) ? old.type : parsedType,
        isPK: !!col.pk || compositePk.has(col.name),
        isFK: false, // resolved from refs below; orphans become plain fields
      })
    }
    const next: ErEntity = { id: entityId, name, fields: nextFields }
    if (existing) {
      const a = existing.fields.map(fieldSig).join('|')
      const b = nextFields.map(fieldSig).join('|')
      if (a !== b) changedEntityIds.push(entityId)
    }
    nextEntities.push(next)
  }
  for (const e of current.entities) {
    if (!idOfName.has(e.name)) removedEntityIds.push(e.id)
  }

  // ── Relationships: match by unordered entity pair ──
  const pending = new Map<string, ErRelationship[]>()
  for (const r of current.relationships) {
    const key = [r.fromEntityId, r.toEntityId].sort().join(' ')
    if (!pending.has(key)) pending.set(key, [])
    pending.get(key)?.push(r)
  }

  const nextRels: ErRelationship[] = []
  const consumedRelIds = new Set<string>()
  let createdRels = 0
  let changedRels = 0
  for (const ref of compiled.refs) {
    const fromId = idOfName.get(ref.fromTable)
    const toId = idOfName.get(ref.toTable)
    if (!fromId || !toId) continue // unreachable post-validation
    const key = [fromId, toId].sort().join(' ')
    const candidates = pending.get(key) ?? []
    const match = candidates.find((r) => !consumedRelIds.has(r.id))

    if (match) {
      consumedRelIds.add(match.id)
      // map parsed many-ness onto the EXISTING direction (may be swapped):
      // many sides keep their ZERO-ness, one sides sync from [not null]
      const swapped = match.fromEntityId !== fromId
      const exFromMany = swapped ? ref.toMany : ref.fromMany
      const exToMany = swapped ? ref.fromMany : ref.toMany
      const oppFrom = swapped ? { t: ref.fromTable, f: ref.fromField } : { t: ref.toTable, f: ref.toField }
      const oppTo = swapped ? { t: ref.toTable, f: ref.toField } : { t: ref.fromTable, f: ref.fromField }
      const wantFrom = exFromMany
        ? withManySide(match.fromCardinality, true)
        : nnOf(oppFrom.t, oppFrom.f) ? 'ONE' : 'ZERO_OR_ONE'
      const wantTo = exToMany
        ? withManySide(match.toCardinality, true)
        : nnOf(oppTo.t, oppTo.f) ? 'ONE' : 'ZERO_OR_ONE'
      const wantLabel = ref.label
      if (wantFrom !== match.fromCardinality || wantTo !== match.toCardinality || wantLabel !== match.label) {
        changedRels++
      }
      nextRels.push({ ...match, fromCardinality: wantFrom, toCardinality: wantTo, label: wantLabel })
    } else {
      const [from, to] = defaultCardinalities(ref, nnOf)
      nextRels.push({
        id: uniqueId(`rel_${fromId}_${toId}`, taken),
        fromEntityId: fromId,
        toEntityId: toId,
        fromCardinality: from,
        toCardinality: to,
        label: ref.label,
      })
      createdRels++
    }

    // neighbor links for placement of created entities
    if (createdEntityIds.includes(fromId) && !createdEntityIds.includes(toId)) {
      neighbors[fromId]?.push(toId)
    }
    if (createdEntityIds.includes(toId) && !createdEntityIds.includes(fromId)) {
      neighbors[toId]?.push(fromId)
    }
  }
  const removedRelIds = current.relationships
    .filter((r) => !consumedRelIds.has(r.id))
    .map((r) => r.id)

  // ── FK flags from refs (many side points at the one side) ──
  const entById = new Map(nextEntities.map((e) => [e.id, e]))
  const curByName = new Map(current.entities.map((e) => [e.name, e]))
  const touch = (entityId: string, field: string, targetId: string) => {
    const f = entById.get(entityId)?.fields.find((x) => x.name === field)
    if (f) {
      f.isFK = true
      f.referencedEntityId = targetId
    }
  }
  // 1:1 (`-`) can't say which side holds the FK — restore it from the current
  // schema when it already points at the other endpoint (fields with NO ref
  // at all still become plain fields per the orphan rule)
  const restoreOneToOne = (table: string, field: string, otherTable: string) => {
    const curField = curByName.get(table)?.fields.find((x) => x.name === field)
    const otherId = idOfName.get(otherTable)
    if (curField?.isFK && otherId && curField.referencedEntityId === curByName.get(otherTable)?.id) {
      touch(idOfName.get(table) as string, field, otherId)
    }
  }
  for (const ref of compiled.refs) {
    const fromId = idOfName.get(ref.fromTable)
    const toId = idOfName.get(ref.toTable)
    if (!fromId || !toId || (ref.fromTable === ref.toTable && ref.fromField === ref.toField)) continue
    if (ref.fromMany && ref.toMany) {
      touch(fromId, ref.fromField, toId)
      touch(toId, ref.toField, fromId)
    } else if (ref.fromMany) {
      touch(fromId, ref.fromField, toId)
    } else if (ref.toMany) {
      touch(toId, ref.toField, fromId)
    } else {
      restoreOneToOne(ref.fromTable, ref.fromField, ref.toTable)
      restoreOneToOne(ref.toTable, ref.toField, ref.fromTable)
    }
  }

  const schema: ErSchema = { entities: nextEntities, relationships: nextRels }
  const stats = {
    tables: nextEntities.length,
    rels: nextRels.length,
    createdEntities: createdEntityIds.length,
    removedEntities: removedEntityIds.length,
    changedEntities: changedEntityIds.length,
    createdRels,
    removedRels: removedRelIds.length,
    changedRels,
    ignored: compiled.ignored,
  }
  const eBits = `+${stats.createdEntities} −${stats.removedEntities} ~${stats.changedEntities}`
  const rBits = `+${stats.createdRels} −${stats.removedRels} ~${stats.changedRels}`
  const ign = stats.ignored > 0 ? `; ${stats.ignored} ignored` : ''
  const summary = `✓ Applied — ${stats.tables} tables, ${stats.rels} relationships (tables ${eBits}; relationships ${rBits}${ign})`

  return {
    schema,
    createdEntityIds,
    removedEntityIds,
    changedEntityIds,
    removedRelIds,
    neighbors,
    stats,
    summary,
  }
}
