<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import { snapToEntityEdge, snapToConnector, getConnectionPoints } from '../utils/connectionPoints'
import { curvedNudgeFromPoint, midOffsetFromPoint, orthogonalRouteEditable } from '../utils/connectorPath'
import ErEntity from './ErEntity.vue'
import ErConnector from './ErConnector.vue'
import ConnectorMarker from './ConnectorMarker.vue'

const store = useDiagramStore()
const layout = computed(() => store.layout)

// ─── Pan state ──────────────────────────────────────────────────────────────

const isPanning = ref(false)
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0

function onCanvasMouseDown(evt: MouseEvent) {
  // Only react to primary-button clicks directly on the SVG background
  if (evt.button !== 0) return
  // Entities stop propagation in their own mousedown; if we're here it's canvas
  if (draggingEntityId.value) return
  // Don't pan if a connector point is being dragged
  if (store.draggingConnectorPoint) return
  // Don't pan if a label is being dragged
  if (store.draggingLabel) return
  // Don't pan if a mid-route handle is being dragged
  if (store.draggingRoute) return

  isPanning.value = true
  panStartX = evt.clientX
  panStartY = evt.clientY
  panOriginX = layout.value.canvasOffset.x
  panOriginY = layout.value.canvasOffset.y

  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanEnd)
}

function onPanMove(evt: MouseEvent) {
  if (!isPanning.value) return
  store.setCanvasOffset(
    panOriginX + (evt.clientX - panStartX),
    panOriginY + (evt.clientY - panStartY),
  )
}

function onPanEnd() {
  isPanning.value = false
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}

// ─── Zoom via scroll wheel ───────────────────────────────────────────────────

function onWheel(evt: WheelEvent) {
  evt.preventDefault()
  const delta = evt.deltaY > 0 ? -0.08 : 0.08
  store.setCanvasScale(layout.value.canvasScale + delta)
}

// ─── SVG transform for pan + zoom ───────────────────────────────────────────

const canvasTransform = computed(() => {
  const { x, y } = layout.value.canvasOffset
  const s = layout.value.canvasScale
  return `translate(${x}, ${y}) scale(${s})`
})

// ─── Entity drag — coordinate conversion from screen → model space ──────────

const svgEl = ref<SVGSVGElement | null>(null)
const draggingEntityId = ref<string | null>(null)
let entityDragOffsetX = 0
let entityDragOffsetY = 0

function screenToModel(clientX: number, clientY: number): { x: number; y: number } {
  if (!svgEl.value) return { x: clientX, y: clientY }
  const pt = svgEl.value.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svgEl.value.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  // Convert to SVG viewport space, then undo the canvas group transform
  const svgPt = pt.matrixTransform(ctm.inverse())
  const { x: offX, y: offY } = layout.value.canvasOffset
  const s = layout.value.canvasScale
  return { x: (svgPt.x - offX) / s, y: (svgPt.y - offY) / s }
}

function onEntityDragStart(id: string, evt: MouseEvent) {
  draggingEntityId.value = id
  const rect = store.positionOf(id)
  const pos = screenToModel(evt.clientX, evt.clientY)
  entityDragOffsetX = pos.x - rect.x
  entityDragOffsetY = pos.y - rect.y

  window.addEventListener('mousemove', onEntityDragMove)
  window.addEventListener('mouseup', onEntityDragEnd)
}

function onEntityDragMove(evt: MouseEvent) {
  if (!draggingEntityId.value) return
  const pos = screenToModel(evt.clientX, evt.clientY)
  store.moveEntity(draggingEntityId.value, pos.x - entityDragOffsetX, pos.y - entityDragOffsetY)
}

function onEntityDragEnd() {
  draggingEntityId.value = null
  window.removeEventListener('mousemove', onEntityDragMove)
  window.removeEventListener('mouseup', onEntityDragEnd)
}

function onEntityResize(id: string, width: number, height: number) {
  store.updateEntitySize(id, width, height)
}

// ─── Connector point drag ────────────────────────────────────────────────────

function onConnectorPointDragMove(evt: MouseEvent) {
  const drag = store.draggingConnectorPoint
  if (!drag) return

  const pos = screenToModel(evt.clientX, evt.clientY)

  const rel = store.relationships.find(r => r.id === drag.relationshipId)
  if (!rel) return

  // Snap to the closest edge of the entity that owns this endpoint
  const entityId = drag.endpoint === 'from' ? rel.fromEntityId : rel.toEntityId
  const entity = store.positionOf(entityId)
  const { side, fraction } = snapToEntityEdge(pos, entity)

  store.updateDraggingConnectorPoint({ entityId, side, fraction })
}

