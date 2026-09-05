// ─── Minimal DBML/Mermaid highlighters ───────────────────────────────────────
// Zero-dependency tokenizers for the exact output of generateDbml /
// generateMermaid (plus hand-typed variants). Pure functions: source text (+
// known table names) → HTML string rendered with v-html.
//
// Every emitted chunk goes through esc(), so user input can never inject markup.
// Table names come from the live schema, so generated AND hand-typed references
// highlight exactly — no heuristic guessing.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${esc(text)}</span>`
}

// ─── Shared patterns ─────────────────────────────────────────────────────────

const TYPE_NAMES =
  'int|integer|bigint|smallint|serial|varchar|char|character|text|boolean|bool|' +
  'date|datetime|timestamp|time|float|double|decimal|numeric|uuid|jsonb?|blob|bytes'
// NOTE: the size suffix is non-capturing on purpose — TYPE_RE.source is
// embedded in bigger alternations where every ( ) shifts group indices
const TYPE_RE = new RegExp(`\\b(?:${TYPE_NAMES})(?:\\([^)]*\\))?(?![A-Za-z0-9_])`, 'i')

const NUM_RE = /\b\d+(?:\.\d+)?\b/
const IDENT_RE = /[A-Za-z_]\w*/

function tablePattern(names: string[]): RegExp | null {
  const valid = names.filter((n) => n.length > 0)
  if (!valid.length) return null
  return new RegExp(`\\b(?:${valid.map(escRegExp).join('|')})\\b`)
}

// Table-name alternative that keeps group indices stable when the schema
// has no entities: a group that never matches
function tableAlt(tableRe: RegExp | null): string {
  return tableRe ? `(${tableRe.source})` : '((?!))'
}

// Splits off a trailing line comment; returns [code, comment]
function splitComment(line: string, marker: '//' | '%%'): [string, string] {
  const i = line.indexOf(marker)
  return i < 0 ? [line, ''] : [line.slice(0, i), line.slice(i)]
}

// ─── DBML ────────────────────────────────────────────────────────────────────

// Highlights the inside of a [ ... ] annotation: pk → key, ref → keyword,
// operators → op, Table.field references → table, brackets stay annotation color
function highlightAnnotation(inner: string, tableRe: RegExp | null): string {
  const re = new RegExp(
    `(\\bpk\\b)|(\\bref\\b)|(<>)|([><])|(\\s-\\s)|${tableAlt(tableRe)}|(${IDENT_RE.source})`,
    'g',
  )
  let out = ''
  let last = 0
  re.lastIndex = 0
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    out += esc(inner.slice(last, m.index))
    const [tok, pk, ref, dia, gtlt, dash, table, ident] = m
    if (pk) out += span('tok-pk', tok)
    else if (ref) out += span('tok-kw', tok)
    else if (dia || gtlt || dash) out += span('tok-op', tok)
    else if (table) out += span('tok-table', tok)
    else if (ident) out += span('tok-field', tok)
    last = m.index + tok.length
    if (tok.length === 0) re.lastIndex++
  }
  return out + esc(inner.slice(last))
}

function highlightDbmlLine(line: string, tableRe: RegExp | null): string {
  const [code, comment] = splitComment(line, '//')
  const parts: string[] = [
    tableAlt(tableRe),
    '(\\bTable\\b|\\bRef:)',
    '(\\[[^\\]\\n]*\\]?)', // annotation (tolerates unclosed [ while typing)
    `(${TYPE_RE.source})`,
    `(${NUM_RE.source})`,
    '(<>)|([><])|(\\s-\\s)',
    `(${IDENT_RE.source})(?=\\.)`, // table prefix in Entity.field
    `(${IDENT_RE.source})`,
  ]
  // 'i' so hand-typed lowercase (table, integer, pk…) highlights like generated code
  const re = new RegExp(parts.join('|'), 'gi')
  let out = ''
  let last = 0
  for (let m = re.exec(code); m; m = re.exec(code)) {
    out += esc(code.slice(last, m.index))
    const [tok, table, kw, annot, type, num, dia, gtlt, dash, prefix, ident] = m
    if (table) out += span('tok-table', tok)
    else if (kw) out += span('tok-kw', tok)
    else if (annot) {
      out += span('tok-annot', tok[0]) // [
      out += highlightAnnotation(tok.slice(1, tok.endsWith(']') ? -1 : undefined), tableRe)
      if (tok.endsWith(']')) out += span('tok-annot', ']')
    }     else if (type) out += span('tok-type', tok)
    else if (num) out += span('tok-num', tok)
    else if (dia || gtlt || dash) out += span('tok-op', tok)
    else if (prefix) out += span('tok-table', tok)
    else if (ident) out += span('tok-field', tok)
    last = m.index + tok.length
    if (tok.length === 0) re.lastIndex++
  }
  out += esc(code.slice(last))
  if (comment) out += span('tok-comment', comment)
  return out
}

export function highlightDbml(src: string, tableNames: string[]): string {
  const tableRe = tablePattern(tableNames)
  return src.split('\n').map((line) => highlightDbmlLine(line, tableRe)).join('\n')
}

// ─── Mermaid ─────────────────────────────────────────────────────────────────

function highlightMermaidLine(line: string, tableRe: RegExp | null): string {
  const [code, comment] = splitComment(line, '%%')
  const parts: string[] = [
    tableAlt(tableRe),
    '(\\berDiagram\\b)',
    '("[^"\\n]*"?)', // label string (tolerates unclosed " while typing)
    '(\\bPK\\b|\\bFK\\b)',
    `(${TYPE_RE.source})`,
    '([}|o{]+-{1,2}[}|o{]+)', // }o--||, ||--||, }|--|| …
    `(${IDENT_RE.source})(?=\\s*\\{)`, // entity header: Name {
    `(${IDENT_RE.source})`,
  ]
  const re = new RegExp(parts.join('|'), 'gi')
  let out = ''
  let last = 0
  for (let m = re.exec(code); m; m = re.exec(code)) {
    out += esc(code.slice(last, m.index))
    const [tok, table, diagram, str, pkfk, type, rel, header, ident] = m
    if (table) out += span('tok-table', tok)
    else if (diagram) out += span('tok-kw', tok)
    else if (str) out += span('tok-str', tok)
    else if (pkfk) out += span('tok-pk', tok)
    else if (type) out += span('tok-type', tok)
    else if (rel) out += span('tok-op', tok)
    else if (header) out += span('tok-table', tok)
    else if (ident) out += span('tok-field', tok)
    last = m.index + tok.length
    if (tok.length === 0) re.lastIndex++
  }
  out += esc(code.slice(last))
  if (comment) out += span('tok-comment', comment)
  return out
}

export function highlightMermaid(src: string, tableNames: string[]): string {
  const tableRe = tablePattern(tableNames)
  return src.split('\n').map((line) => highlightMermaidLine(line, tableRe)).join('\n')
}
