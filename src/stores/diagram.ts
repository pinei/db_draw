import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DiagramState, PersistedDiagramState, ConnectorStyle, NotationStyle, CodeFormat, ThemeMode, EntityRect, DraggingConnectorPoint, CustomConnectorEndpoint, LabelPosition, DraggingLabel } from '../model/types'
import { bibliotecaSchema } from '../model/sampleData'
import { saveModel, AuthError, listModels, loadModel } from '../utils/persist'
import { compileDbml, buildDbmlPatch } from '../utils/dbmlImport'
import { defaultMeta, sanitizeTags, seedMeta } from '../utils/modelMeta'
import { useAuthStore } from './auth'

const MODEL_KEY = 'dbdraw.model.id'
const MODEL_ID_RE = /^[a-z0-9_-]+$/i

// Entity card dimensions used for initial layout
const ENTITY_WIDTH = 220
const FIELD_HEIGHT = 28
const HEADER_HEIGHT = 36

function estimateHeight(entityId: string): number {
  const entity = bibliotecaSchema.entities.find((e) => e.id === entityId)
  if (!entity) return 120
  return HEADER_HEIGHT + entity.fields.length * FIELD_HEIGHT + 8
}

function rectsOverlap(a: EntityRect, b: EntityRect, pad: number): boolean {
  return (
    a.x < b.x + b.width + pad && b.x < a.x + a.width + pad &&
    a.y < b.y + b.height + pad && b.y < a.y + a.height + pad
  )
}

// Placement for entities created by a DBML import: beside the centroid of
// already-placed neighbors if any, else the first free grid slot. Existing
// positions are never moved — positions is read live so sequential placements
// in one import don't stack on each other.
function placeImportedRect(
  fieldCount: number,
  neighborRects: EntityRect[],
  positions: Record<string, EntityRect>,
): EntityRect {
  const width = ENTITY_WIDTH
  const height = HEADER_HEIGHT + fieldCount * FIELD_HEIGHT + 8
  const fits = (x: number, y: number) =>
    !Object.values(positions).some((e) => rectsOverlap({ x, y, width, height }, e, 40))

  if (neighborRects.length > 0) {
    const cx = neighborRects.reduce((s, r) => s + r.x + r.width / 2, 0) / neighborRects.length
    const cy = neighborRects.reduce((s, r) => s + r.y + r.height / 2, 0) / neighborRects.length
    const spots: Array<[number, number]> = [
      [cx + 40, cy - height / 2], // right of the group
      [cx - width / 2, cy + 120], // below the group
      [cx - width - 40, cy - height / 2], // left of the group
    ]
    for (const [x, y] of spots) {
      const rx = Math.round(x)
      const ry = Math.round(y)
      if (fits(rx, ry)) return { x: rx, y: ry, width, height }
    }
  }
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 80 + col * (ENTITY_WIDTH + 80)
      const y = 80 + row * 260
      if (fits(x, y)) return { x, y, width, height }
    }
  }
  const maxX = Math.max(0, ...Object.values(positions).map((e) => e.x + e.width))
  const maxY = Math.max(0, ...Object.values(positions).map((e) => e.y + e.height))
  return { x: maxX + 100, y: maxY + 100, width, height }
}

// Simple grid layout for the initial positions
function buildInitialPositions(): Record<string, EntityRect> {
  const cols = 3
  const gapX = 80
  const gapY = 80
  const startX = 80
  const startY = 80

  const positions: Record<string, EntityRect> = {}
  bibliotecaSchema.entities.forEach((entity, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const height = estimateHeight(entity.id)

    // Offset even rows slightly for a more natural ER layout feel
    const xOffset = row % 2 === 1 ? (ENTITY_WIDTH + gapX) / 2 : 0

    positions[entity.id] = {
      x: startX + col * (ENTITY_WIDTH + gapX) + xOffset,
      y: startY + row * (180 + gapY),
      width: ENTITY_WIDTH,
      height,
    }
  })
  return positions
}

// Factory for pristine state — deep-clones the sample schema so resets can
// never cross-contaminate the module const (nor leak one user's diagram into
// another user's freshly seeded folder via the in-memory state)
function buildInitialState(): DiagramState {
  return {
    meta: seedMeta(),
    schema: structuredClone(bibliotecaSchema),
    entityPositions: buildInitialPositions(),
    layout: {
      connectorStyle: 'curved',
      notationStyle: 'crowsfoot',
      canvasOffset: { x: 0, y: 0 },
      canvasScale: 1,
      codeFormat: 'dbml',
      codePanelOpen: true,
      theme: 'system',
    },
    connectorPoints: {},
    labelPositions: {},
  }
}

