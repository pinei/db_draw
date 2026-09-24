<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'
import { generateMermaid } from '../utils/codePlaceholder'
import { highlightMermaid } from '../utils/dbmlHighlight'

const emit = defineEmits<{
  close: []
}>()

const store = useDiagramStore()
const panelEl = ref<HTMLElement | null>(null)
const renderHost = ref<HTMLElement | null>(null)

type View = 'code' | 'diagram'
const view = ref<View>('code')
const rendering = ref(false)
const renderError = ref('')
const svgHtml = ref('')
const renderedKey = ref('')

const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

const source = computed(() => generateMermaid({
  entities: store.visibleEntities,
  relationships: store.visibleRelationships,
}))

const tableNames = computed(() => store.visibleEntities.map((e) => e.name))

const highlightedHtml = computed(() => {
  const src = source.value
  const html = highlightMermaid(src, tableNames.value)
  return src.endsWith('\n') ? html + '\n' : html
})

const isEmpty = computed(() => store.visibleEntities.length === 0)

function mermaidTheme(): 'default' | 'dark' {
  const mode = store.layout.theme
  const dark = mode === 'dark' || (mode === 'system' && systemMedia.matches)
  return dark ? 'dark' : 'default'
}

let renderSeq = 0

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : 'Could not render diagram'
  const line = msg.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Could not render diagram'
  return line.length > 280 ? `${line.slice(0, 280)}…` : line
}

async function renderDiagram() {
  if (isEmpty.value) {
    rendering.value = false
    renderError.value = ''
    svgHtml.value = ''
    renderedKey.value = ''
    return
  }
  const key = `${mermaidTheme()}\0${source.value}`
  if (key === renderedKey.value && svgHtml.value) return

  const seq = ++renderSeq
  rendering.value = true
  renderError.value = ''
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: mermaidTheme(),
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      er: { useMaxWidth: false },
    })
    const id = `mmd-${Date.now()}-${seq}`
    const { svg } = await mermaid.render(id, source.value, renderHost.value ?? undefined)
    if (seq !== renderSeq) return
    svgHtml.value = svg
    renderedKey.value = key
  } catch (e) {
    if (seq !== renderSeq) return
    svgHtml.value = ''
    renderedKey.value = ''
    renderError.value = errorText(e)
  } finally {
    if (seq === renderSeq) rendering.value = false
  }
}

function showDiagram() {
  view.value = 'diagram'
  void renderDiagram()
}

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

function markCopied() {
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 1500)
}

function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  return ok
}

function copyCode() {
  // Must run in the click turn. After an await the browser drops the user
  // gesture and both clipboard APIs fail, so the label never sticks.
  const text = source.value
  if (fallbackCopy(text)) {
    markCopied()
    return
  }
  const write = navigator.clipboard?.writeText(text)
  if (!write) return
  void write.then(() => markCopied(), () => {})
}

