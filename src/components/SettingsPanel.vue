<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import type { ConnectorStyle, NotationStyle, ThemeMode } from '../model/types'

const store = useDiagramStore()
const layout = computed(() => store.layout)

const connectorOptions: { value: ConnectorStyle; label: string }[] = [
  { value: 'curved',      label: 'Curved' },
  { value: 'orthogonal',  label: 'Orthogonal' },
]

const notationOptions: { value: NotationStyle; label: string }[] = [
  { value: 'crowsfoot', label: "Crow's Foot" },
  { value: 'arrow',     label: 'Arrow' },
  { value: 'uml',       label: 'UML' },
]

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
  { value: 'system', label: 'System' },
]
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
        <button class="btn" @click="store.setCanvasScale(layout.canvasScale - 0.1)">−</button>
        <button class="btn" @click="store.setCanvasScale(1)">Reset</button>
        <button class="btn" @click="store.setCanvasScale(layout.canvasScale + 0.1)">+</button>
      </div>
    </div>

    <div class="save-status" :class="store.saveStatus">
      <span v-if="store.saveStatus === 'saving'">saving…</span>
      <span v-else-if="store.saveStatus === 'saved'">✓ saved</span>
      <span v-else-if="store.saveStatus === 'error'">⚠ save failed</span>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
  user-select: none;
  min-width: 180px;
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

.btn-group {
  display: flex;
  gap: 4px;
}

.save-status {
  font-size: 10px;
  text-align: right;
  min-height: 14px;
  color: transparent;
  transition: color 0.2s;
}
.save-status.saving { color: var(--c-panel-label); }
.save-status.saved  { color: #4ade80; }
.save-status.error  { color: #f87171; }

.btn {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
}

.btn:hover {
  background: var(--c-btn-hover-bg);
}

.btn.active {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  border-color: var(--c-btn-active-border);
}
</style>
