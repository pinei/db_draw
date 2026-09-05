<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import type { ErRelationship, EntityRect, ConnectorStyle, NotationStyle, Cardinality, LogicalCardinality } from '../model/types'
import { getConnectionPoints, snapToEntityEdge, resolveLabelPosition, minMaxLabelPosition, selfLoopPoints } from '../utils/connectionPoints'
import { bezierPath, orthogonalPath, roundedPolylinePath, selfLoopCorners, splitBezierPath, splitOrthogonalPath, splitPolyline, SELF_LOOP_CORNER_RADIUS } from '../utils/connectorPath'

const props = defineProps<{
  relationship: ErRelationship
  fromRect: EntityRect
  toRect: EntityRect
  connectorStyle: ConnectorStyle
  notationStyle: NotationStyle
}>()

const store = useDiagramStore()

// Self-loops use a fixed loop (top edge → right edge) instead of best-pair
// routing, which would degenerate to the same point twice on one rect
const isSelfLoop = computed(() => props.relationship.fromEntityId === props.relationship.toEntityId)

const geometry = computed(() => {
  if (isSelfLoop.value) return selfLoopPoints(props.fromRect)
  const customPoints = store.state.connectorPoints[props.relationship.id]
  return getConnectionPoints(props.fromRect, props.toRect, customPoints)
})

// Self-loops always render as a rounded loop outside the card, in both
// connector styles (a plain bezier between the loop points would sag into
// tall cards; the explicit outside route is provably clear)
const pathData = computed(() => {
  const { source, target } = geometry.value
  if (isSelfLoop.value) {
    return roundedPolylinePath(selfLoopCorners(source, target), SELF_LOOP_CORNER_RADIUS)
  }
  return props.connectorStyle === 'curved'
    ? bezierPath(source, target)
    : orthogonalPath(source, target)
})

// Marker ID convention: {notationPrefix}-{Cardinality}-{end|start}
const ns = computed(() => {
  const prefixes: Record<NotationStyle, string> = { crowsfoot: 'cf', minmax: 'mm', barker: 'bar' }
  return prefixes[props.notationStyle]
})

// Barker notation: each half of the line is styled by its own end's
// optionality (solid = mandatory, dotted = optional)
const isBarker = computed(() => props.notationStyle === 'barker')

const barkerHalves = computed(() => {
  if (!isBarker.value) return null
  const { source, target } = geometry.value
  // Halves are computed on the sharp corners (the junction sits mid-loop with
  // no marker, so the few-px difference to the rounded render is invisible)
  if (isSelfLoop.value) return splitPolyline(selfLoopCorners(source, target))
  return props.connectorStyle === 'curved'
    ? splitBezierPath(source, target)
    : splitOrthogonalPath(source, target)
})

function isBarkerOptional(c: Cardinality | LogicalCardinality): boolean {
  return c === 'ZERO_OR_ONE' || c === 'ZERO_OR_MANY'
}

const barkerFromOptional = computed(() => isBarkerOptional(props.relationship.fromCardinality))
const barkerToOptional = computed(() => isBarkerOptional(props.relationship.toCardinality))

// Min-Max notation: plain line ends, cardinality shown as text near each end
// (MANY is a logical placeholder kept for future use — rendered as bare many)
function cardinalityToMinMax(c: Cardinality | LogicalCardinality): string {
  switch (c) {
    case 'ONE':         return '1'
    case 'MANY':        return '*'
    case 'ONE_OR_MANY': return '1..*'
    case 'ZERO_OR_ONE': return '0..1'
    case 'ZERO_OR_MANY': return '0..*'
  }
}

const minMaxFrom = computed(() => cardinalityToMinMax(props.relationship.fromCardinality))
const minMaxTo   = computed(() => cardinalityToMinMax(props.relationship.toCardinality))

// End annotations: fixed gaps from entity + line, outer side (nearest corner)
const minMaxFromPos = computed(() => minMaxLabelPosition(geometry.value.source, props.fromRect))

const minMaxToPos = computed(() => minMaxLabelPosition(geometry.value.target, props.toRect))

const markerEnd   = computed(() => `url(#${ns.value}-${props.relationship.toCardinality}-end)`)
const markerStart = computed(() => `url(#${ns.value}-${props.relationship.fromCardinality}-start)`)

// Label position: use stored {fraction, perp} if available, otherwise midpoint
// with default offset — or the loop apex for self-loops (the chord midpoint
// would fall inside the entity card)
const labelPos = computed(() => {
  const { source, target } = geometry.value
  const stored = store.state.labelPositions[props.relationship.id]
  if (stored) {
    return resolveLabelPosition(stored, source.point, target.point)
  }
  if (isSelfLoop.value) {
    // Above the loop's top bar (same geometry in both connector styles)
    const corners = selfLoopCorners(source, target)
    return { x: (corners[1].x + corners[2].x) / 2, y: corners[1].y - 8 }
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

// Show drag handles only when this connector is hovered (and not dimmed).
// Self-loops use fixed geometry (custom points don't apply), so no handles.
const showHandles = computed(() => {
  return store.hoveredConnectorId === props.relationship.id && !isSelfLoop.value
})

function onLabelMouseDown(e: MouseEvent) {
  // Self-loop labels sit at a fixed apex — not draggable (dragging one inside
  // the card would leave it behind the entity, unreachable)
  if (isSelfLoop.value) return
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
    <!-- Barker: two halves so each end gets its own solid/dotted style -->
    <template v-if="isBarker && barkerHalves">
      <path
        :d="barkerHalves.first"
        fill="none"
        class="connector-line"
        :class="{ 'barker-optional': barkerFromOptional }"
        :marker-start="markerStart"
      />
      <path
        :d="barkerHalves.second"
        fill="none"
        class="connector-line"
        :class="{ 'barker-optional': barkerToOptional }"
        :marker-end="markerEnd"
      />
    </template>
    <path
      v-else
      :d="pathData"
      fill="none"
      class="connector-line"
      :marker-end="markerEnd"
      :marker-start="markerStart"
    />
    <!-- Min-Max end annotations (rendered before handles so handles stay on top) -->
    <text
      v-if="notationStyle === 'minmax'"
      :x="minMaxFromPos.x"
      :y="minMaxFromPos.y"
      :text-anchor="minMaxFromPos.anchor"
      :dominant-baseline="minMaxFromPos.baseline"
      class="minmax-label"
    >{{ minMaxFrom }}</text>
    <text
      v-if="notationStyle === 'minmax'"
      :x="minMaxToPos.x"
      :y="minMaxToPos.y"
      :text-anchor="minMaxToPos.anchor"
      :dominant-baseline="minMaxToPos.baseline"
      class="minmax-label"
    >{{ minMaxTo }}</text>
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
      :class="{ 'self-loop-label': isSelfLoop }"
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

.minmax-label {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--c-connector-label);
  user-select: none;
  pointer-events: none;
}

.connector-line.barker-optional {
  stroke-dasharray: 1 4;
}

.connector-label:active {
  cursor: grabbing;
}

.self-loop-label,
.self-loop-label:active {
  cursor: default;
}
</style>
