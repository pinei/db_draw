<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { ConnectorStyle, NotationStyle } from '../model/types'
import { landingSchema, landingPositions, landingConnectorPoints, LANDING_VIEWBOX } from '../model/landingSample'
import ErEntity from './ErEntity.vue'
import DemoConnector from './DemoConnector.vue'
import ConnectorMarker from './ConnectorMarker.vue'

const connectorStyle = ref<ConnectorStyle>('curved')
const notationStyle = ref<NotationStyle>('crowsfoot')
const demoTheme = ref<'light' | 'dark'>(
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
)

const positions = reactive(structuredClone(landingPositions))

const connectorOptions: { value: ConnectorStyle; label: string }[] = [
  { value: 'curved', label: 'Curved' },
  { value: 'orthogonal', label: 'Orthogonal' },
]

const notationOptions: { value: NotationStyle; label: string }[] = [
  { value: 'crowsfoot', label: "Crow's Foot" },
  { value: 'minmax', label: 'Min-Max' },
  { value: 'barker', label: "Barker's" },
]

const themeOptions: { value: 'light' | 'dark'; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function positionOf(id: string) {
  return positions[id] ?? { x: 0, y: 0, width: 210, height: 100 }
}

function onResize(id: string, width: number, height: number) {
  const rect = positions[id]
  if (!rect) return
  rect.width = width
  rect.height = height
}
</script>

<template>
  <div class="demo-window" :data-theme="demoTheme">
    <div class="demo-chrome">
      <div class="demo-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div class="demo-title">Database Draw</div>
      <div class="demo-chrome-spacer" aria-hidden="true" />
    </div>
    <div class="demo-stage">
      <svg
        class="demo-svg"
        :viewBox="`0 0 ${LANDING_VIEWBOX.width} ${LANDING_VIEWBOX.height}`"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Sample entity-relationship diagram"
      >
      <rect
        x="0" y="0"
        :width="LANDING_VIEWBOX.width"
        :height="LANDING_VIEWBOX.height"
        fill="var(--c-canvas-bg)"
      />
      <ConnectorMarker :notation-style="notationStyle" />
      <DemoConnector
        v-for="rel in landingSchema.relationships"
        :key="rel.id"
        :relationship="rel"
        :from-rect="positionOf(rel.fromEntityId)"
        :to-rect="positionOf(rel.toEntityId)"
        :connector-style="connectorStyle"
        :notation-style="notationStyle"
        :custom-points="landingConnectorPoints[rel.id]"
      />
      <ErEntity
        v-for="entity in landingSchema.entities"
        :key="entity.id"
        :entity="entity"
        :rect="positionOf(entity.id)"
        @resize="onResize"
      />
      </svg>
      <div class="demo-buttonbar">
        <div class="control-cluster">
          <span class="cluster-label">Connectors</span>
          <div class="btn-group" role="group" aria-label="Connector style">
            <button
              v-for="opt in connectorOptions"
              :key="opt.value"
              type="button"
              class="btn"
              :class="{ active: connectorStyle === opt.value }"
              :aria-pressed="connectorStyle === opt.value"
              @click="connectorStyle = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
        <div class="control-cluster">
          <span class="cluster-label">Notation</span>
          <div class="btn-group" role="group" aria-label="Notation">
            <button
              v-for="opt in notationOptions"
              :key="opt.value"
              type="button"
              class="btn"
              :class="{ active: notationStyle === opt.value }"
              :aria-pressed="notationStyle === opt.value"
              @click="notationStyle = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
        <div class="control-cluster">
          <span class="cluster-label">Theme</span>
          <div class="btn-group" role="group" aria-label="Demo theme">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              type="button"
              class="btn"
              :class="{ active: demoTheme === opt.value }"
              :aria-pressed="demoTheme === opt.value"
              @click="demoTheme = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-window {
  border: 1px solid var(--c-panel-border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--c-canvas-bg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.demo-chrome {
  display: grid;
  grid-template-columns: 52px 1fr 52px;
  align-items: center;
  height: 34px;
  padding: 0 10px;
  background: var(--c-panel-bg);
  border-bottom: 1px solid var(--c-panel-border);
}

.demo-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: center;
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-dots {
  display: flex;
  gap: 5px;
  padding: 0 2px;
}

.demo-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-btn-border);
}

.demo-dots span:nth-child(1) { background: #ff5f57; }
.demo-dots span:nth-child(2) { background: #febc2e; }
.demo-dots span:nth-child(3) { background: #28c840; }

.demo-stage {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.demo-buttonbar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: 10px 16px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.control-cluster {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cluster-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.btn-group {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
}

.btn {
  padding: 4px 9px;
  font-size: 11px;
  font-family: inherit;
  border: none;
  border-right: 1px solid var(--c-btn-border);
  border-radius: 0;
  background: transparent;
  color: var(--c-btn-fg);
  cursor: pointer;
  white-space: nowrap;
}

.btn:last-child {
  border-right: none;
}

.btn:hover {
  background: var(--c-btn-hover-bg);
}

.btn.active {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
}

.demo-svg {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
