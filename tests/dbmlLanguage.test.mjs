import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, highlightingFor } from '@codemirror/language'
import { highlightTree } from '@lezer/highlight'
import { dbmlSupport } from '../src/utils/dbmlLanguage.ts'

function editorState(doc) {
  return EditorState.create({ doc, extensions: dbmlSupport })
}

function expectHighlight(state, text, kind) {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000)
  assert.ok(tree)
  let found = false
  const highlighter = { style: (tags) => highlightingFor(state, tags, tree.type) }
  highlightTree(tree, highlighter, (from, to, className) => {
    if (state.sliceDoc(from, to) === text && className === `dbml-${kind}`) found = true
  })
  assert.ok(found, `Expected ${JSON.stringify(text)} as ${kind}`)
}

test('highlights table fields, custom types, notes and inline references in the draft', () => {
  const state = editorState([
    'Table sales."New Orders" as orders {',
    '  amount projected_total(12,2) [not null, default: -1.5]',
    '  ledger_id int [ref: > unique.id]',
    "  Note: 'https://example.test/it\\'s' // inline comment",
    '  broken text [note: "unfinished',
    '}',
    'Ref: orders.amount <> ledger.total',
  ].join('\n'))

  for (const [text, kind] of [
    ['Table', 'keyword'], ['"New Orders"', 'table'], ['as', 'keyword'], ['orders', 'table'],
    ['amount', 'field'], ['projected_total', 'type'], ['12', 'value'],
    ['not null', 'setting'], ['-1.5', 'value'], ['unique', 'table'], ['id', 'field'],
    ["'https://example.test/it\\'s'", 'string'], ['// inline comment', 'comment'], ['<>', 'operator'],
  ]) expectHighlight(state, text, kind)
})

test('keeps multiline literals and comments intact and retokenizes following lines after edits', () => {
  const text = [
    "Note: '''start",
    'Table is still text',
    "'''",
    '/* open',
    'Table ledger { total STRING }',
  ].join('\n')
  const state = editorState(text)
  expectHighlight(state, 'Table is still text', 'string')
  expectHighlight(state, 'Table ledger { total STRING }', 'comment')

  const closed = state.update({ changes: { from: state.doc.line(4).to, insert: ' */' } }).state
  expectHighlight(closed, 'ledger', 'table')
  expectHighlight(closed, 'STRING', 'type')
})

test('highlights indexes and resumes column highlighting outside the index block', () => {
  const state = editorState([
    'Table orders {',
    '  order_id bigint [pk]',
    '  indexes {',
    '    (order_id, status) [unique]',
    '  }',
    '  status STRING',
    '}',
    'Ref: orders.status > statuses.code',
  ].join('\n'))
  expectHighlight(state, 'indexes', 'keyword')
  expectHighlight(state, 'unique', 'setting')
  expectHighlight(state, 'STRING', 'type')
  expectHighlight(state, 'pk', 'setting')
  expectHighlight(state, 'Ref', 'keyword')
})