function onConnectorPointDragEnd() {
  if (store.draggingConnectorPoint) {
    store.endDraggingConnectorPoint()
  }
}

// ─── Label drag ──────────────────────────────────────────────────────────────────

function onLabelDragMove(evt: MouseEvent) {
  const drag = store.draggingLabel
  if (!drag) return

  const pos = screenToModel(evt.clientX, evt.clientY)
  const rel = store.relationships.find(r => r.id === drag.relationshipId)
  if (!rel) return

  const customPoints = store.state.connectorPoints[drag.relationshipId]
  const { source, target } = getConnectionPoints(
    store.positionOf(rel.fromEntityId),
    store.positionOf(rel.toEntityId),
    customPoints,
  )
  store.setLabelPosition(drag.relationshipId, snapToConnector(pos, source.point, target.point))
}

function onLabelDragEnd() {
  if (store.draggingLabel) {
    store.endDraggingLabel()
  }
}

// ─── Mid-route drag (orthogonal midOffset / curved bulge) ────────────────────

function onRouteDragMove(evt: MouseEvent) {
  const drag = store.draggingRoute
  if (!drag) return

  const pos = screenToModel(evt.clientX, evt.clientY)
  const rel = store.relationships.find(r => r.id === drag.relationshipId)
  if (!rel || rel.fromEntityId === rel.toEntityId) return

  const customPoints = store.state.connectorPoints[drag.relationshipId]
  const { source, target } = getConnectionPoints(
    store.positionOf(rel.fromEntityId),
    store.positionOf(rel.toEntityId),
    customPoints,
  )
  const style = layout.value.connectorStyle
  if (style === 'curved') {
    store.setRouteOverride(drag.relationshipId, style, curvedNudgeFromPoint(source, target, pos))
    return
  }
  if (!orthogonalRouteEditable(source, target)) return
  store.setRouteOverride(drag.relationshipId, style, midOffsetFromPoint(source, target, pos))
}

function onRouteDragEnd() {
  if (store.draggingRoute) {
    store.endDraggingRoute()
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  // Register listeners for connector point dragging (always listen, but only react if dragging)
  window.addEventListener('mousemove', onConnectorPointDragMove)
  window.addEventListener('mouseup', onConnectorPointDragEnd)
  window.addEventListener('mousemove', onLabelDragMove)
  window.addEventListener('mouseup', onLabelDragEnd)
  window.addEventListener('mousemove', onRouteDragMove)
  window.addEventListener('mouseup', onRouteDragEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onConnectorPointDragMove)
  window.removeEventListener('mouseup', onConnectorPointDragEnd)
  window.removeEventListener('mousemove', onLabelDragMove)
  window.removeEventListener('mouseup', onLabelDragEnd)
  window.removeEventListener('mousemove', onRouteDragMove)
  window.removeEventListener('mouseup', onRouteDragEnd)
})
</script>

<template>
  <svg
    ref="svgEl"
    class="diagram-canvas"
    :class="{ panning: isPanning }"
    @mousedown="onCanvasMouseDown"
    @wheel.prevent="onWheel"
  >
    <!-- SVG marker defs must live inside the root SVG element -->
    <ConnectorMarker :notation-style="layout.notationStyle" />

    <g :transform="canvasTransform">
      <!-- Connectors rendered first so entity cards appear on top -->
      <ErConnector
        v-for="rel in store.relationships"
        :key="rel.id"
        :relationship="rel"
        :from-rect="store.positionOf(rel.fromEntityId)"
        :to-rect="store.positionOf(rel.toEntityId)"
        :connector-style="layout.connectorStyle"
        :notation-style="layout.notationStyle"
      />

      <ErEntity
        v-for="entity in store.entities"
        :key="entity.id"
        :entity="entity"
        :rect="store.positionOf(entity.id)"
        :dragging="draggingEntityId === entity.id"
        @dragstart="onEntityDragStart"
        @resize="onEntityResize"
      />
    </g>
  </svg>
</template>

<style scoped>
.diagram-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--c-canvas-bg);
  cursor: default;
}

.diagram-canvas.panning {
  cursor: grabbing;
}
</style>
