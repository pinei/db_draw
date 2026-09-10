<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import type {
  ErRelationship,
  EntityRect,
  ConnectorStyle,
  NotationStyle,
  Cardinality,
  LogicalCardinality,
  SelfLoopCorner,
  ConnectionPoint,
} from '../model/types'
import { getConnectionPoints, snapToConnector, snapToEntityEdge, resolveLabelPosition, minMaxLabelPosition, selfLoopPoints } from '../utils/connectionPoints'
import {
  bezierPath,
  orthogonalPath,
  polylinePath,
  roundedPolylinePath,
  selfLoopCorners,
  selfLoopLabelPoint,
  selfLoopLabelPositionFromPoint,
  selfLoopHandlePoint,
  splitBezierPath,
  splitOrthogonalPath,
  splitPolyline,
  splitRoundedPolyline,
  bezierHandlePoint,
  orthogonalHandlePoint,
  orthogonalRouteEditable,
  SELF_LOOP_CORNER_RADIUS,
  SELF_LOOP_DEFAULT_EXTENT,
} from '../utils/connectorPath'

const props = defineProps<{
  relationship: ErRelationship
  fromRect: EntityRect
  toRect: EntityRect
  connectorStyle: ConnectorStyle
  notationStyle: NotationStyle
}>()

const store = useDiagramStore()

// Self-loops use a corner slot (default NE) instead of best-pair routing
const isSelfLoop = computed(() => props.relationship.fromEntityId === props.relationship.toEntityId)

const selfLoopCorner = computed((): SelfLoopCorner =>
  store.state.routeOverrides[props.relationship.id]?.selfLoop?.corner ?? 'ne',
)

const selfLoopExtent = computed(() =>
  store.state.routeOverrides[props.relationship.id]?.selfLoop?.extent ?? SELF_LOOP_DEFAULT_EXTENT,
)

const geometry = computed(() => {
  if (isSelfLoop.value) return selfLoopPoints(props.fromRect, selfLoopCorner.value)
  const customPoints = store.state.connectorPoints[props.relationship.id]
  return getConnectionPoints(props.fromRect, props.toRect, customPoints)
})

const midOffset = computed(() =>
  store.state.routeOverrides[props.relationship.id]?.orthogonal?.midOffset ?? 0,
)

const curvedNudge = computed(() => {
  const c = store.state.routeOverrides[props.relationship.id]?.curved
  return {
    along: c?.along ?? 0,
    bulge: c?.bulge ?? 0,
  }
})

// Self-loops use an explicit outside route (a plain bezier between the loop
// points would sag into tall cards). Curved → rounded corners; Orthogonal →
// sharp 90° — same style switch as normal connectors, independent of notation.
const pathData = computed(() => {
  const { source, target } = geometry.value
  if (isSelfLoop.value) {
    const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
    return props.connectorStyle === 'curved'
      ? roundedPolylinePath(corners, SELF_LOOP_CORNER_RADIUS)
      : polylinePath(corners)
  }
  return props.connectorStyle === 'curved'
    ? bezierPath(source, target, curvedNudge.value)
    : orthogonalPath(source, target, midOffset.value)
})

