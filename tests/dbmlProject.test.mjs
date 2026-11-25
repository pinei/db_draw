import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useDiagramStore } from '../src/stores/diagram.ts'
import { generateDbml, generateMermaid } from '../src/utils/codePlaceholder.ts'
import { buildDbmlPatch, compileDbml } from '../src/utils/dbmlImport.ts'
import { buildModelSavePayload } from '../src/utils/persist.ts'
import { loadModelJson, mergeModelPatch } from '../server/store.ts'

const project = [
  'Project sample_app {',
  "  database_type: 'PostgreSQL'",
  "  Note: 'Project note'",
  '}',
].join('\n')

const diagramDbml = 'Table users {\n  id int [pk]\n}'

function stateWithEmptySchema() {
  return {
    meta: { id: 'test', name: 'test', description: '', tags: [] },
    schema: { entities: [], relationships: [] },
    entityPositions: {},
    connectorPoints: {},
    labelPositions: {},
    routeOverrides: {},
    layout: {
      connectorStyle: 'curved',
      notationStyle: 'crowsfoot',
      canvasOffset: { x: 0, y: 0 },
      canvasScale: 1,
      codePanelOpen: true,
      sidePanelView: 'code',
      theme: 'system',
    },
  }
}

test('compiles Project-only DBML into typed schema metadata', () => {
  const result = compileDbml(project)
  assert.equal(result.ok, true)
  assert.equal(result.value.tables.length, 0)
  assert.deepEqual(result.value.project, {
    name: 'sample_app',
    databaseType: 'PostgreSQL',
    note: 'Project note',
  })
  assert.equal(compileDbml('').ok, false)
})

test('extracts typed Project correctly when self-references are sanitized', () => {
  const projectAfterSelfRef = [
    'Table users {',
    '  id int [pk]',
    '}',
    'Ref: users.id > users.id',
    project,
  ].join('\n')
  const result = compileDbml(projectAfterSelfRef)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.project, {
    name: 'sample_app',
    databaseType: 'PostgreSQL',
    note: 'Project note',
  })
})

test('patches Project with tables and serializes it from ErSchema', () => {
  const result = compileDbml(`${project}\n${diagramDbml}`)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.project, {
    name: 'sample_app',
    databaseType: 'PostgreSQL',
    note: 'Project note',
  })
  const schema = {
    entities: [{ id: 'users', name: 'users', fields: [{ id: 'id', name: 'id', type: 'INT', isPK: true, isFK: false }] }],
    relationships: [],
  }
  const patch = buildDbmlPatch(schema, result.value)
  assert.deepEqual(patch.schema.project, result.value.project)
  const generated = generateDbml(patch.schema)
  assert.ok(generated.startsWith(`${project}\n\nTable users`))
  assert.deepEqual(compileDbml(generated).value.project, result.value.project)
  assert.equal(generateMermaid(patch.schema).includes('Project'), false)
  assert.equal(generateDbml(schema), generateDbml({ ...schema, project: undefined }))
})

test('serializes escaped and multiline Project notes', () => {
  const schema = {
    entities: [],
    relationships: [],
    project: { name: 'app', databaseType: "PostgreSQL's variant", note: "Owner's DB\nSecond line" },
  }
  const generated = generateDbml(schema)
  const result = compileDbml(generated)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.project, schema.project)
  assert.match(generated, /'''Owner's DB\nSecond line'''/)
})

test('Project-only Apply preserves entities, then Apply without Project clears schema.project', () => {
  setActivePinia(createPinia())
  const store = useDiagramStore()
  const originalEntities = JSON.stringify(store.state.schema.entities)
  const appliedProject = store.applyDbml(project)
  assert.equal(appliedProject.success, true)
  assert.equal(appliedProject.stats.projectChanged, true)
  assert.deepEqual(store.state.schema.project, {
    name: 'sample_app',
    databaseType: 'PostgreSQL',
    note: 'Project note',
  })
  assert.equal(JSON.stringify(store.state.schema.entities), originalEntities)

  const reappliedProject = store.applyDbml(project)
  assert.equal(reappliedProject.success, true)
  assert.equal(reappliedProject.stats.projectChanged, false)

  const appliedMixed = store.applyDbml(`${project}\n${diagramDbml}`)
  assert.equal(appliedMixed.success, true)
  assert.equal(appliedMixed.stats.projectChanged, false)
  assert.deepEqual(store.state.schema.project, {
    name: 'sample_app',
    databaseType: 'PostgreSQL',
    note: 'Project note',
  })

  const appliedTable = store.applyDbml(diagramDbml)
  assert.equal(appliedTable.success, true)
  assert.equal(appliedTable.stats.projectChanged, true)
  assert.equal('project' in store.state.schema, false)
  assert.deepEqual(store.state.schema.entities.map((entity) => entity.name), ['users'])
  store.resetState()
})

test('normal model save persists schema.project and generates matching DBML', () => {
  const state = stateWithEmptySchema()
  state.schema.project = { name: 'sample_app', databaseType: 'PostgreSQL', note: 'Project note' }
  const payload = buildModelSavePayload(state, { schema: true, exports: true })
  assert.deepEqual(payload.schema.project, state.schema.project)
  assert.equal(payload.exports.dbml, project)
  assert.equal(payload.exports.mermaid, 'erDiagram\n')
})

test('server persists Project through the existing schema JSON save path', () => {
  const root = mkdtempSync(join(tmpdir(), 'db-draw-project-'))
  const home = join(root, 'user')
  const modelSchema = {
    entities: [{ id: 'users', name: 'users', fields: [] }],
    relationships: [],
    project: { name: 'sample_app', databaseType: 'PostgreSQL', note: 'Project note' },
  }
  try {
    assert.equal(mergeModelPatch(home, 'default', {
      meta: { id: 'default', name: 'default', description: '', tags: [] },
      schema: modelSchema,
      presentation: { entityPositions: {}, connectorPoints: {}, labelPositions: {}, routeOverrides: {}, layout: {} },
      exports: { dbml: project + '\n\n' + diagramDbml, mermaid: 'erDiagram\n  users' },
    }).ok, true)
    const saved = JSON.parse(loadModelJson(home, 'default'))
    assert.deepEqual(saved.schema.project, modelSchema.project)
    assert.equal(readFileSync(join(home, 'er-models', 'default', 'default.dbml'), 'utf8'), project + '\n\n' + diagramDbml)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
