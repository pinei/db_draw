<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import { generateDbml, generateMermaid } from '../utils/codePlaceholder'
import { highlightDbml, highlightMermaid } from '../utils/dbmlHighlight'
import { validateDbml } from '../utils/persist'
import type { CodeFormat } from '../model/types'

const store = useDiagramStore()
const layout = computed(() => store.layout)
const panelEl = ref<HTMLDivElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)

// Clear inline height set by CSS resize so collapse always works
watch(() => layout.value.codePanelOpen, (open) => {
  if (!open && panelEl.value) {
    panelEl.value.style.height = ''
    panelEl.value.style.width = ''
  }
})

const formatOptions: { value: CodeFormat; label: string }[] = [
  { value: 'dbml',    label: 'DBML' },
  { value: 'mermaid', label: 'Mermaid' },
]

// Local draft kept in sync with external schema changes (e.g. loadState)
const draftDbml = ref('')
watch(
  () => generateDbml(store.state.schema),
  (generated) => { draftDbml.value = generated },
  { immediate: true },
)

const isEditable = computed(() => layout.value.codeFormat === 'dbml')

const codeText = computed(() =>
  layout.value.codeFormat === 'dbml'
    ? draftDbml.value
    : generateMermaid(store.state.schema),
)

const parseStatus = ref<'idle' | 'success' | 'error'>('idle')
const parseMessage = ref('')

// ─── Syntax highlighting (read-only <pre>, swapped in on focus) ─────────────
// The highlighters only know the live schema's table names, so generated AND
// hand-typed references highlight exactly. Editing swaps the <pre> for the
// plain <textarea> (no fragile transparent-overlay scroll sync to maintain).

const tableNames = computed(() => store.state.schema.entities.map((e) => e.name))

const highlightedHtml = computed(() => {
  const isDbml = layout.value.codeFormat === 'dbml'
  const src = isDbml ? draftDbml.value : generateMermaid(store.state.schema)
  const html = isDbml
    ? highlightDbml(src, tableNames.value)
    : highlightMermaid(src, tableNames.value)
  // <pre> drops a trailing newline — keep it so the last line never collapses
  return src.endsWith('\n') ? html + '\n' : html
})

const previewHint = computed(() =>
  layout.value.codeFormat === 'dbml'
    ? `${layout.value.codeFormat.toUpperCase()} code (highlighted — click to edit)`
    : `${layout.value.codeFormat.toUpperCase()} code (highlighted, read-only)`,
)

const editing = ref(false)

function startEdit() {
  if (!isEditable.value || editing.value) return
  editing.value = true
  nextTick(() => textareaEl.value?.focus())
}

function stopEdit() {
  editing.value = false
}

function blurOnEscape(e: KeyboardEvent) {
  (e.target as HTMLTextAreaElement).blur()
}

function onInput(e: Event) {
  draftDbml.value = (e.target as HTMLTextAreaElement).value
}

// Clear parse message when user edits DBML
watch(() => draftDbml.value, () => {
  parseStatus.value = 'idle'
  parseMessage.value = ''
})

function handleApply() {
  const result = validateDbml(draftDbml.value)
  if (result.success) {
    parseStatus.value = 'success'
    parseMessage.value = result.message
  } else {
    parseStatus.value = 'error'
    parseMessage.value = result.message
  }
}
</script>

<template>
  <div ref="panelEl" class="code-panel" :class="{ expanded: layout.codePanelOpen, collapsed: !layout.codePanelOpen }">
    <div class="panel-header" @click="store.toggleCodePanel()">
      <span class="panel-title">
        <span class="panel-icon">⟨/⟩</span>
        Diagram Code
      </span>
      <button class="collapse-btn" :title="layout.codePanelOpen ? 'Collapse' : 'Expand'">
        {{ layout.codePanelOpen ? '▾' : '▸' }}
      </button>
    </div>

    <Transition name="panel-slide">
      <div v-if="layout.codePanelOpen" class="panel-body">
        <div class="format-row">
          <div class="btn-group">
            <button
              v-for="opt in formatOptions"
              :key="opt.value"
              class="btn"
              :class="{ active: layout.codeFormat === opt.value }"
              @click.stop="store.setCodeFormat(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="code-area-wrapper">
          <pre
            v-if="!editing"
            class="code-preview"
            :class="{ editable: isEditable }"
            tabindex="0"
            :aria-label="previewHint"
            @click="startEdit"
            @focus="startEdit"
            v-html="highlightedHtml"
          /><!--
       --><textarea
            v-else
            ref="textareaEl"
            class="code-area"
            :value="codeText"
            spellcheck="false"
            :aria-label="`${layout.codeFormat.toUpperCase()} code`"
            @input="onInput"
            @blur="stopEdit"
            @keydown.escape="blurOnEscape"
          />
        </div>

        <button class="btn apply-btn" :disabled="!isEditable" @click="handleApply">Apply</button>

        <div v-if="parseStatus !== 'idle'" class="parse-message" :class="parseStatus">
          {{ parseMessage }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.code-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
  width: 280px;
  min-width: 220px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  resize: both;
}

