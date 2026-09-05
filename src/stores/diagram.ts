import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DiagramState, ConnectorStyle, NotationStyle, CodeFormat, ThemeMode, EntityRect, DraggingConnectorPoint, CustomConnectorEndpoint, LabelPosition, DraggingLabel } from '../model/types'
import { bibliotecaSchema } from '../model/sampleData'
import { saveModel } from '../utils/persist'

// Entity card dimensions used for initial layout
const ENTITY_WIDTH = 220
const FIELD_HEIGHT = 28
const HEADER_HEIGHT = 36

function estimateHeight(entityId: string): number {
  const entity = bibliotecaSchema.entities.find((e) => e.id === entityId)
  if (!entity) return 120
  return HEADER_HEIGHT + entity.fields.length * FIELD_HEIGHT + 8
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

  function loadState(loaded: DiagramState) {
    state.value = loaded
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
        } catch {
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
  }
})
