<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, Code, Scan } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'
import { useAuthStore } from '../stores/auth'
import type { SidePanelView } from '../model/types'
import CodeView from './CodeView.vue'
import ScopeView from './ScopeView.vue'

// ─── Docked left sidebar (overlay) ───────────────────────────────────────────
// Shell owns rail, header, collapse and width; views are content-only.
// Closed = 48px icon rail (the panel never fully disappears).

const RAIL_WIDTH = 48
const MIN_WIDTH = 220
const DEFAULT_WIDTH = 280

const store = useDiagramStore()
const auth = useAuthStore()
const layout = computed(() => store.layout)
const open = computed(() => layout.value.codePanelOpen)
const view = computed(() => layout.value.sidePanelView)

const views: Array<{ id: SidePanelView; title: string; icon: typeof Code }> = [
  { id: 'code', title: 'Diagram Code', icon: Code },
  { id: 'scope', title: 'Scope', icon: Scan },
]
const activeTitle = computed(() => views.find((v) => v.id === view.value)?.title ?? '')

function selectView(id: SidePanelView) {
  if (!open.value || view.value !== id) store.setSidePanelView(id)
  else store.toggleCodePanel()
}

// ─── Width: init from persisted prefs, drag to resize, persist debounced ─────
const contentWidth = ref(DEFAULT_WIDTH)
let persistTimer: ReturnType<typeof setTimeout> | null = null

function clampWidth(w: number): number {
  return Math.round(Math.min(window.innerWidth * 0.5, Math.max(MIN_WIDTH, w)))
}

function applyStoredWidth() {
  const stored = auth.codePanelSize?.width
  contentWidth.value = stored ? clampWidth(stored) : DEFAULT_WIDTH
  store.setSidePanelWidth(contentWidth.value)
}

applyStoredWidth()

watch(
  () => auth.codePanelSize,
  () => {
    if (!dragging) applyStoredWidth()
  },
)

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const prev = auth.codePanelSize
    const height = prev?.height ?? window.innerHeight - 32
    if (prev && prev.width === contentWidth.value && prev.height === height) return
    void auth.persistCodePanelSize({ width: contentWidth.value, height })
  }, 400)
}

// ─── Right-edge drag handle ──────────────────────────────────────────────────
let dragging = false

function onHandlePointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  const startX = e.clientX
  const startW = contentWidth.value
  const move = (ev: PointerEvent) => {
    contentWidth.value = clampWidth(startW + ev.clientX - startX)
    store.setSidePanelWidth(contentWidth.value)
  };
  const up = () => {
    dragging = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    schedulePersist()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

onUnmounted(() => {
  if (persistTimer) clearTimeout(persistTimer)
})
</script>

<template>
  <div class="side-panel">
    <div class="rail" role="tablist" aria-label="Side panel views">
      <button
        v-for="v in views"
        :key="v.id"
        type="button"
        role="tab"
        class="rail-btn"
        :class="{ active: open && view === v.id }"
        :title="v.title"
        :aria-label="v.title"
        :aria-selected="open && view === v.id"
        @click="selectView(v.id)"
      >
        <component :is="v.icon" :size="18" />
      </button>
    </div>

    <div v-if="open" class="side-content" :style="{ width: `${contentWidth}px` }">
      <div class="side-header">
        <span class="side-title">{{ activeTitle }}</span>
        <button
          type="button"
          class="collapse-btn"
          title="Collapse panel"
          aria-label="Collapse panel"
          @click="store.toggleCodePanel()"
        >
          <ChevronLeft :size="14" />
        </button>
      </div>
      <div class="side-body">
        <CodeView v-if="view === 'code'" />
        <ScopeView v-else />
      </div>
      <div
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        @pointerdown="onHandlePointerDown"
      />
    </div>
  </div>
</template>

<style scoped>
.side-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  display: flex;
  align-items: stretch;
  pointer-events: none;
  user-select: none;
}

.rail {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 0;
  background: var(--c-panel-bg);
  border-right: 1px solid var(--c-panel-border);
  pointer-events: auto;
}

.rail-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--c-panel-label);
  cursor: pointer;
  padding: 0;
}

.rail-btn:hover {
  color: var(--c-btn-fg);
  background: var(--c-btn-hover-bg);
}

.rail-btn.active {
  color: var(--c-btn-active-fg);
  background: var(--c-btn-active-bg);
  border-color: var(--c-btn-active-border);
}

.side-content {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--c-panel-bg);
  border-right: 1px solid var(--c-panel-border);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}

.side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--c-panel-border);
  min-height: 37px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.side-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  padding: 2px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  flex-shrink: 0;
}

.collapse-btn:hover {
  color: var(--c-btn-fg);
  background: var(--c-btn-hover-bg);
}

.side-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 7px;
  cursor: ew-resize;
  touch-action: none;
}

.resize-handle:hover::after,
.resize-handle:active::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 3px;
  border-radius: 2px;
  background: var(--c-btn-active-border);
}
</style>
