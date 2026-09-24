import { defineStore } from 'pinia'
import { ref, computed, toRaw, watch } from 'vue'
import type { DiagramState, ErScope, PersistedDiagramState, ConnectorStyle, NotationStyle, SidePanelView, ThemeMode, EntityRect, CustomConnectionPoints, DraggingConnectorPoint, CustomConnectorEndpoint, LabelPosition, DraggingLabel, DraggingRoute, RouteOverride, SelfLoopCorner, SelfLoopRouteOverride } from '../model/types'
import { bibliotecaSchema } from '../model/sampleData'
import {
  SELF_LOOP_DEFAULT_EXTENT,
  SELF_LOOP_MAX_EXTENT,
  SELF_LOOP_MIN_EXTENT,
} from '../utils/connectorPath'
import { pickFreeSelfLoopCorner } from '../utils/connectionPoints'
import { saveModel, saveModelSlices, anySaveSlice, AuthError, listModels, loadModel, listScopes, saveScope, deleteScope as deleteScopeFile, type ModelSaveSlices } from '../utils/persist'
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
      codePanelOpen: true,
      sidePanelView: 'code',
      theme: 'system',
    },
    connectorPoints: {},
    labelPositions: {},
    routeOverrides: {},
    scopes: {},
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
    if (!anySaveSlice(dirty.value) && dirtyScopeIds.value.size === 0) return
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

  // ─── Scopes ──────────────────────────────────────────────────────────────
  // Session-active scope (null = full model). Reads/writes below resolve
  // through the scope when one is active, so the canvas needs no branches.

  const activeScopeId = ref<string | null>(null)
  const dirtyScopeIds = ref<Set<string>>(new Set())

  const activeScope = computed((): ErScope | null => {
    const id = activeScopeId.value
    return id ? state.value.scopes[id] ?? null : null
  })

  const visibleEntities = computed(() => {
    const scope = activeScope.value
    if (!scope) return state.value.schema.entities
    const included = new Set(scope.entityIds)
    return state.value.schema.entities.filter((e) => included.has(e.id))
  })

  const visibleRelationships = computed(() => {
    const scope = activeScope.value
    if (!scope) return state.value.schema.relationships
    const included = new Set(scope.entityIds)
    return state.value.schema.relationships.filter(
      (r) => included.has(r.fromEntityId) && included.has(r.toEntityId),
    )
  })

  /** Override maps in effect: the scope's when active, else the globals. */
  function overrideTarget() {
    return activeScope.value ?? state.value
  }

  function markScopeDirty(id: string) {
    if (suppressDirty || !useAuthStore().isAuthenticated) return
    dirtyScopeIds.value.add(id)
    scheduleSave()
  }

  function connectorPointsOf(relationshipId: string): CustomConnectionPoints | undefined {
    return overrideTarget().connectorPoints[relationshipId]
  }

  function labelPositionOf(relationshipId: string): LabelPosition | undefined {
    return overrideTarget().labelPositions[relationshipId]
  }

  function routeOverrideOf(relationshipId: string): RouteOverride | undefined {
    return overrideTarget().routeOverrides[relationshipId]
  }

  function entityById(id: string) {
    return state.value.schema.entities.find((e) => e.id === id)
  }

  function positionOf(id: string): EntityRect {
    return activeScope.value?.positions[id]
      ?? state.value.entityPositions[id]
      ?? { x: 0, y: 0, width: ENTITY_WIDTH, height: 120 }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  function moveEntity(id: string, x: number, y: number) {
    const scope = activeScope.value
    const pos = (scope && scope.entityIds.includes(id) ? scope.positions[id] : undefined)
      ?? state.value.entityPositions[id]
    if (pos) {
      pos.x = x
      pos.y = y
    }
    if (scope && scope.positions[id]) markScopeDirty(scope.id)
  }

  function updateEntitySize(id: string, width: number, height: number) {
    const scope = activeScope.value
    const pos = (scope && scope.entityIds.includes(id) ? scope.positions[id] : undefined)
      ?? state.value.entityPositions[id]
    if (pos) {
      pos.width = width
      pos.height = height
    }
    if (scope && scope.positions[id]) markScopeDirty(scope.id)
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

  /** Reset zoom to 1x and center the visible content in the viewport.
   * Centers the scope when one is active, else the full model. The docked
   * side panel overlays the canvas, so the center is measured on the area
   * right of it (full content width when collapsed to the icon rail). */
  function resetCanvasView() {
    const entities = activeScope.value
      ? state.value.schema.entities.filter((e) => activeScope.value?.entityIds.includes(e.id))
      : state.value.schema.entities
    state.value.layout.canvasScale = 1
    if (entities.length === 0) {
      state.value.layout.canvasOffset = { x: 0, y: 0 }
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const e of entities) {
      const r = activeScope.value?.positions[e.id] ?? state.value.entityPositions[e.id]
      if (!r) continue
      minX = Math.min(minX, r.x)
      minY = Math.min(minY, r.y)
      maxX = Math.max(maxX, r.x + r.width)
      maxY = Math.max(maxY, r.y + r.height)
    }
    if (!Number.isFinite(minX)) {
      state.value.layout.canvasOffset = { x: 0, y: 0 }
      return
    }
    const dock = state.value.layout.codePanelOpen ? sidePanelWidth.value : 48
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    state.value.layout.canvasOffset = {
      x: dock + (viewW - dock) / 2 - (minX + maxX) / 2,
      y: viewH / 2 - (minY + maxY) / 2,
    }
  }

  function toggleCodePanel() {
    state.value.layout.codePanelOpen = !state.value.layout.codePanelOpen
  }

  function setSidePanelView(view: SidePanelView) {
    state.value.layout.sidePanelView = view
    // Selecting a rail icon always expands the panel
    state.value.layout.codePanelOpen = true
  }

  // Live dock width (px) for layout consumers (e.g. ModelBar offset).
  // In-memory only — persistence flows through auth.codePanelSize.
  const sidePanelWidth = ref(280)

  function setSidePanelWidth(width: number) {
    sidePanelWidth.value = width
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
    const scope = activeScope.value
    const maps = scope ?? state.value
    if (!maps.connectorPoints[relationshipId]) {
      maps.connectorPoints[relationshipId] = {}
    }
    if (endpoint === 'from') {
      maps.connectorPoints[relationshipId].from = customEndpoint ?? undefined
    } else {
      maps.connectorPoints[relationshipId].to = customEndpoint ?? undefined
    }
    if (scope) markScopeDirty(scope.id)
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
    const scope = activeScope.value
    const maps = scope ?? state.value
    if (pos === null) {
      delete maps.labelPositions[relationshipId]
    } else {
      maps.labelPositions[relationshipId] = pos
    }
    if (scope) markScopeDirty(scope.id)
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
    const existing = routeOverrideOf(relationshipId) ?? {}
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
    writeRouteOverride(relationshipId, next)
  }

  /** Self-loop corner + extent. Shared across Curved/Orthogonal. null → defaults. */
  function setSelfLoopRoute(
    relationshipId: string,
    value: { corner?: SelfLoopCorner; extent?: number } | null,
  ) {
    const existing = routeOverrideOf(relationshipId) ?? {}
    const next: RouteOverride = { ...existing }
    if (value === null) {
      delete next.selfLoop
      writeRouteOverride(relationshipId, next)
      return
    }
    const prev = existing.selfLoop ?? {}
    const corner = value.corner ?? prev.corner ?? 'ne'
    const extentRaw = value.extent !== undefined ? value.extent : prev.extent
    const extent = typeof extentRaw === 'number' && Number.isFinite(extentRaw)
      ? Math.max(SELF_LOOP_MIN_EXTENT, Math.min(SELF_LOOP_MAX_EXTENT, extentRaw))
      : SELF_LOOP_DEFAULT_EXTENT

    const atDefaultCorner = corner === 'ne'
    const atDefaultExtent = Math.abs(extent - SELF_LOOP_DEFAULT_EXTENT) < 0.5
    if (atDefaultCorner && atDefaultExtent) {
      delete next.selfLoop
    } else {
      const selfLoop: SelfLoopRouteOverride = {}
      if (!atDefaultCorner) selfLoop.corner = corner
      if (!atDefaultExtent) selfLoop.extent = extent
      next.selfLoop = selfLoop
    }
    writeRouteOverride(relationshipId, next)
  }

  function writeRouteOverride(relationshipId: string, next: RouteOverride) {
    const scope = activeScope.value
    const maps = scope ?? state.value
    if (!next.orthogonal && !next.curved && !next.selfLoop) {
      delete maps.routeOverrides[relationshipId]
    } else {
      maps.routeOverrides[relationshipId] = next
    }
    if (scope) markScopeDirty(scope.id)
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

    // New self-loops get an unused corner on their entity (NE→SE→SW→NW)
    const createdSelfLoops = patch.createdRelIds.filter((id) => {
      const r = patch.schema.relationships.find((x) => x.id === id)
      return r && r.fromEntityId === r.toEntityId
    })
    for (const id of createdSelfLoops) {
      if (routeOverrides[id]?.selfLoop?.corner) continue
      const rel = patch.schema.relationships.find((x) => x.id === id)!
      const entityId = rel.fromEntityId
      const used: SelfLoopCorner[] = []
      for (const r of patch.schema.relationships) {
        if (r.id === id) continue
        if (r.fromEntityId !== entityId || r.toEntityId !== entityId) continue
        // Earlier new loops in this Apply already wrote their corner into routeOverrides
        used.push(routeOverrides[r.id]?.selfLoop?.corner ?? 'ne')
      }
      const corner = pickFreeSelfLoopCorner(used)
      if (corner === 'ne') continue
      const prev = routeOverrides[id] ?? {}
      routeOverrides[id] = {
        ...prev,
        selfLoop: { ...prev.selfLoop, corner },
      }
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

  /** Drop checklist entries + rects of entities that no longer exist. */
  function purgeScopesOfDeletedEntities() {
    const alive = new Set(state.value.schema.entities.map((e) => e.id))
    for (const scope of Object.values(state.value.scopes)) {
      const before = scope.entityIds.length
      scope.entityIds = scope.entityIds.filter((id) => alive.has(id))
      for (const id of Object.keys(scope.positions)) {
        if (!alive.has(id)) delete scope.positions[id]
      }
      if (scope.entityIds.length !== before) markScopeDirty(scope.id)
    }
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
    dirtyScopeIds.value.clear()
    suppressDirty = false
    activeScopeId.value = null
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
    // Self-loops: fixed endpoints + undraggable labels — drop stale point/label
    // overrides. Keep selfLoop.corner + extent; ignore curved/ortho on loops.
    const entityPositions = { ...loaded.entityPositions }
    const labelPositions = { ...loaded.labelPositions }
    const connectorPoints = { ...loaded.connectorPoints }
    const routeOverrides = { ...(loaded.routeOverrides ?? {}) }
    for (const rel of loaded.schema.relationships) {
      if (rel.fromEntityId === rel.toEntityId) {
        delete labelPositions[rel.id]
        delete connectorPoints[rel.id]
        const kept = routeOverrides[rel.id]?.selfLoop
        if (!kept) {
          delete routeOverrides[rel.id]
          continue
        }
        const selfLoop: SelfLoopRouteOverride = {}
        if (kept.corner === 'ne' || kept.corner === 'se' || kept.corner === 'sw' || kept.corner === 'nw') {
          if (kept.corner !== 'ne') selfLoop.corner = kept.corner
        }
        if (typeof kept.extent === 'number' && Number.isFinite(kept.extent)) {
          const e = Math.max(SELF_LOOP_MIN_EXTENT, Math.min(SELF_LOOP_MAX_EXTENT, kept.extent))
          if (Math.abs(e - SELF_LOOP_DEFAULT_EXTENT) >= 0.5) selfLoop.extent = e
        }
        if (selfLoop.corner || selfLoop.extent !== undefined) {
          routeOverrides[rel.id] = { selfLoop }
        } else {
          delete routeOverrides[rel.id]
        }
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
      // Scopes live in their own files — the artifact never carries them.
      // Callers fetch via refreshScopes() after load.
      scopes: {},
      layout: {
        codePanelOpen: true,
        sidePanelView: 'code',
        theme: 'system',
        ...loaded.layout,
        notationStyle: validNotations.includes(loaded.layout.notationStyle)
          ? loaded.layout.notationStyle
          : 'crowsfoot',
      },
    }
    clearDirty()
    dirtyScopeIds.value.clear()
    suppressDirty = false
    activeScopeId.value = null
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
    const scopeIds = [...dirtyScopeIds.value]
    if (!anySaveSlice(slices) && scopeIds.length === 0) {
      saveStatus.value = 'idle'
      return
    }
    // Clear claimed work before await; re-dirty if edits arrive mid-flight
    for (const key of Object.keys(slices) as (keyof ModelSaveSlices)[]) {
      if (slices[key]) dirty.value[key] = false
    }
    for (const id of scopeIds) dirtyScopeIds.value.delete(id)
    saveStatus.value = 'saving'
    try {
      if (anySaveSlice(slices)) {
        await saveModelSlices(currentModelId.value, state.value, slices)
      }
      for (const id of scopeIds) {
        const scope = state.value.scopes[id]
        if (scope) await saveScope(currentModelId.value, scope)
      }
      if (anySaveSlice(dirty.value) || dirtyScopeIds.value.size > 0) {
        scheduleSave()
        return
      }
      saveStatus.value = 'saved'
      setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    } catch (e) {
      for (const key of Object.keys(slices) as (keyof ModelSaveSlices)[]) {
        if (slices[key]) dirty.value[key] = true
      }
      for (const id of scopeIds) dirtyScopeIds.value.add(id)
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
    if (anySaveSlice(dirty.value) || dirtyScopeIds.value.size > 0) await runSave()
  }

  // Slice watches — UI prefs (codePanelOpen/sidePanelView/theme) do not dirty
  watch(() => state.value.meta, () => markDirty('meta'), { deep: true })
  watch(() => state.value.schema, () => {
    purgeScopesOfDeletedEntities()
    markDirty('schema')
  }, { deep: true })
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

  // ─── Scope CRUD (files of their own; option-B connector snapshot) ──────────

  function slugScopeId(name: string): string {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/^[_-]+|[_-]+$/g, '') || 'scope'
    let id = base
    for (let n = 2; state.value.scopes[id]; n++) id = `${base}_${n}`
    return id
  }

  function setActiveScope(id: string | null) {
    activeScopeId.value = id && state.value.scopes[id] ? id : null
  }

  /** Reload scopes from the server (called after model open/load). */
  async function refreshScopes(): Promise<void> {
    const list = await listScopes(currentModelId.value)
    const next: Record<string, ErScope> = {}
    for (const s of list) next[s.id] = s
    suppressDirty = true
    state.value.scopes = next
    dirtyScopeIds.value.clear()
    suppressDirty = false
    if (activeScopeId.value && !next[activeScopeId.value]) activeScopeId.value = null
  }

  async function createScope(name: string): Promise<{ success: boolean; message?: string; scope?: ErScope }> {
    const clean = name.trim()
    if (!clean) return { success: false, message: 'Scope name required' }
    const id = slugScopeId(clean)
    const scope: ErScope = {
      id,
      name: clean,
      entityIds: [],
      positions: {},
      // Option B: snapshot of the current global overrides at creation.
      // Diverges silently afterwards — by design, documented in ScopeView.
      // toRaw: structuredClone rejects Pinia's reactive proxies.
      connectorPoints: structuredClone(toRaw(state.value.connectorPoints)),
      labelPositions: structuredClone(toRaw(state.value.labelPositions)),
      routeOverrides: structuredClone(toRaw(state.value.routeOverrides)),
    }
    state.value.scopes[id] = scope
    activeScopeId.value = id
    try {
      await saveScope(currentModelId.value, scope)
    } catch (e) {
      markScopeDirty(id)
      if (e instanceof AuthError) { useAuthStore().logout(); return { success: false, message: 'Invalid session — please sign in again' } }
      return { success: false, message: e instanceof Error ? e.message : 'Failed to save scope' }
    }
    return { success: true, scope }
  }

  async function renameScope(id: string, name: string): Promise<{ success: boolean; message?: string }> {
    const scope = state.value.scopes[id]
    const clean = name.trim()
    if (!scope) return { success: false, message: 'Scope not found' }
    if (!clean) return { success: false, message: 'Scope name required' }
    if (clean === scope.name) return { success: true }
    scope.name = clean
    markScopeDirty(id)
    return { success: true }
  }

  async function deleteScope(id: string): Promise<{ success: boolean; message?: string }> {
    if (!state.value.scopes[id]) return { success: false, message: 'Scope not found' }
    try {
      await deleteScopeFile(currentModelId.value, id)
    } catch (e) {
      if (e instanceof AuthError) { useAuthStore().logout(); return { success: false, message: 'Invalid session — please sign in again' } }
      return { success: false, message: e instanceof Error ? e.message : 'Failed to delete scope' }
    }
    delete state.value.scopes[id]
    dirtyScopeIds.value.delete(id)
    if (activeScopeId.value === id) activeScopeId.value = null
    return { success: true }
  }

  /** Checklist toggle: check copies the rect from the main diagram. */
  function toggleScopeEntity(scopeId: string, entityId: string) {
    const scope = state.value.scopes[scopeId]
    if (!scope || !entityById(entityId)) return
    const at = scope.entityIds.indexOf(entityId)
    if (at >= 0) {
      scope.entityIds.splice(at, 1)
      delete scope.positions[entityId]
    } else {
      scope.entityIds.push(entityId)
      const rect = state.value.entityPositions[entityId]
      if (rect) scope.positions[entityId] = { ...rect }
    }
    markScopeDirty(scopeId)
  }

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
        await refreshScopes()
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
    resetCanvasView,
    toggleCodePanel,
    setSidePanelView,
    sidePanelWidth,
    setSidePanelWidth,
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
    setSelfLoopRoute,
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
    activeScopeId,
    activeScope,
    dirtyScopeIds,
    visibleEntities,
    visibleRelationships,
    connectorPointsOf,
    labelPositionOf,
    routeOverrideOf,
    setActiveScope,
    refreshScopes,
    createScope,
    renameScope,
    deleteScope,
    toggleScopeEntity,
  }
})