.code-panel.expanded {
  min-height: 52vh;
}

.code-panel.collapsed {
  resize: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  min-height: 36px;
}

.panel-header:hover {
  background: var(--c-btn-hover-bg);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.panel-icon {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--c-btn-active-bg);
  letter-spacing: -0.05em;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--c-panel-label);
  padding: 0 2px;
  line-height: 1;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px;
  border-top: 1px solid var(--c-panel-border);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.format-row {
  padding-top: 10px;
}

.btn-group {
  display: flex;
  gap: 4px;
}

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
}

.btn:hover {
  background: var(--c-btn-hover-bg);
}

.btn.active {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  border-color: var(--c-btn-active-border);
}

.code-area-wrapper {
  position: relative;
  flex: 1;
  min-height: 200px;
  width: 100%;
  border: 1px solid var(--c-panel-border);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.code-area {
  flex: 1;
  width: 100%;
  resize: none;
  box-sizing: border-box;
  padding: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  background: var(--c-canvas-bg);
  color: var(--c-field-name);
  border: none;
  outline: none;
  cursor: default;
  tab-size: 2;
  overflow: auto;
  margin: 0;
}

.code-area.editable {
  cursor: text;
}

/* Read-only highlighted view — same metrics as .code-area so focus/blur
   swapping never shifts the layout; only the spans add color */
.code-preview {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  background: var(--c-canvas-bg);
  color: var(--c-field-name);
  white-space: pre;
  tab-size: 2;
  overflow: auto;
  cursor: default;
  outline: none;
}

.code-preview.editable {
  cursor: text;
}

.apply-btn {
  width: 100%;
  padding: 6px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  transition: background 0.12s;
  flex: none;
}

.apply-btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.apply-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.parse-message {
  font-size: 10px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 4px;
  transition: color 0.2s, background 0.2s;
}

.parse-message.success {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}

.parse-message.error {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

/* ── Collapse transition ─────────────────────────────────────── */

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: max-height 0.2s ease, opacity 0.15s ease;
  max-height: 100vh;
  overflow: hidden;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>

<style>
/* ── Highlight tokens (unscoped: spans are injected via v-html) ───────────── */
.code-preview .tok-kw      { color: #1d4ed8; font-weight: 600; }
.code-preview .tok-table   { color: #0f766e; }
.code-preview .tok-type    { color: #15803d; }
.code-preview .tok-pk      { color: #b45309; font-weight: 600; }
.code-preview .tok-annot   { color: #475569; }
.code-preview .tok-op      { color: #7c3aed; }
.code-preview .tok-comment { color: var(--c-panel-label); font-style: italic; }
.code-preview .tok-str     { color: #0e7490; }
.code-preview .tok-num     { color: #9333ea; }

html[data-theme='dark'] .code-preview .tok-kw      { color: #60a5fa; }
html[data-theme='dark'] .code-preview .tok-table   { color: #2dd4bf; }
html[data-theme='dark'] .code-preview .tok-type    { color: #4ade80; }
html[data-theme='dark'] .code-preview .tok-pk      { color: #fbbf24; }
html[data-theme='dark'] .code-preview .tok-annot   { color: #94a3b8; }
html[data-theme='dark'] .code-preview .tok-op      { color: #c084fc; }
html[data-theme='dark'] .code-preview .tok-str     { color: #22d3ee; }
html[data-theme='dark'] .code-preview .tok-num     { color: #d8b4fe; }
</style>
