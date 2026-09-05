import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DiagramState, PersistedDiagramState, ConnectorStyle, NotationStyle, CodeFormat, ThemeMode, EntityRect, DraggingConnectorPoint, CustomConnectorEndpoint, LabelPosition, DraggingLabel } from '../model/types'
import { bibliotecaSchema } from '../model/sampleData'
import { saveModel, AuthError } from '../utils/persist'
import { compileDbml, buildDbmlPatch } from '../utils/dbmlImport'
import { defaultMeta, sanitizeTags, seedMeta } from '../utils/modelMeta'
import { useAuthStore } from './auth'

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

export const useDiagramStore = defineStore('diagram', () => {
  const state = ref<DiagramState>({
    meta: seedMeta(),
    schema: bibliotecaSchema,
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
  })

  // Track which connector is hovered for visual feedback (opacity dimming of other connectors)
  const hoveredConnectorId = ref<string | null>(null)

  // Track connector point being dragged
  const draggingConnectorPoint = ref<DraggingConnectorPoint | null>(null)

  // Track relationship label being dragged
  const draggingLabel = ref<DraggingLabel | null>(null)

  // Auto-save status exposed to the UI
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

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

  // Debounced auto-save — fires 1.5s after the last state mutation
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    state,
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveStatus.value = 'saving'
      saveTimer = setTimeout(async () => {
        try {
          await saveModel('default', state.value)
          saveStatus.value = 'saved'
          setTimeout(() => { saveStatus.value = 'idle' }, 2000)
        } catch (e) {
          // Token revoked/expired elsewhere — back to the login screen
          if (e instanceof AuthError) { useAuthStore().logout(); return }
          saveStatus.value = 'error'
        }
      }, 1500)
    },
    { deep: true },
  )

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
  }
})