function downloadSvg() {
  if (!svgHtml.value) return
  let svg = svgHtml.value.trim()
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`
  const base = store.state.meta.name || store.state.meta.id || store.currentModelId
  const clean = base.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'diagram'
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clean}.mermaid.svg`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

watch(source, () => {
  renderedKey.value = ''
  if (view.value === 'diagram') void renderDiagram()
})

watch(() => store.layout.theme, () => {
  renderedKey.value = ''
  if (view.value === 'diagram') void renderDiagram()
})

function onSystemTheme() {
  if (store.layout.theme !== 'system') return
  renderedKey.value = ''
  if (view.value === 'diagram') void renderDiagram()
}

onMounted(() => {
  systemMedia.addEventListener('change', onSystemTheme)
  void nextTick(() => panelEl.value?.focus())
})

onUnmounted(() => {
  systemMedia.removeEventListener('change', onSystemTheme)
  if (copiedTimer) clearTimeout(copiedTimer)
  renderSeq += 1
})
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <div
        ref="panelEl"
        class="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mermaid-export-title"
        tabindex="-1"
        @keydown.escape="emit('close')"
      >
        <div class="header">
          <span id="mermaid-export-title" class="title">Mermaid</span>
          <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')"><X :size="16" /></button>
        </div>

        <div class="toolbar">
          <div class="btn-group">
            <button
              type="button"
              class="btn"
              :class="{ active: view === 'code' }"
              @click="view = 'code'"
            >Code</button>
            <button
              type="button"
              class="btn"
              :class="{ active: view === 'diagram' }"
              @click="showDiagram"
            >Diagram</button>
          </div>
        </div>

        <div class="body">
          <pre
            v-if="view === 'code'"
            class="mmd-preview"
            aria-label="Mermaid code (read-only)"
            v-html="highlightedHtml"
          />
          <div v-else class="diagram-pane">
            <div v-if="isEmpty" class="diagram-state">No tables in this view.</div>
            <div v-else-if="rendering" class="diagram-state">Rendering…</div>
            <div v-else-if="renderError" class="diagram-state error">{{ renderError }}</div>
            <div v-else class="diagram-frame" v-html="svgHtml" />
          </div>
        </div>

        <div class="action-bar">
          <button
            v-if="view === 'code'"
            type="button"
            class="action-btn"
            @click="copyCode"
          >{{ copied ? 'Copied' : 'Copy' }}</button>
          <button
            v-else
            type="button"
            class="action-btn"
            :disabled="!svgHtml || rendering || !!renderError"
            @click="downloadSvg"
          >Download</button>
        </div>

        <div ref="renderHost" class="render-host" aria-hidden="true" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  height: min(85vh, 720px);
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  outline: none;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-panel-border);
}

.title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  line-height: 1;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.icon-btn:hover {
  color: var(--c-btn-fg);
}

.toolbar {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 12px 16px 0;
}

.btn-group {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
  width: 100%;
  max-width: 240px;
}

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

.action-bar {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 12px 16px 16px;
}

.action-btn {
  min-width: 96px;
  padding: 5px 14px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.action-btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.body {
  flex: 1;
  min-height: 0;
  margin: 12px 16px 0;
  border: 1px solid var(--c-panel-border);
  border-radius: 6px;
  background: var(--c-canvas-bg);
  overflow: auto;
}

.mmd-preview {
  margin: 0;
  padding: 10px;
  min-height: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-wrap: break-word;
  tab-size: 2;
  color: var(--c-field-name);
  background: transparent;
}

.diagram-pane {
  min-height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.diagram-state {
  margin: auto;
  font-size: 12px;
  color: var(--c-panel-label);
  text-align: center;
}

.diagram-state.error {
  color: #b91c1c;
  max-width: 420px;
}

:global(html[data-theme='dark']) .diagram-state.error {
  color: #f87171;
}

.diagram-frame {
  width: 100%;
}

.diagram-frame :deep(svg) {
  display: block;
  margin: 0 auto;
  max-width: none;
  height: auto;
}

.render-host {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>

<style>
.mmd-preview .tok-kw      { color: #1d4ed8; font-weight: 600; }
.mmd-preview .tok-table   { color: #0f766e; }
.mmd-preview .tok-type    { color: #15803d; }
.mmd-preview .tok-pk      { color: #b45309; font-weight: 600; }
.mmd-preview .tok-op      { color: #7c3aed; }
.mmd-preview .tok-comment { color: var(--c-panel-label); font-style: italic; }
.mmd-preview .tok-str     { color: #0e7490; }

html[data-theme='dark'] .mmd-preview .tok-kw    { color: #60a5fa; }
html[data-theme='dark'] .mmd-preview .tok-table { color: #2dd4bf; }
html[data-theme='dark'] .mmd-preview .tok-type  { color: #4ade80; }
html[data-theme='dark'] .mmd-preview .tok-pk    { color: #fbbf24; }
html[data-theme='dark'] .mmd-preview .tok-op    { color: #c084fc; }
html[data-theme='dark'] .mmd-preview .tok-str   { color: #22d3ee; }
</style>
