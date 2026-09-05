import type { ErSchema, ErField, ErRelationship, Cardinality, LogicalCardinality } from '../model/types'

// ─── DBML serializer ─────────────────────────────────────────────────────────

function dbmlFieldLine(f: ErField): string {
  const flags: string[] = []
  if (f.isPK) flags.push('pk')
  if (f.isFK && f.referencedEntityId) flags.push(`ref: > ${f.referencedEntityId}.id`)
  const annotation = flags.length ? ` [${flags.join(', ')}]` : ''
  return `  ${f.name} ${f.type}${annotation}`
}

export function generateDbml(schema: ErSchema): string {
  const tables = schema.entities.map((entity) => {
    const fields = entity.fields.map(dbmlFieldLine).join('\n')
    return `Table ${entity.name} {\n${fields}\n}`
  })

  const refs = schema.relationships
    .map((rel) => {
      const fromEntity = schema.entities.find((e) => e.id === rel.fromEntityId)
      const toEntity   = schema.entities.find((e) => e.id === rel.toEntityId)
      if (!fromEntity || !toEntity) return null
      const op = cardinalityToDbmlOp(rel.fromCardinality, rel.toCardinality)
      const comment = rel.label ? ` // ${rel.label}` : ''
      return `Ref: ${fromEntity.name}.id ${op} ${toEntity.name}.id${comment}`
    })
    .filter(Boolean)

  return [...tables, '', ...refs].join('\n')
}

// Maps cardinality pair to DBML ref operator
function cardinalityToDbmlOp(from: Cardinality, to: Cardinality): string {
  const isMany = (c: Cardinality | LogicalCardinality) => c === 'MANY' || c === 'ZERO_OR_MANY' || c === 'ONE_OR_MANY'
  if (isMany(from) && isMany(to)) return '<>'
  if (isMany(from)) return '>'
  if (isMany(to))   return '<'
  return '-'
}

// ─── Mermaid serializer ───────────────────────────────────────────────────────

function mermaidFieldLine(f: ErField): string {
  const pkfk = f.isPK ? ' PK' : f.isFK ? ' FK' : ''
  // Sanitize type for Mermaid (no parentheses)
  const type = f.type.replace(/\(.*\)/, '')
  return `    ${type} ${f.name}${pkfk}`
}

function cardinalityToMermaid(c: Cardinality | LogicalCardinality, side: 'from' | 'to'): string {
  // Returns the Mermaid half-connector symbol for a given side
  // (MANY is a logical placeholder kept for future use)
  switch (c) {
    case 'ONE':         return '||'
    case 'MANY':        return side === 'from' ? '}|' : '|{'
    case 'ONE_OR_MANY': return side === 'from' ? '}|' : '|{'
    case 'ZERO_OR_ONE':  return side === 'from' ? '|o' : 'o|'
    case 'ZERO_OR_MANY': return side === 'from' ? '}o' : 'o{'
  }
}

function relToMermaid(rel: ErRelationship, schema: ErSchema): string | null {
  const fromEntity = schema.entities.find((e) => e.id === rel.fromEntityId)
  const toEntity   = schema.entities.find((e) => e.id === rel.toEntityId)
  if (!fromEntity || !toEntity) return null

  const fromSym = cardinalityToMermaid(rel.fromCardinality, 'from')
  const toSym   = cardinalityToMermaid(rel.toCardinality, 'to')
  const label   = rel.label ?? ''
  return `  ${fromEntity.name} ${fromSym}--${toSym} ${toEntity.name} : "${label}"`
}

export function generateMermaid(schema: ErSchema): string {
  const entities = schema.entities.map((entity) => {
    const fields = entity.fields.map(mermaidFieldLine).join('\n')
    return `  ${entity.name} {\n${fields}\n  }`
  })

  const relationships = schema.relationships
    .map((rel) => relToMermaid(rel, schema))
    .filter(Boolean)

  return ['erDiagram', ...entities, '', ...relationships].join('\n')
}