export const useDiagramStore = defineStore('diagram', () => {
  const state = ref<DiagramState>(buildInitialState())

  // Track which connector is hovered for visual feedback (opacity dimming of other connectors)
  const hoveredConnectorId = ref<string | null>(null)

  // Track connector point being dragged
  const draggingConnectorPoint = ref<DraggingConnectorPoint | null>(null)

  // Track relationship label being dragged
  const draggingLabel = ref<DraggingLabel | null>(null)

  // Auto-save status exposed to the UI
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Currently open model (folder name). Session state — not part of the
  // diagram artifact; remembered per browser so reloads reopen the same model.
  const currentModelId = ref('default')

  function setCurrentModelId(id: string) {
    if (!MODEL_ID_RE.test(id)) return
    currentModelId.value = id
    try { localStorage.setItem(MODEL_KEY, id) } catch { /* non-browser */ }
  }

  function restoreCurrentModelId() {
    try {
      const saved = localStorage.getItem(MODEL_KEY)
      if (saved) setCurrentModelId(saved)
    } catch { /* non-browser */ }
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  const entities = computed(() => state.value.schema.entities)
  const relationships = computed(() => state.value.schema.relationships)
  const layout = computed(() => state.value.layout)
  const entityPositions = computed(() => state.value.entityPositions)

  function entityById(id: string) {
    return state.value.schema.entities.find((e) => e.id === id)
  }

  function positionOf(id: string): EntityRect {
    return state.value.entityPositions[id] ?? { x: 0, y: 0, width: ENTITY_WIDTH, height: 120 }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  function moveEntity(id: string, x: number, y: number) {
    const pos = state.value.entityPositions[id]
    if (pos) {
      pos.x = x
      pos.y = y
    }
  }

  function updateEntitySize(id: string, width: number, height: number) {
    const pos = state.value.entityPositions[id]
    if (pos) {
      pos.width = width
      pos.height = height
    }
  }

  function setConnectorStyle(style: ConnectorStyle) {
    state.value.layout.connectorStyle = style
  }

  function setNotationStyle(style: NotationStyle) {
    state.value.layout.notationStyle = style
  }

  function setCanvasOffset(x: number, y: number) {
    state.value.layout.canvasOffset = { x, y }
  }

  function setCanvasScale(scale: number) {
    // Clamp scale between 0.2x and 3x
    state.value.layout.canvasScale = Math.min(3, Math.max(0.2, scale))
  }

  function setCodeFormat(format: CodeFormat) {
    state.value.layout.codeFormat = format
  }

  function toggleCodePanel() {
    state.value.layout.codePanelOpen = !state.value.layout.codePanelOpen
  }

  function setTheme(theme: ThemeMode) {
    state.value.layout.theme = theme
  }

  function setHoveredConnector(id: string) {
    hoveredConnectorId.value = id
  }

  function clearHoveredConnector() {
    hoveredConnectorId.value = null
  }

  function setConnectorPoint(relationshipId: string, endpoint: 'from' | 'to', customEndpoint: CustomConnectorEndpoint | null) {
    if (!state.value.connectorPoints[relationshipId]) {
      state.value.connectorPoints[relationshipId] = {}
    }
    if (endpoint === 'from') {
      state.value.connectorPoints[relationshipId].from = customEndpoint ?? undefined
    } else {
      state.value.connectorPoints[relationshipId].to = customEndpoint ?? undefined
    }
  }

  function startDraggingConnectorPoint(relationshipId: string, endpoint: 'from' | 'to', startPoint: CustomConnectorEndpoint) {
    draggingConnectorPoint.value = {
      relationshipId,
      endpoint,
      startPoint,
    }
  }

  function updateDraggingConnectorPoint(customEndpoint: CustomConnectorEndpoint) {
    if (draggingConnectorPoint.value) {
      setConnectorPoint(draggingConnectorPoint.value.relationshipId, draggingConnectorPoint.value.endpoint, customEndpoint)
    }
  }

  function endDraggingConnectorPoint() {
    draggingConnectorPoint.value = null
  }

  function setLabelPosition(relationshipId: string, pos: LabelPosition | null) {
    if (pos === null) {
      delete state.value.labelPositions[relationshipId]
    } else {
      state.value.labelPositions[relationshipId] = pos
    }
  }

  function startDraggingLabel(relationshipId: string) {
    draggingLabel.value = { relationshipId }
  }

  function endDraggingLabel() {
    draggingLabel.value = null
  }

  // DBML Apply: incremental sync — matched entities/relationships keep their
  // ids (hence positions and connector/label overrides); only the diff moves.
  // Single mutation: all or nothing, one auto-save.
  function applyDbml(text: string): { success: boolean; message: string } {
    const compiled = compileDbml(text)
    if (!compiled.ok) return { success: false, message: compiled.message }
    const patch = buildDbmlPatch(state.value.schema, compiled.value)

    const positions: Record<string, EntityRect> = { ...state.value.entityPositions }
    for (const id of patch.removedEntityIds) delete positions[id]
    for (const id of patch.createdEntityIds) {
      const entity = patch.schema.entities.find((e) => e.id === id)
      const neighborRects = (patch.neighbors[id] ?? [])
        .map((n) => positions[n])
        .filter((r): r is EntityRect => !!r)
      positions[id] = placeImportedRect(entity?.fields.length ?? 0, neighborRects, positions)
    }

    const connectorPoints = { ...state.value.connectorPoints }
    const labelPositions = { ...state.value.labelPositions }
    for (const id of patch.removedRelIds) {
      delete connectorPoints[id]
      delete labelPositions[id]
    }

    state.value.schema = patch.schema
    state.value.entityPositions = positions
    state.value.connectorPoints = connectorPoints
    state.value.labelPositions = labelPositions
    return { success: true, message: patch.summary }
  }

  // Model metadata edits (name/description/tags) — id is the folder name and
  // never changes here. Mutations flow into the debounced auto-save as usual.
  function updateModelMeta(patch: { name?: string; description?: string; tags?: string[] }) {
    if (typeof patch.name === 'string') state.value.meta.name = patch.name.trim()
    if (typeof patch.description === 'string') state.value.meta.description = patch.description.trim()
    if (patch.tags) state.value.meta.tags = sanitizeTags(patch.tags)
  }

  // Drops ALL in-memory diagram data back to pristine defaults. Called on
  // logout so the next login (possibly a different user) can never inherit —
  // and, on a 404 seed, persist — the previous user's diagram.
  function resetState() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    state.value = buildInitialState()
    hoveredConnectorId.value = null
    draggingConnectorPoint.value = null
    draggingLabel.value = null
    saveStatus.value = 'idle'
    currentModelId.value = 'default'
    try { localStorage.removeItem(MODEL_KEY) } catch { /* non-browser */ }
  }

  // Fresh model seed: pristine defaults with this model's identity. Blank
  // models start with an empty canvas (no sample entities).
  function seedFreshModel(id: string, opts: { name?: string; description?: string; tags?: string[]; blank?: boolean } = {}) {
    resetState()
    if (opts.blank) state.value.schema = { entities: [], relationships: [] }
    state.value.meta = {
      id,
      name: opts.name?.trim() || id,
      description: opts.description?.trim() ?? '',
      tags: sanitizeTags(opts.tags),
    }
    setCurrentModelId(id)
  }

  function loadState(loaded: PersistedDiagramState, modelId = 'default') {
    // UI preferences are not part of the diagram artifact — merge them back
    // from the in-memory defaults so a fresh load starts with sane UI state
    // (unknown notationStyle from older artifacts falls back to crowsfoot)
    const validNotations: NotationStyle[] = ['crowsfoot', 'minmax', 'barker']
    // Self-loops use fully derived geometry — drop any stored overrides
    // (stale values would stick labels/handles inside the card, unreachable)
    const labelPositions = { ...loaded.labelPositions }
    const connectorPoints = { ...loaded.connectorPoints }
    for (const rel of loaded.schema.relationships) {
      if (rel.fromEntityId === rel.toEntityId) {
        delete labelPositions[rel.id]
        delete connectorPoints[rel.id]
      }
    }
    state.value = {
      ...loaded,
      meta: defaultMeta(modelId, loaded.meta),
      labelPositions,
      connectorPoints,
      layout: {
        codeFormat: 'dbml',
        codePanelOpen: true,
        theme: 'system',
        ...loaded.layout,
        notationStyle: validNotations.includes(loaded.layout.notationStyle)
          ? loaded.layout.notationStyle
          : 'crowsfoot',
      },
    }
  }

  async function persistCurrent(): Promise<void> {
    await saveModel(currentModelId.value, state.value)
  }

  async function runSave(): Promise<void> {
    saveStatus.value = 'saving'
    try {
      await persistCurrent()
      saveStatus.value = 'saved'
      setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    } catch (e) {
      // Token revoked/expired elsewhere — back to the login screen
      if (e instanceof AuthError) { useAuthStore().logout(); return }
      saveStatus.value = 'error'
    }
  }

  // Immediate save (clears any pending debounce). Switching/creating models
  // awaits this first so no edit is lost in the 1.5s debounce window.
  async function flushSave(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!useAuthStore().isAuthenticated) return
    await runSave()
  }

  // Debounced auto-save — fires 1.5s after the last state mutation
  // (never while logged out: no credentials → the PUT would 401 anyway)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    state,
    () => {
      if (!useAuthStore().isAuthenticated) return
      if (saveTimer) clearTimeout(saveTimer)
      saveStatus.value = 'saving'
      saveTimer = setTimeout(() => { void runSave() }, 1500)
    },
    { deep: true },
  )

  // Open another model (flushes the current one first). Missing remote model
  // (deleted elsewhere) seeds a fresh blank one instead of failing.
  async function openModel(id: string): Promise<{ success: boolean; message?: string }> {
    if (!MODEL_ID_RE.test(id)) return { success: false, message: 'Invalid model id' }
    if (id === currentModelId.value) return { success: true }
    await flushSave()
    try {
      const loaded = await loadModel(id)
      if (loaded) {
        loadState(loaded, id)
        setCurrentModelId(id)
      } else {
        seedFreshModel(id, { blank: true })
        await persistCurrent()
      }
      return { success: true }
    } catch (e) {
      if (e instanceof AuthError) { useAuthStore().logout(); return { success: false, message: 'Invalid session — please sign in again' } }
      return { success: false, message: e instanceof Error ? e.message : 'Failed to open model' }
    }
  }

  async function createModel(
    id: string,
    meta: { name?: string; description?: string; tags?: string[] },
  ): Promise<{ success: boolean; message?: string }> {
    const clean = id.trim().toLowerCase()
    if (!MODEL_ID_RE.test(clean)) {
      return { success: false, message: 'Invalid ID — use letters, numbers, _ or -' }
    }
    try {
      const existing = await listModels()
      if (existing.some((m) => m.id === clean)) {
        return { success: false, message: `Model "${clean}" already exists` }
      }
    } catch (e) {
      if (e instanceof AuthError) { useAuthStore().logout(); return { success: false, message: 'Invalid session — please sign in again' } }
      return { success: false, message: e instanceof Error ? e.message : 'Failed to list models' }
    }
    await flushSave()
    seedFreshModel(clean, { blank: true, ...meta })
    try {
      await persistCurrent()
    } catch (e) {
      if (e instanceof AuthError) { useAuthStore().logout(); return { success: false, message: 'Invalid session — please sign in again' } }
      return { success: false, message: e instanceof Error ? e.message : 'Failed to create model' }
    }
    return { success: true }
  }

  return {
    state,
    entities,
    relationships,
    layout,
    entityPositions,
    entityById,
    positionOf,
    moveEntity,
    updateEntitySize,
    setConnectorStyle,
    setNotationStyle,
    setCanvasOffset,
    setCanvasScale,
    setCodeFormat,
    toggleCodePanel,
    setTheme,
    hoveredConnectorId,
    setHoveredConnector,
    clearHoveredConnector,
    draggingConnectorPoint,
    setConnectorPoint,
    startDraggingConnectorPoint,
    updateDraggingConnectorPoint,
    endDraggingConnectorPoint,
    draggingLabel,
    setLabelPosition,
    startDraggingLabel,
    endDraggingLabel,
    saveStatus,
    loadState,
    applyDbml,
    updateModelMeta,
    resetState,
    currentModelId,
    setCurrentModelId,
    restoreCurrentModelId,
    seedFreshModel,
    openModel,
    createModel,
    flushSave,
  }
})
