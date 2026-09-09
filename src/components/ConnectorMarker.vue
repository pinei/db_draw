<script setup lang="ts">
import type { NotationStyle, Cardinality, LogicalCardinality, EdgeSide } from '../model/types'

defineProps<{ notationStyle: NotationStyle }>()

// All renderable cardinalities (specialized + logical placeholders) —
// used to generate the (empty) min-max markers
const cardinalities: (Cardinality | LogicalCardinality)[] = ['ONE', 'MANY', 'ONE_OR_MANY', 'ZERO_OR_ONE', 'ZERO_OR_MANY']

// Barker groups: plain ends for "one" sides, crow's foot for "many" sides
// (line style solid/dotted is set per half-path by ErConnector)
const barkerPlain: (Cardinality | LogicalCardinality)[] = ['ONE', 'ZERO_OR_ONE']
const barkerFoot: (Cardinality | LogicalCardinality)[] = ['MANY', 'ONE_OR_MANY', 'ZERO_OR_MANY']

// Absolute marker orient (degrees) so the glyph's +x points into the entity.
// Used by Curved connectors so markers stay perpendicular to the card even
// when the path tangent tilts after a mid-route nudge.
const edgeSides: EdgeSide[] = ['left', 'right', 'top', 'bottom']
const sideOrient: Record<EdgeSide, number> = {
  left: 0,
  right: 180,
  top: 90,
  bottom: 270,
}

