<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import type { ErEntity, EntityRect } from '../model/types'

const props = defineProps<{
  entity: ErEntity
  rect: EntityRect
  dragging?: boolean
}>()

const emit = defineEmits<{
  dragstart: [id: string, evt: MouseEvent]
  resize: [id: string, width: number, height: number]
}>()

// foreignObject element ref for measuring actual rendered height
const cardRef = ref<HTMLElement | null>(null)

// scrollHeight (not offsetHeight: the card is height:100% + overflow:hidden,
// so offsetHeight is just the clipped box) — grows AND shrinks with content
function syncHeight() {
  if (!cardRef.value) return
  const h = cardRef.value.scrollHeight
  if (h > 0 && Math.abs(h - props.rect.height) > 2) {
    emit('resize', props.entity.id, props.rect.width, h)
  }
}

onMounted(() => {
  syncHeight()
})

// Fields arriving via DBML Apply (or any schema change) must reflow the card:
// without this the new rows render clipped inside the stale rect height
watch(() => props.entity.fields.length, () => {
  nextTick(syncHeight)
})

function onMouseDown(evt: MouseEvent) {
  if (evt.button !== 0) return
  evt.stopPropagation()
  emit('dragstart', props.entity.id, evt)
}
</script>

<template>
  <g
    class="er-entity"
    :class="{ dragging }"
    :transform="`translate(${rect.x}, ${rect.y})`"
    @mousedown="onMouseDown"
  >
    <!-- Shadow / border rect -->
    <rect
      :width="rect.width"
      :height="rect.height"
      rx="6"
      class="entity-bg"
    />

    <!-- Use foreignObject so we can render HTML inside SVG for richer layout -->
    <foreignObject :width="rect.width" :height="rect.height">
      <div ref="cardRef" xmlns="http://www.w3.org/1999/xhtml" class="entity-card">
        <div class="entity-header">
          <span class="entity-name">{{ entity.name }}</span>
        </div>
        <ul class="field-list">
          <li
            v-for="field in entity.fields"
            :key="field.id"
            class="field-row"
            :class="{
              'field-pk': field.isPK,
              'field-fk': field.isFK && !field.isPK,
            }"
          >
            <span class="field-badge" v-if="field.isPK">PK</span>
            <span class="field-badge fk" v-else-if="field.isFK">FK</span>
            <span class="field-badge empty" v-else></span>
            <span class="field-name">{{ field.name }}</span>
            <span class="field-type">{{ field.type }}</span>
          </li>
        </ul>
      </div>
    </foreignObject>
  </g>
</template>

<style scoped>
.er-entity {
  cursor: grab;
  user-select: none;
}

.er-entity.dragging {
  cursor: grabbing;
}

.entity-bg {
  fill: var(--c-entity-bg);
  stroke: var(--c-entity-border);
  stroke-width: 1.5;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
  transition: filter 0.15s;
}

.er-entity:hover .entity-bg,
.er-entity.dragging .entity-bg {
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.25));
  stroke: var(--c-entity-border-hover);
}

/* ── HTML card inside foreignObject ─────────────────────────────── */

.entity-card {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  border-radius: 6px;
  height: 100%;
  box-sizing: border-box;
}

.entity-header {
  background: var(--c-header-bg);
  color: var(--c-header-fg);
  padding: 0 10px;
  height: 36px;
  display: flex;
  align-items: center;
  border-radius: 6px 6px 0 0;
}

.entity-name {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  background: var(--c-entity-bg);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  height: 28px;
  border-bottom: 1px solid var(--c-field-divider);
  box-sizing: border-box;
}

.field-row:last-child {
  border-bottom: none;
}

.field-row.field-pk {
  background: var(--c-pk-row);
}

.field-row.field-fk {
  background: var(--c-fk-row);
}

.field-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--c-pk-badge-bg);
  color: var(--c-pk-badge-fg);
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.field-badge.fk {
  background: var(--c-fk-badge-bg);
  color: var(--c-fk-badge-fg);
}

.field-badge.empty {
  background: transparent;
  visibility: hidden;
}

.field-name {
  flex: 1;
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-type {
  color: var(--c-field-type);
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
