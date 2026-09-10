import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DiagramState, PersistedDiagramState, ConnectorStyle, NotationStyle, CodeFormat, ThemeMode, EntityRect, DraggingConnectorPoint, CustomConnectorEndpoint, LabelPosition, DraggingLabel, DraggingRoute, RouteOverride } from '../model/types'
import { bibliotecaSchema } from '../model/sampleData'
import { saveModel, saveModelSlices, anySaveSlice, AuthError, listModels, loadModel, type ModelSaveSlices } from '../utils/persist'
import { compileDbml, buildDbmlPatch, type DbmlApplyStats, type DbmlIssueLine } from '../utils/dbmlImport'
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

// Drop layout overrides that no longer match the schema (e.g. blank models
// seeded before entityPositions were cleared on create).
function pruneOrphanPresentation(state: Pick<DiagramState, 'schema' | 'entityPositions' | 'connectorPoints' | 'labelPositions' | 'routeOverrides'>) {
  const entityIds = new Set(state.schema.entities.map((e) => e.id))
  for (const id of Object.keys(state.entityPositions)) {
    if (!entityIds.has(id)) delete state.entityPositions[id]
  }
  const relIds = new Set(state.schema.relationships.map((r) => r.id))
  for (const id of Object.keys(state.connectorPoints)) {
    if (!relIds.has(id)) delete state.connectorPoints[id]
  }
  for (const id of Object.keys(state.labelPositions)) {
    if (!relIds.has(id)) delete state.labelPositions[id]
  }
  for (const id of Object.keys(state.routeOverrides)) {
    if (!relIds.has(id)) delete state.routeOverrides[id]
  }
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
    routeOverrides: {},
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

  // Track mid-route handle being dragged (orthogonal midOffset / curved bulge)
  const draggingRoute = ref<DraggingRoute | null>(null)

  // Auto-save status exposed to the UI
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Partial-save dirty flags — presentation-only edits skip .dbml/.mermaid
  const dirty = ref<Required<ModelSaveSlices>>({
    meta: false,
    schema: false,
    presentation: false,
    exports: false,
  })
  let suppressDirty = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function clearDirty() {
    dirty.value = { meta: false, schema: false, presentation: false, exports: false }
  }

  function markDirty(slice: keyof ModelSaveSlices) {
    if (suppressDirty || !useAuthStore().isAuthenticated) return
    dirty.value[slice] = true
    if (slice === 'schema') dirty.value.exports = true
    scheduleSave()
  }

  function scheduleSave() {
    if (!useAuthStore().isAuthenticated) return
    if (!anySaveSlice(dirty.value)) return
    if (saveTimer) clearTimeout(saveTimer)
    saveStatus.value = 'saving'
    saveTimer = setTimeout(() => { void runSave() }, 1500)
  }

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
    const drag = draggingConnectorPoint.value
    if (drag) {
      const current = state.value.connectorPoints[drag.relationshipId]?.[drag.endpoint]
      // New edge ⇒ previous mid-route nudge no longer matches the path shape
      if (current && current.side !== drag.startPoint.side) {
        delete state.value.routeOverrides[drag.relationshipId]
      }
    }
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

  function setRouteOverride(
    relationshipId: string,
    style: ConnectorStyle,
    value: number | { along?: number; bulge?: number } | null,
  ) {
    const existing = state.value.routeOverrides[relationshipId] ?? {}
    const next: RouteOverride = { ...existing }
    if (style === 'orthogonal') {
      if (value === null || typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) < 1e-6) {
        delete next.orthogonal
      } else {
        next.orthogonal = { midOffset: Math.max(-3, Math.min(3, value)) }
      }
    } else {
      if (value === null || typeof value === 'number') {
        // number alone is legacy bulge-only; null clears
        if (value === null) {
          delete next.curved
        } else if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
          delete next.curved
        } else {
          next.curved = { along: 0, bulge: Math.max(-3, Math.min(3, value)) }
        }
      } else {
        const along = typeof value.along === 'number' && Number.isFinite(value.along) ? value.along : 0
        const bulge = typeof value.bulge === 'number' && Number.isFinite(value.bulge) ? value.bulge : 0
        const ca = Math.max(-3, Math.min(3, along))
        const cb = Math.max(-3, Math.min(3, bulge))
        if (Math.abs(ca) < 1e-6 && Math.abs(cb) < 1e-6) delete next.curved
        else next.curved = { along: ca, bulge: cb }
      }
    }
    if (!next.orthogonal && !next.curved) {
      delete state.value.routeOverrides[relationshipId]
    } else {
      state.value.routeOverrides[relationshipId] = next
    }
  }

  function startDraggingRoute(relationshipId: string) {
    draggingRoute.value = { relationshipId }
  }

  function endDraggingRoute() {
    draggingRoute.value = null
  }

  // DBML Apply: incremental sync — matched entities/relationships keep their
  // ids (hence positions and connector/label overrides); only the diff moves.
  // Single mutation: all or nothing, one auto-save.
  function applyDbml(
    text: string,
  ):
    | { success: true; stats: DbmlApplyStats }
    | { success: false; message: string; issues: DbmlIssueLine[] } {
    const compiled = compileDbml(text)
    if (!compiled.ok) return { success: false, message: compiled.message, issues: compiled.issues }
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
    const routeOverrides = { ...state.value.routeOverrides }
    for (const id of patch.removedRelIds) {
      delete connectorPoints[id]
      delete labelPositions[id]
      delete routeOverrides[id]
    }

    state.value.schema = patch.schema
    state.value.entityPositions = positions
    state.value.connectorPoints = connectorPoints
    state.value.labelPositions = labelPositions
    state.value.routeOverrides = routeOverrides
    return { success: true, stats: patch.stats }
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
    suppressDirty = true
    state.value = buildInitialState()
    clearDirty()
    suppressDirty = false
    hoveredConnectorId.value = null
    draggingConnectorPoint.value = null
    draggingLabel.value = null
    draggingRoute.value = null
    saveStatus.value = 'idle'
    currentModelId.value = 'default'
    try { localStorage.removeItem(MODEL_KEY) } catch { /* non-browser */ }
  }

  // Fresh model seed: pristine defaults with this model's identity. Blank
  // models start with an empty canvas (no sample entities).
  function seedFreshModel(id: string, opts: { name?: string; description?: string; tags?: string[]; blank?: boolean } = {}) {
    resetState()
    suppressDirty = true
    if (opts.blank) {
      state.value.schema = { entities: [], relationships: [] }
      state.value.entityPositions = {}
      state.value.connectorPoints = {}
      state.value.labelPositions = {}
      state.value.routeOverrides = {}
    }
    state.value.meta = {
      id,
      name: opts.name?.trim() || id,
      description: opts.description?.trim() ?? '',
      tags: sanitizeTags(opts.tags),
    }
    clearDirty()
    suppressDirty = false
    setCurrentModelId(id)
  }

  function loadState(loaded: PersistedDiagramState, modelId = 'default') {
    // UI preferences are not part of the diagram artifact — merge them back
    // from the in-memory defaults so a fresh load starts with sane UI state
    // (unknown notationStyle from older artifacts falls back to crowsfoot)
    const validNotations: NotationStyle[] = ['crowsfoot', 'minmax', 'barker']
    // Self-loops use fully derived geometry — drop any stored overrides
    // (stale values would stick labels/handles inside the card, unreachable)
    const entityPositions = { ...loaded.entityPositions }
    const labelPositions = { ...loaded.labelPositions }
    const connectorPoints = { ...loaded.connectorPoints }
    const routeOverrides = { ...(loaded.routeOverrides ?? {}) }
    for (const rel of loaded.schema.relationships) {
      if (rel.fromEntityId === rel.toEntityId) {
        delete labelPositions[rel.id]
        delete connectorPoints[rel.id]
        delete routeOverrides[rel.id]
      }
    }
    // Backfill curved.along for artifacts saved before along existed
    for (const id of Object.keys(routeOverrides)) {
      const curved = routeOverrides[id]?.curved
      if (curved && typeof curved.along !== 'number') {
        routeOverrides[id] = {
          ...routeOverrides[id],
          curved: { along: 0, bulge: typeof curved.bulge === 'number' ? curved.bulge : 0 },
        }
      }
    }
    pruneOrphanPresentation({ schema: loaded.schema, entityPositions, connectorPoints, labelPositions, routeOverrides })
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    suppressDirty = true
    state.value = {
      ...loaded,
      meta: defaultMeta(modelId, loaded.meta),
      entityPositions,
      labelPositions,
      connectorPoints,
      routeOverrides,
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
    clearDirty()
    suppressDirty = false
    saveStatus.value = 'idle'
  }

  async function persistCurrent(): Promise<void> {
    // Full replace — used for create/seed so all files exist
    clearDirty()
    await saveModel(currentModelId.value, state.value)
  }

  async function runSave(): Promise<void> {
    saveTimer = null
    const slices: ModelSaveSlices = { ...dirty.value }
    if (!anySaveSlice(slices)) {
      saveStatus.value = 'idle'
      return
    }
    // Clear claimed slices before await; re-dirty if edits arrive mid-flight
    for (const key of Object.keys(slices) as (keyof ModelSaveSlices)[]) {
      if (slices[key]) dirty.value[key] = false
    }
    saveStatus.value = 'saving'
    try {
      await saveModelSlices(currentModelId.value, state.value, slices)
      if (anySaveSlice(dirty.value)) {
        scheduleSave()
        return
      }
      saveStatus.value = 'saved'
      setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    } catch (e) {
      for (const key of Object.keys(slices) as (keyof ModelSaveSlices)[]) {
        if (slices[key]) dirty.value[key] = true
      }
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
    if (anySaveSlice(dirty.value)) await runSave()
  }

  // Slice watches — UI prefs (codeFormat/codePanelOpen/theme) do not dirty
  watch(() => state.value.meta, () => markDirty('meta'), { deep: true })
  watch(() => state.value.schema, () => markDirty('schema'), { deep: true })
  watch(
    () => [
      state.value.entityPositions,
      state.value.connectorPoints,
      state.value.labelPositions,
      state.value.routeOverrides,
      state.value.layout.connectorStyle,
      state.value.layout.notationStyle,
      state.value.layout.canvasOffset,
      state.value.layout.canvasScale,
    ],
    () => markDirty('presentation'),
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
    draggingRoute,
    setRouteOverride,
    startDraggingRoute,
    endDraggingRoute,
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
