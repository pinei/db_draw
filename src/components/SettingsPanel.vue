<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Minus, Plus, TriangleAlert } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'
import { useAuthStore } from '../stores/auth'
import { downloadDiagram, type DiagramExportFormat } from '../utils/diagramExport'
import type { ConnectorStyle, NotationStyle, ThemeMode } from '../model/types'
import MermaidExportDialog from './MermaidExportDialog.vue'

const store = useDiagramStore()
const auth = useAuthStore()
const layout = computed(() => store.layout)
const exporting = ref(false)
const exportMessage = ref('')
const mermaidOpen = ref(false)

const connectorOptions: { value: ConnectorStyle; label: string }[] = [
  { value: 'curved',      label: 'Curved' },
  { value: 'orthogonal',  label: 'Orthogonal' },
]

const notationOptions: { value: NotationStyle; label: string }[] = [
  { value: 'crowsfoot', label: "Crow's Foot" },
  { value: 'minmax',    label: 'Min-Max' },
  { value: 'barker',    label: "Barker's" },
]

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
  { value: 'system', label: 'System' },
]

async function exportDiagram(format: DiagramExportFormat) {
  if (exporting.value) return
  exporting.value = true
  exportMessage.value = ''
  try {
    const base = store.state.meta.name || store.state.meta.id || store.currentModelId
    await downloadDiagram(format, {
      filenameBase: base,
      entityPositions: store.state.entityPositions,
    })
  } catch (e) {
    exportMessage.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <div class="panel-section">
      <span class="section-label">Connectors</span>
      <div class="btn-group">
        <button
          v-for="opt in connectorOptions"
          :key="opt.value"
          class="btn"
          :class="{ active: layout.connectorStyle === opt.value }"
          @click="store.setConnectorStyle(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div class="divider" />

    <div class="panel-section">
      <span class="section-label">Notation</span>
      <div class="btn-group">
        <button
          v-for="opt in notationOptions"
          :key="opt.value"
          class="btn"
          :class="{ active: layout.notationStyle === opt.value }"
          @click="store.setNotationStyle(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div class="divider" />

    <div class="panel-section">
      <span class="section-label">Theme</span>
      <div class="btn-group">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          class="btn"
          :class="{ active: layout.theme === opt.value }"
          @click="store.setTheme(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div class="divider" />

    <div class="panel-section zoom-section">
      <span class="section-label">Zoom {{ Math.round(layout.canvasScale * 100) }}%</span>
      <div class="btn-group">
        <button class="btn icon" aria-label="Zoom out" @click="store.setCanvasScale(layout.canvasScale - 0.1)"><Minus :size="13" /></button>
        <button class="btn" title="Reset zoom to 1x and center the diagram" @click="store.resetCanvasView()">Reset</button>
        <button class="btn icon" aria-label="Zoom in" @click="store.setCanvasScale(layout.canvasScale + 0.1)"><Plus :size="13" /></button>
      </div>
    </div>

    <div class="divider" />

    <div class="panel-section">
      <span class="section-label">Export</span>
      <div class="btn-group">
        <button class="btn" :disabled="exporting" @click="exportDiagram('png')">PNG</button>
        <button class="btn" :disabled="exporting" @click="exportDiagram('svg')">SVG</button>
        <button class="btn" @click="mermaidOpen = true">Mermaid</button>
      </div>
      <div v-if="exportMessage" class="export-error">{{ exportMessage }}</div>
      <MermaidExportDialog v-if="mermaidOpen" @close="mermaidOpen = false" />
    </div>

    <div class="divider" />

    <div class="panel-section">
      <span class="section-label user-email" :title="auth.email ?? ''">{{ auth.email }}</span>
      <div class="btn-group">
        <a
          v-if="auth.admin"
          class="btn"
          href="/admin"
          target="_blank"
          rel="noopener noreferrer"
        >Admin</a>
        <button class="btn" @click="auth.logout()">Logout</button>
      </div>
    </div>

    <div class="save-status" :class="store.saveStatus">
      <span v-if="store.saveStatus === 'saving'">saving…</span>
      <span v-else-if="store.saveStatus === 'saved'" class="status-line"><Check :size="12" /> saved</span>
      <span v-else-if="store.saveStatus === 'error'" class="status-line"><TriangleAlert :size="12" /> save failed</span>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  user-select: none;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zoom-section {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.divider {
  height: 1px;
  background: var(--c-panel-border);
}

.user-email {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-transform: none;
}

.btn-group {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
}

.export-error {
  font-size: 10px;
  color: #f87171;
  line-height: 1.3;
}

.save-status {
  font-size: 10px;
  text-align: right;
  min-height: 14px;
  color: transparent;
  transition: color 0.2s;
}

.status-line {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.save-status.saving { color: var(--c-panel-label); }
.save-status.saved  { color: #4ade80; }
.save-status.error  { color: #f87171; }

.btn {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-family: inherit;
  border: none;
  border-right: 1px solid var(--c-btn-border);
  border-radius: 0;
  background: transparent;
  color: var(--c-btn-fg);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  text-align: center;
  text-decoration: none;
  box-sizing: border-box;
}

.btn:last-child {
  border-right: none;
}

.btn.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.active {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
}
</style>
