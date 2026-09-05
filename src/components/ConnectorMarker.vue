<script setup lang="ts">
import type { NotationStyle, Cardinality, LogicalCardinality } from '../model/types'

defineProps<{ notationStyle: NotationStyle }>()

// All renderable cardinalities (specialized + logical placeholders) —
// used to generate the (empty) min-max markers
const cardinalities: (Cardinality | LogicalCardinality)[] = ['ONE', 'MANY', 'ONE_OR_MANY', 'ZERO_OR_ONE', 'ZERO_OR_MANY']

// Barker groups: plain ends for "one" sides, crow's foot for "many" sides
// (line style solid/dotted is set per half-path by ErConnector)
const barkerPlain: (Cardinality | LogicalCardinality)[] = ['ONE', 'ZERO_OR_ONE']
const barkerFoot: (Cardinality | LogicalCardinality)[] = ['MANY', 'ONE_OR_MANY', 'ZERO_OR_MANY']

// Marker IDs follow the pattern: `{prefix}-{Cardinality}-{end|start}`
// e.g. cf-MANY-end, bar-ONE-start (see AGENTS.md)
// The ErConnector component references them by this convention.
</script>

<template>
  <defs>
    <!-- ── Crow's Foot markers ─────────────────────────────── -->
    <template v-if="notationStyle === 'crowsfoot'">
      <!-- ONE: single vertical bar -->
      <marker id="cf-ONE-end"   markerWidth="10" markerHeight="12" refX="8" refY="6" orient="auto">
        <line x1="8" y1="1" x2="8" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ONE-start" markerWidth="10" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
        <line x1="2" y1="1" x2="2" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <!-- MANY (logical placeholder): crow's foot — tips spread at entity, leg converges toward connector -->
      <marker id="cf-MANY-end"   markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto">
        <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-MANY-start" markerWidth="13" markerHeight="12" refX="2"  refY="6" orient="auto-start-reverse">
        <line x1="10" y1="6" x2="2" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="10" y1="6" x2="2" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="10" y1="6" x2="2" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <!-- ZERO_OR_ONE: circle (zero) + bar (one); bar closest to entity -->
      <marker id="cf-ZERO_OR_ONE-end"   markerWidth="20" markerHeight="12" refX="17" refY="6" orient="auto">
        <line x1="17" y1="1" x2="17" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ZERO_OR_ONE-start" markerWidth="20" markerHeight="12" refX="3"  refY="6" orient="auto-start-reverse">
        <line x1="3" y1="1" x2="3" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="12" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <!-- ONE_OR_MANY: single bar + crow's foot; foot closest to entity -->
      <marker id="cf-ONE_OR_MANY-end"   markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="1" x2="12" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ONE_OR_MANY-start" markerWidth="24" markerHeight="12" refX="3"  refY="6" orient="auto-start-reverse">
        <line x1="11" y1="6" x2="3" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="11" y1="6" x2="3" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="11" y1="6" x2="3" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="11" y1="1" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ZERO_OR_MANY-end"   markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ZERO_OR_MANY-start" markerWidth="24" markerHeight="12" refX="3"  refY="6" orient="auto-start-reverse">
        <line x1="11" y1="6" x2="3" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="11" y1="6" x2="3" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="11" y1="6" x2="3" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="15" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
    </template>

    <!-- ── Min-Max markers ─────────────────────────────────── -->
    <!-- Plain line ends: the cardinality text annotations rendered by
         ErConnector carry the semantics. These empty markers only exist to
         keep the {prefix}-{Cardinality}-{end|start} convention uniform. -->
    <template v-else-if="notationStyle === 'minmax'">
      <template v-for="c in cardinalities" :key="c">
        <marker :id="`mm-${c}-end`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto" />
        <marker :id="`mm-${c}-start`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto-start-reverse" />
      </template>
    </template>

    <!-- ── Barker markers ──────────────────────────────────── -->
    <!-- "One" ends are plain; "many" ends get a crow's foot -->
    <template v-else-if="notationStyle === 'barker'">
      <template v-for="c in barkerPlain" :key="c">
        <marker :id="`bar-${c}-end`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto" />
        <marker :id="`bar-${c}-start`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto-start-reverse" />
      </template>
      <template v-for="c in barkerFoot" :key="c">
        <marker :id="`bar-${c}-end`" markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto">
          <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`bar-${c}-start`" markerWidth="13" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
          <line x1="10" y1="6" x2="2" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="10" y1="6" x2="2" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="10" y1="6" x2="2" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
    </template>
  </defs>
</template>
