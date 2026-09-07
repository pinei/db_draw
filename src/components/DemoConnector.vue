<script setup lang="ts">
import { computed } from 'vue'
import type { ErRelationship, EntityRect, ConnectorStyle, NotationStyle, Cardinality, LogicalCardinality, CustomConnectionPoints } from '../model/types'
import { getConnectionPoints, minMaxLabelPosition } from '../utils/connectionPoints'
import { bezierPath, orthogonalPath, splitBezierPath, splitOrthogonalPath } from '../utils/connectorPath'

const props = defineProps<{
  relationship: ErRelationship
  fromRect: EntityRect
  toRect: EntityRect
  connectorStyle: ConnectorStyle
  notationStyle: NotationStyle
  customPoints?: CustomConnectionPoints
}>()

const geometry = computed(() => getConnectionPoints(props.fromRect, props.toRect, props.customPoints))

const pathData = computed(() => {
  const { source, target } = geometry.value
  return props.connectorStyle === 'curved'
    ? bezierPath(source, target)
    : orthogonalPath(source, target)
})

const ns = computed(() => {
  const prefixes: Record<NotationStyle, string> = { crowsfoot: 'cf', minmax: 'mm', barker: 'bar' }
  return prefixes[props.notationStyle]
})

const isBarker = computed(() => props.notationStyle === 'barker')

const barkerHalves = computed(() => {
  if (!isBarker.value) return null
  const { source, target } = geometry.value
  return props.connectorStyle === 'curved'
    ? splitBezierPath(source, target)
    : splitOrthogonalPath(source, target)
})

function isBarkerOptional(c: Cardinality | LogicalCardinality): boolean {
  return c === 'ZERO_OR_ONE' || c === 'ZERO_OR_MANY'
}

const barkerFromOptional = computed(() => isBarkerOptional(props.relationship.fromCardinality))
const barkerToOptional = computed(() => isBarkerOptional(props.relationship.toCardinality))

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
const minMaxFromPos = computed(() => minMaxLabelPosition(geometry.value.source, props.fromRect))
const minMaxToPos = computed(() => minMaxLabelPosition(geometry.value.target, props.toRect))
const markerEnd   = computed(() => `url(#${ns.value}-${props.relationship.toCardinality}-end)`)
const markerStart = computed(() => `url(#${ns.value}-${props.relationship.fromCardinality}-start)`)

const labelPos = computed(() => {
  const { source, target } = geometry.value
  return {
    x: (source.point.x + target.point.x) / 2,
    y: (source.point.y + target.point.y) / 2 - 6,
  }
})
</script>

<template>
  <g class="demo-connector">
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
    <text
      v-if="relationship.label"
      :x="labelPos.x"
      :y="labelPos.y"
      class="connector-label"
      text-anchor="middle"
      dominant-baseline="auto"
    >{{ relationship.label }}</text>
  </g>
</template>

<style scoped>
.connector-line {
  stroke: var(--c-connector);
  stroke-width: 1.5;
}

.connector-label {
  font-family: var(--font-sans);
  font-size: 11px;
  fill: var(--c-connector-label);
  pointer-events: none;
  user-select: none;
}

.minmax-label {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--c-connector-label);
  pointer-events: none;
  user-select: none;
}

.connector-line.barker-optional {
  stroke-dasharray: 1 4;
}
</style>