// Marker IDs follow the pattern: `{prefix}-{Cardinality}-{end|start}`
// plus optional `-{side}` for fixed-orient Curved variants.
// e.g. cf-MANY-end, cf-MANY-end-right (see AGENTS.md)
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
      <template v-for="side in edgeSides" :key="'cf-ONE-' + side">
        <marker :id="`cf-ONE-end-${side}`" markerWidth="10" markerHeight="12" refX="8" refY="6" :orient="sideOrient[side]">
          <line x1="8" y1="1" x2="8" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <!-- Fixed-orient start reuses end geometry (same as MANY auto-start-reverse note) -->
        <marker :id="`cf-ONE-start-${side}`" markerWidth="10" markerHeight="12" refX="8" refY="6" :orient="sideOrient[side]">
          <line x1="8" y1="1" x2="8" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
      <!-- MANY (logical placeholder): crow's foot — tips spread at entity, leg converges toward connector -->
      <marker id="cf-MANY-end"   markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto">
        <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <!-- auto-start-reverse already points +x toward the entity, so start
           glyphs reuse the end geometry (bar/foot at the entity, extras along
           the line). Mirroring them would double-flip and draw into the card. -->
      <marker id="cf-MANY-start" markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto-start-reverse">
        <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <template v-for="side in edgeSides" :key="'cf-MANY-' + side">
        <marker :id="`cf-MANY-end-${side}`" markerWidth="13" markerHeight="12" refX="11" refY="6" :orient="sideOrient[side]">
          <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`cf-MANY-start-${side}`" markerWidth="13" markerHeight="12" refX="11" refY="6" :orient="sideOrient[side]">
          <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
      <!-- ZERO_OR_ONE: circle (zero) + bar (one); bar closest to entity -->
      <marker id="cf-ZERO_OR_ONE-end"   markerWidth="20" markerHeight="12" refX="17" refY="6" orient="auto">
        <line x1="17" y1="1" x2="17" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ZERO_OR_ONE-start" markerWidth="20" markerHeight="12" refX="17" refY="6" orient="auto-start-reverse">
        <line x1="17" y1="1" x2="17" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <template v-for="side in edgeSides" :key="'cf-ZO-' + side">
        <marker :id="`cf-ZERO_OR_ONE-end-${side}`" markerWidth="20" markerHeight="12" refX="17" refY="6" :orient="sideOrient[side]">
          <line x1="17" y1="1" x2="17" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`cf-ZERO_OR_ONE-start-${side}`" markerWidth="20" markerHeight="12" refX="17" refY="6" :orient="sideOrient[side]">
          <line x1="17" y1="1" x2="17" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
      <!-- ONE_OR_MANY: single bar + crow's foot; foot closest to entity -->
      <marker id="cf-ONE_OR_MANY-end"   markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="1" x2="12" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ONE_OR_MANY-start" markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto-start-reverse">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="1" x2="12" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <template v-for="side in edgeSides" :key="'cf-OM-' + side">
        <marker :id="`cf-ONE_OR_MANY-end-${side}`" markerWidth="24" markerHeight="12" refX="21" refY="6" :orient="sideOrient[side]">
          <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="1" x2="12" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`cf-ONE_OR_MANY-start-${side}`" markerWidth="24" markerHeight="12" refX="21" refY="6" :orient="sideOrient[side]">
          <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="1" x2="12" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
      <marker id="cf-ZERO_OR_MANY-end"   markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <marker id="cf-ZERO_OR_MANY-start" markerWidth="24" markerHeight="12" refX="21" refY="6" orient="auto-start-reverse">
        <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
        <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
      </marker>
      <template v-for="side in edgeSides" :key="'cf-ZM-' + side">
        <marker :id="`cf-ZERO_OR_MANY-end-${side}`" markerWidth="24" markerHeight="12" refX="21" refY="6" :orient="sideOrient[side]">
          <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`cf-ZERO_OR_MANY-start-${side}`" markerWidth="24" markerHeight="12" refX="21" refY="6" :orient="sideOrient[side]">
          <line x1="12" y1="6" x2="21" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="12" y1="6" x2="21" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          <circle cx="8" cy="6" r="4" fill="var(--c-canvas-bg)" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
      </template>
    </template>

    <!-- ── Min-Max markers ─────────────────────────────────── -->
    <!-- Plain line ends: the cardinality text annotations rendered by
         ErConnector carry the semantics. These empty markers only exist to
         keep the {prefix}-{Cardinality}-{end|start} convention uniform. -->
    <template v-else-if="notationStyle === 'minmax'">
      <template v-for="c in cardinalities" :key="c">
        <marker :id="`mm-${c}-end`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto" />
        <marker :id="`mm-${c}-start`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto-start-reverse" />
        <template v-for="side in edgeSides" :key="c + side">
          <marker :id="`mm-${c}-end-${side}`" markerWidth="1" markerHeight="1" refX="0" refY="0" :orient="sideOrient[side]" />
          <marker :id="`mm-${c}-start-${side}`" markerWidth="1" markerHeight="1" refX="0" refY="0" :orient="sideOrient[side]" />
        </template>
      </template>
    </template>

    <!-- ── Barker markers ──────────────────────────────────── -->
    <!-- "One" ends are plain; "many" ends get a crow's foot -->
    <template v-else-if="notationStyle === 'barker'">
      <template v-for="c in barkerPlain" :key="c">
        <marker :id="`bar-${c}-end`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto" />
        <marker :id="`bar-${c}-start`" markerWidth="1" markerHeight="1" refX="0" refY="0" orient="auto-start-reverse" />
        <template v-for="side in edgeSides" :key="c + side">
          <marker :id="`bar-${c}-end-${side}`" markerWidth="1" markerHeight="1" refX="0" refY="0" :orient="sideOrient[side]" />
          <marker :id="`bar-${c}-start-${side}`" markerWidth="1" markerHeight="1" refX="0" refY="0" :orient="sideOrient[side]" />
        </template>
      </template>
      <template v-for="c in barkerFoot" :key="c">
        <marker :id="`bar-${c}-end`" markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto">
          <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <marker :id="`bar-${c}-start`" markerWidth="13" markerHeight="12" refX="11" refY="6" orient="auto-start-reverse">
          <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
          <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
        </marker>
        <template v-for="side in edgeSides" :key="c + '-fix-' + side">
          <marker :id="`bar-${c}-end-${side}`" markerWidth="13" markerHeight="12" refX="11" refY="6" :orient="sideOrient[side]">
            <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
            <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
            <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          </marker>
          <marker :id="`bar-${c}-start-${side}`" markerWidth="13" markerHeight="12" refX="11" refY="6" :orient="sideOrient[side]">
            <line x1="3" y1="6" x2="11" y2="1"  stroke="var(--c-connector)" stroke-width="1.5" />
            <line x1="3" y1="6" x2="11" y2="6"  stroke="var(--c-connector)" stroke-width="1.5" />
            <line x1="3" y1="6" x2="11" y2="11" stroke="var(--c-connector)" stroke-width="1.5" />
          </marker>
        </template>
      </template>
    </template>
  </defs>
</template>
