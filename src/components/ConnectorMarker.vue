<script setup lang="ts">
import type { NotationStyle, Cardinality } from '../model/types'

defineProps<{ notationStyle: NotationStyle }>()

// Marker IDs follow the pattern: `marker-{notationStyle}-{cardinality}-{end}`
// e.g. marker-crowsfoot-MANY-end, marker-arrow-ONE-start
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
      <!-- ONE_AND_ONLY_ONE: double vertical bar -->
      <marker id="cf-ONE_AND_ONLY_ONE-end"   markerWidth="10" markerHeight="12" refX="8" refY="6" orient="auto">
        <line x1="8" y1="1" x2="8" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="1" x2="3" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ONE_AND_ONLY_ONE-start" markerWidth="10" markerHeight="12" refX="7"  refY="6" orient="auto-start-reverse">
        <line x1="7" y1="1" x2="7" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="2" y1="1" x2="2" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <!-- MANY: crow's foot — tips spread at entity, leg converges toward connector -->
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

    <!-- ── Arrow markers ───────────────────────────────────── -->
    <template v-else-if="notationStyle === 'arrow'">
      <!-- Filled arrowhead pointing inward for MANY, double for ONE -->
      <marker id="arr-MANY-end"         markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8 Z" fill="var(--c-connector)" />
      </marker>
      <marker id="arr-MANY-start"       markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8 Z" fill="var(--c-connector)" />
      </marker>
      <marker id="arr-ONE-end"          markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <line x1="7" y1="0" x2="7" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="4" y1="0" x2="4" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="arr-ONE-start"        markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <line x1="3" y1="0" x2="3" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="6" y1="0" x2="6" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="arr-ONE_AND_ONLY_ONE-end"   markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <line x1="7" y1="0" x2="7" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="4" y1="0" x2="4" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="arr-ONE_AND_ONLY_ONE-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <line x1="3" y1="0" x2="3" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="6" y1="0" x2="6" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="arr-ONE_OR_MANY-end"   markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8 Z" fill="var(--c-connector)" />
      </marker>
      <marker id="arr-ONE_OR_MANY-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8 Z" fill="var(--c-connector)" />
      </marker>
      <!-- Reuse MANY for ZERO_OR_MANY / ZERO_OR_ONE — open arrow for zero -->
      <marker id="arr-ZERO_OR_MANY-end"   markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
        <path d="M 2 0 L 10 4 L 2 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="2" cy="4" r="2" fill="none" stroke="var(--c-connector)" stroke-width="1.2" />
      </marker>
      <marker id="arr-ZERO_OR_MANY-start" markerWidth="12" markerHeight="8" refX="2"  refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 2 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="10" cy="4" r="2" fill="none" stroke="var(--c-connector)" stroke-width="1.2" />
      </marker>
      <marker id="arr-ZERO_OR_ONE-end"    markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
        <line x1="8" y1="0" x2="8" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="3" cy="4" r="2" fill="none" stroke="var(--c-connector)" stroke-width="1.2" />
      </marker>
      <marker id="arr-ZERO_OR_ONE-start"  markerWidth="12" markerHeight="8" refX="2"  refY="4" orient="auto-start-reverse">
        <line x1="4" y1="0" x2="4" y2="8" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="9" cy="4" r="2" fill="none" stroke="var(--c-connector)" stroke-width="1.2" />
      </marker>
    </template>

    <!-- ── UML markers ─────────────────────────────────────── -->
    <template v-else-if="notationStyle === 'uml'">
      <!-- Open arrowhead for association (all cardinalities use the same shape) -->
      <marker id="uml-MANY-end"         markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-MANY-start"       markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE-end"          markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE-start"        markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE_AND_ONLY_ONE-end"   markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE_AND_ONLY_ONE-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE_OR_MANY-end"   markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ONE_OR_MANY-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ZERO_OR_MANY-end"   markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ZERO_OR_MANY-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ZERO_OR_ONE-end"    markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="uml-ZERO_OR_ONE-start"  markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
        <path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
    </template>
  </defs>
</template>
