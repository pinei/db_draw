import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'

type Block = 'table' | 'other'
type Literal = '/*' | "'''" | '`'

interface DbmlState {
  blocks: Block[]
  pendingBlock: Block | null
  declarationName: boolean
  lineStart: boolean
  expectType: boolean
  afterDot: boolean
  settingsDepth: number
  literal: Literal | null
}

const declaration = /^(?:TablePartial|TableGroup|Table|Enum|Project|Ref|Note|DiagramView|Records)\b/i
const setting = /^(?:primary\s+key|not\s+null|pk|unique|increment|ref|note|default|check|name|type|delete|update|headercolor|color)\b(?!\s*\.)/i
const identifier = /^[\p{L}_$][\p{L}\p{M}\p{N}_$]*/u
const number = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?\b/i

function readQuoted(stream: StringStream, delimiter: string): boolean {
  while (!stream.eol()) {
    if (stream.match(delimiter)) return true
    if (stream.next() === '\\') stream.next()
  }
  return false
}

function readLiteral(stream: StringStream, state: DbmlState, literal: Literal) {
  if (literal === '/*') {
    const end = stream.string.indexOf('*/', stream.pos)
    if (end < 0) stream.skipToEnd()
    else stream.pos = end + 2
    state.literal = end < 0 ? literal : null
    return 'blockComment'
  }

  state.literal = readQuoted(stream, literal) ? null : literal
  return 'string'
}

function token(stream: StringStream, state: DbmlState): string | null {
  if (stream.sol()) {
    state.lineStart = true
    state.expectType = false
    state.afterDot = false
  }
  if (state.literal) return readLiteral(stream, state, state.literal)
  if (stream.eatSpace()) return null
  if (stream.match('//')) {
    stream.skipToEnd()
    return 'lineComment'
  }
  if (stream.match('/*')) return readLiteral(stream, state, '/*')

  const { lineStart, expectType, afterDot } = state
  state.lineStart = state.expectType = state.afterDot = false

  if (stream.match("'''")) return readLiteral(stream, state, "'''")
  if (stream.match('`')) return readLiteral(stream, state, '`')
  if (stream.eat("'")) {
    readQuoted(stream, "'")
    return 'string'
  }

  if (stream.eat('{')) {
    state.blocks.push(state.pendingBlock ?? 'other')
    state.pendingBlock = null
    state.declarationName = false
    state.lineStart = true
    state.settingsDepth = 0
    return null
  }
  if (stream.eat('}')) {
    state.blocks.pop()
    state.pendingBlock = null
    state.declarationName = false
    state.settingsDepth = 0
    return null
  }
  if (stream.eat('[')) {
    state.settingsDepth++
    return 'squareBracket'
  }
  if (stream.eat(']')) {
    state.settingsDepth = Math.max(0, state.settingsDepth - 1)
    return 'squareBracket'
  }

  if (!state.blocks.length && lineStart) {
    const keyword = stream.match(declaration)
    if (keyword) {
      const name = stream.current().toLowerCase()
      const table = name === 'table' || name === 'tablepartial'
      state.pendingBlock = table ? 'table' : 'other'
      state.declarationName = table || /^(?:tablegroup|enum|project)$/.test(name)
      return 'keyword'
    }
  }

  if (!state.settingsDepth && lineStart && stream.match(/^note(?=\s*:)/i)) return 'keyword'
  const inTable = state.blocks[state.blocks.length - 1] === 'table'
  if (inTable && lineStart && !state.settingsDepth && stream.match(/^(?:indexes|checks)(?=\s*(?:\{|$))/i)) {
    state.pendingBlock = 'other'
    return 'keyword'
  }
  if (state.pendingBlock === 'table' && !state.declarationName && stream.match(/^as\b/i)) {
    state.declarationName = true
    return 'keyword'
  }

  if (stream.match(number)) return 'number'
  if (stream.eat('.')) {
    state.afterDot = true
    return null
  }
  if (stream.match(/^(?:<>|[<>-])/)) return 'operator'

  const quoted = !!stream.eat('"')
  if (quoted) readQuoted(stream, '"')
  else if (state.settingsDepth && !afterDot && stream.match(setting)) return 'annotation'

  if (quoted || stream.match(identifier)) {
    const qualified = !!stream.match(/^\s*\./, false)
    if (state.declarationName) {
      state.declarationName = qualified
      return 'className'
    }
    if (expectType && !state.settingsDepth) {
      stream.match(/^(?:\[\])+/)
      return 'typeName'
    }
    if (qualified) return 'className'
    if (afterDot) return 'propertyName'
    if (lineStart && inTable && !state.settingsDepth) {
      state.expectType = true
      return 'propertyName'
    }
    if (!quoted && /^(?:true|false|null)$/i.test(stream.current())) return 'atom'
    return quoted ? 'propertyName' : null
  }

  stream.next()
  return null
}

const dbmlLanguage = StreamLanguage.define<DbmlState>({
  name: 'dbml',
  startState: () => ({
    blocks: [], pendingBlock: null, declarationName: false, lineStart: true,
    expectType: false, afterDot: false, settingsDepth: 0, literal: null,
  }),
  token,
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
})

const dbmlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'dbml-keyword' },
  { tag: tags.className, class: 'dbml-table' },
  { tag: tags.propertyName, class: 'dbml-field' },
  { tag: tags.typeName, class: 'dbml-type' },
  { tag: [tags.annotation, tags.squareBracket], class: 'dbml-setting' },
  { tag: tags.operator, class: 'dbml-operator' },
  { tag: tags.string, class: 'dbml-string' },
  { tag: [tags.number, tags.atom], class: 'dbml-value' },
  { tag: tags.comment, class: 'dbml-comment' },
], { scope: dbmlLanguage })

export const dbmlSupport = [dbmlLanguage, syntaxHighlighting(dbmlHighlightStyle)]