const routeHandle = computed(() => {
  const { source, target } = geometry.value
  if (isSelfLoop.value) {
    return selfLoopHandlePoint(source, target, selfLoopExtent.value, selfLoopCorner.value)
  }
  if (props.connectorStyle === 'curved') {
    return bezierHandlePoint(source, target, curvedNudge.value)
  }
  if (!orthogonalRouteEditable(source, target)) return null
  return orthogonalHandlePoint(source, target, midOffset.value)
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
  if (isSelfLoop.value) {
    const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
    return props.connectorStyle === 'curved'
      ? splitRoundedPolyline(corners, SELF_LOOP_CORNER_RADIUS)
      : splitPolyline(corners)
  }
  return props.connectorStyle === 'curved'
    ? splitBezierPath(source, target, curvedNudge.value)
    : splitOrthogonalPath(source, target, midOffset.value)
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

const markerEnd = computed(() => {
  const base = `${ns.value}-${props.relationship.toCardinality}-end`
  // Curved: fix orient to the entity edge so mid-route nudges don't tilt glyphs
  if (props.connectorStyle === 'curved' && !isSelfLoop.value) {
    return `url(#${base}-${geometry.value.target.side})`
  }
  return `url(#${base})`
})
const markerStart = computed(() => {
  const base = `${ns.value}-${props.relationship.fromCardinality}-start`
  if (props.connectorStyle === 'curved' && !isSelfLoop.value) {
    return `url(#${base}-${geometry.value.source.side})`
  }
  return `url(#${base})`
})

function selfLoopLabelPos(
  source: ConnectionPoint,
  target: ConnectionPoint,
): { x: number; y: number } {
  const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
  const mx = (corners[1].x + corners[2].x) / 2
  const my = (corners[1].y + corners[2].y) / 2
  switch (selfLoopCorner.value) {
    case 'ne': return { x: mx, y: my - 8 }
    case 'se': return { x: mx + 8, y: my }
    case 'sw': return { x: mx, y: my + 8 }
    case 'nw': return { x: mx - 8, y: my }
  }
}

// Label position: use stored {fraction, perp} if available, otherwise midpoint
// with default offset — or outside the loop for self-loops (chord midpoint
// would fall inside the entity card)
const labelPos = computed(() => {
  const { source, target } = geometry.value
  const stored = store.state.labelPositions[props.relationship.id]
  if (stored) {
    if (isSelfLoop.value && stored.selfLoop) {
      const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
      return selfLoopLabelPoint(corners, selfLoopCorner.value, stored.selfLoop)
    }
    if (isSelfLoop.value) {
      const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
      const legacyPoint = resolveLabelPosition(stored, source.point, target.point)
      const migrated = selfLoopLabelPositionFromPoint(corners, selfLoopCorner.value, legacyPoint)
      return selfLoopLabelPoint(corners, selfLoopCorner.value, migrated)
    }
    return resolveLabelPosition(stored, source.point, target.point)
  }
  if (isSelfLoop.value) {
    return selfLoopLabelPos(source, target)
  }
  return {
    x: (source.point.x + target.point.x) / 2,
    y: (source.point.y + target.point.y) / 2 - 6,
  }
})

const labelAnchor = computed(() => {
  if (!isSelfLoop.value) return 'middle'
  if (selfLoopCorner.value === 'se') return 'start'
  if (selfLoopCorner.value === 'nw') return 'end'
  return 'middle'
})

// Dim this connector if another is hovered
const isDimmed = computed(() => {
  return store.hoveredConnectorId !== null && store.hoveredConnectorId !== props.relationship.id
})

// Endpoint handles: not for self-loops (fixed geometry). Mid-route handle
// works for both — self-loops scale outward extent / corner; others nudge mid.
const routeInteraction = computed(() => {
  if (store.draggingRoute?.relationshipId === props.relationship.id) return true
  return store.hoveredConnectorId === props.relationship.id
})

const showEndpointHandles = computed(() => !isSelfLoop.value && routeInteraction.value)
const showRouteHandle = computed(() => routeInteraction.value && !!routeHandle.value)

function onLabelMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (isSelfLoop.value && !store.state.labelPositions[props.relationship.id]) {
    const { source, target } = geometry.value
    const defaultPosition = selfLoopLabelPos(source, target)
    const corners = selfLoopCorners(source, target, selfLoopExtent.value, selfLoopCorner.value)
    store.setLabelPosition(
      props.relationship.id,
      {
        ...snapToConnector(defaultPosition, source.point, target.point),
        selfLoop: selfLoopLabelPositionFromPoint(corners, selfLoopCorner.value, defaultPosition),
      },
    )
  }
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

function onRouteHandleMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  store.startDraggingRoute(props.relationship.id)
}

function onRouteHandleDblClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (isSelfLoop.value) {
    // Reset extent only — keep the corner slot
    store.setSelfLoopRoute(props.relationship.id, {
      corner: selfLoopCorner.value,
      extent: SELF_LOOP_DEFAULT_EXTENT,
    })
    return
  }
  store.setRouteOverride(props.relationship.id, props.connectorStyle, null)
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
      v-if="showEndpointHandles"
      :cx="geometry.source.point.x"
      :cy="geometry.source.point.y"
      r="6"
      class="connector-handle"
      @mousedown="onHandleMouseDown('from', $event)"
    />
    <circle
      v-if="showEndpointHandles"
      :cx="geometry.target.point.x"
      :cy="geometry.target.point.y"
      r="6"
      class="connector-handle"
      @mousedown="onHandleMouseDown('to', $event)"
    />
    <!-- Mid-route handle: ortho/curved nudge, or self-loop extent (dblclick resets) -->
    <circle
      v-if="showRouteHandle && routeHandle"
      :cx="routeHandle.x"
      :cy="routeHandle.y"
      r="5"
      class="connector-handle connector-route-handle"
      @mousedown="onRouteHandleMouseDown"
      @dblclick="onRouteHandleDblClick"
    />
    <text
      v-if="relationship.label"
      :x="labelPos.x"
      :y="labelPos.y"
      class="connector-label"
      :class="{ 'self-loop-label': isSelfLoop }"
      :text-anchor="labelAnchor"
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
  /* Explicit stack — SVG-as-image export has no <body> to inherit from
     (browser default would be serif / Times and look wrong vs the live canvas) */
  font-family: var(--font-sans);
  font-size: 11px;
  fill: var(--c-connector-label);
  pointer-events: auto;
  user-select: none;
  cursor: grab;
  transition: font-size 0.15s, fill 0.15s;
}

.minmax-label {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--c-connector-label);
  user-select: none;
  pointer-events: none;
  transition: font-size 0.15s, fill 0.15s;
}

/* Match marker emphasis on hover (markers grow via stroke-width; text needs this) */
.er-connector:hover .minmax-label {
  font-size: 13px;
  fill: var(--c-connector-hover);
  font-weight: 600;
}

.er-connector:hover .connector-label {
  font-size: 14px;
  fill: var(--c-connector-hover);
  font-weight: 600;
}

.connector-line.barker-optional {
  stroke-dasharray: 1 4;
}

.connector-label:active {
  cursor: grabbing;
}

.self-loop-label,
.self-loop-label:active {
  cursor: grab;
}

.self-loop-label:active {
  cursor: grabbing;
}
</style>
