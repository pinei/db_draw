<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import type { ErRelationship, EntityRect, ConnectorStyle, NotationStyle } from '../model/types'
import { getConnectionPoints, snapToEntityEdge, resolveLabelPosition } from '../utils/connectionPoints'
import { bezierPath, orthogonalPath } from '../utils/connectorPath'

const props = defineProps<{
  relationship: ErRelationship
  fromRect: EntityRect
  toRect: EntityRect
  connectorStyle: ConnectorStyle
  notationStyle: NotationStyle
}>()

const store = useDiagramStore()

const geometry = computed(() => {
  const customPoints = store.state.connectorPoints[props.relationship.id]
  return getConnectionPoints(props.fromRect, props.toRect, customPoints)
})

const pathData = computed(() => {
  const { source, target } = geometry.value
  return props.connectorStyle === 'curved'
    ? bezierPath(source, target)
    : orthogonalPath(source, target)
})

// Marker ID convention: {notationPrefix}-{Cardinality}-{end|start}
const ns = computed(() => {
  const prefixes: Record<NotationStyle, string> = { crowsfoot: 'cf', arrow: 'arr', uml: 'uml' }
  return prefixes[props.notationStyle]
})

const markerEnd   = computed(() => `url(#${ns.value}-${props.relationship.toCardinality}-end)`)
const markerStart = computed(() => `url(#${ns.value}-${props.relationship.fromCardinality}-start)`)

// Label position: use stored {fraction, perp} if available, otherwise midpoint with default offset
const labelPos = computed(() => {
  const { source, target } = geometry.value
  const stored = store.state.labelPositions[props.relationship.id]
  if (stored) {
    return resolveLabelPosition(stored, source.point, target.point)
  }
  return {
    x: (source.point.x + target.point.x) / 2,
    y: (source.point.y + target.point.y) / 2 - 6,
  }
})

// Dim this connector if another is hovered
const isDimmed = computed(() => {
  return store.hoveredConnectorId !== null && store.hoveredConnectorId !== props.relationship.id
})

// Show drag handles only when this connector is hovered (and not dimmed)
const showHandles = computed(() => {
  return store.hoveredConnectorId === props.relationship.id
})

function onLabelMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  store.startDraggingLabel(props.relationship.id)
}

function onHandleMouseDown(endpoint: 'from' | 'to', e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  // Capture current snap position as starting point for the drag
  const entityRect = endpoint === 'from' ? props.fromRect : props.toRect
  const entityId = endpoint === 'from' ? props.relationship.fromEntityId : props.relationship.toEntityId
  const point = endpoint === 'from' ? geometry.value.source.point : geometry.value.target.point
  const { side, fraction } = snapToEntityEdge(point, entityRect)
  store.startDraggingConnectorPoint(props.relationship.id, endpoint, { entityId, side, fraction })
}
</script>

<template>
  <g 
    class="er-connector" 
    :class="{ dimmed: isDimmed }"
    @mouseenter="store.setHoveredConnector(relationship.id)"
    @mouseleave="store.clearHoveredConnector()"
  >
    <!-- Wider transparent hit area to ease hover/selection in the future -->
    <path
      :d="pathData"
      fill="none"
      stroke="transparent"
      stroke-width="12"
      class="connector-hitarea"
    />
    <path
      :d="pathData"
      fill="none"
      class="connector-line"
      :marker-end="markerEnd"
      :marker-start="markerStart"
    />
    <!-- Drag handles for connection points (visible on hover) -->
    <circle
      v-if="showHandles"
      :cx="geometry.source.point.x"
      :cy="geometry.source.point.y"
      r="6"
      class="connector-handle"
      @mousedown="onHandleMouseDown('from', $event)"
    />
    <circle
      v-if="showHandles"
      :cx="geometry.target.point.x"
      :cy="geometry.target.point.y"
      r="6"
      class="connector-handle"
      @mousedown="onHandleMouseDown('to', $event)"
    />
    <text
      v-if="relationship.label"
      :x="labelPos.x"
      :y="labelPos.y"
      class="connector-label"
      text-anchor="middle"
      dominant-baseline="auto"
      @mouseenter="store.setHoveredConnector(relationship.id)"
      @mouseleave="store.clearHoveredConnector()"
      @mousedown="onLabelMouseDown"
    >{{ relationship.label }}</text>
  </g>
</template>

<style scoped>
.connector-line {
  stroke: var(--c-connector);
  stroke-width: 1.5;
  transition: stroke 0.15s;
}

.er-connector:hover .connector-line {
  stroke: var(--c-connector-hover);
  stroke-width: 2.5;
}

.connector-label {
  font-size: 11px;
  fill: var(--c-connector-label);
  pointer-events: auto;
  user-select: none;
  cursor: grab;
}

.connector-label:active {
  cursor: grabbing;
}
</style>
