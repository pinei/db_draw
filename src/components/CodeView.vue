<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CircleQuestionMark, X } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'
import { generateDbml, generateMermaid } from '../utils/codePlaceholder'
import { highlightDbml, highlightMermaid } from '../utils/dbmlHighlight'
import type { CodeFormat } from '../model/types'
import type { DbmlApplyStats, DbmlIssueLine } from '../utils/dbmlImport'

const store = useDiagramStore()
const layout = computed(() => store.layout)
const textareaEl = ref<HTMLTextAreaElement | null>(null)

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
const applyStats = ref<DbmlApplyStats | null>(null)
const applyIssues = ref<DbmlIssueLine[]>([])

type DiffLine = { kind: 'added' | 'removed' | 'updated'; n: number; label: string }

function diffLines(added: number, removed: number, updated: number): DiffLine[] {
  const lines: DiffLine[] = []
  if (added) lines.push({ kind: 'added', n: added, label: 'added' })
  if (removed) lines.push({ kind: 'removed', n: removed, label: 'removed' })
  if (updated) lines.push({ kind: 'updated', n: updated, label: 'updated' })
  return lines
}

const tableDiff = computed(() => {
  const s = applyStats.value
  if (!s) return []
  return diffLines(s.createdEntities, s.removedEntities, s.changedEntities)
})

const relDiff = computed(() => {
  const s = applyStats.value
  if (!s) return []
  return diffLines(s.createdRels, s.removedRels, s.changedRels)
})

const applyUnchanged = computed(() =>
  !!applyStats.value && tableDiff.value.length === 0 && relDiff.value.length === 0,
)

const errorLines = computed(() => {
  if (applyIssues.value.length) return applyIssues.value.map((e) => e.message)
  return parseMessage.value
    .replace(/^✗\s*/, '')
    .split(/\n|; /)
    .map((s) => s.trim())
    .filter(Boolean)
})

const errorLineSet = computed(() => {
  const set = new Set<number>()
  for (const e of applyIssues.value) {
    if (e.line > 0) set.add(e.line)
  }
  return set
})

function dismissApplyResult() {
  parseStatus.value = 'idle'
  parseMessage.value = ''
  applyStats.value = null
  applyIssues.value = []
}

// ─── Syntax highlighting (overlay) ───────────────────────────────────────────
// Highlighted <pre> sits under a transparent <textarea> (DBML only). Same font
// metrics + scroll sync keep caret and tokens aligned while typing. Mermaid
// stays read-only on the <pre> alone. Table names come from the live schema.

const tableNames = computed(() => store.state.schema.entities.map((e) => e.name))

const highlightedHtml = computed(() => {
  const isDbml = layout.value.codeFormat === 'dbml'
  const src = isDbml ? draftDbml.value : generateMermaid(store.state.schema)
  const html = isDbml
    ? highlightDbml(src, tableNames.value, errorLineSet.value)
    : highlightMermaid(src, tableNames.value)
  // <pre> drops a trailing newline — keep it so the last line never collapses
  return src.endsWith('\n') ? html + '\n' : html
})

const previewEl = ref<HTMLElement | null>(null)

function syncScroll() {
  const ta = textareaEl.value
  const pre = previewEl.value
  if (!ta || !pre) return
  pre.scrollTop = ta.scrollTop
  pre.scrollLeft = ta.scrollLeft
}

function onInput(e: Event) {
  draftDbml.value = (e.target as HTMLTextAreaElement).value
  // User edits invalidate the last Apply banner; schema→draft sync after
  // Apply must NOT (that used to clear the banner in the same tick).
  dismissApplyResult()
  // Re-highlight can change wrap height; keep layers locked after paint
  nextTick(syncScroll)
}

function blurOnEscape(e: KeyboardEvent) {
  (e.target as HTMLTextAreaElement).blur()
}

function handleApply() {
  // Single-step incremental sync: validates, diffs by exact name and patches
  // the schema in one mutation. Matched ids (hence layout) are preserved; the
  // draft resyncs from the new schema through the generateDbml watcher.
  const result = store.applyDbml(draftDbml.value)
  if (result.success) {
    parseStatus.value = 'success'
    parseMessage.value = ''
    applyStats.value = result.stats
    applyIssues.value = []
  } else {
    parseStatus.value = 'error'
    parseMessage.value = result.message
    applyStats.value = null
    applyIssues.value = result.issues
    const first = result.issues[0]?.line
    if (first) nextTick(() => scrollToLine(first))
  }
}

function scrollToLine(line: number) {
  const ta = textareaEl.value
  if (!ta || line < 1) return
  const text = ta.value
  let pos = 0
  for (let i = 1; i < line; i++) {
    const next = text.indexOf('\n', pos)
    if (next < 0) { pos = text.length; break }
    pos = next + 1
  }
  ta.focus()
  ta.setSelectionRange(pos, pos)
  // Approximate scroll: line height from computed style
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18
  const pad = parseFloat(getComputedStyle(ta).paddingTop) || 0
  ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 3 + pad)
  syncScroll()
}
</script>

<template>
  <div class="code-view">
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

        <a
          v-if="layout.codeFormat === 'dbml'"
          class="docs-link"
          href="https://dbml.dbdiagram.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          title="Open DBML syntax documentation"
          @click.stop
        >
          <CircleQuestionMark :size="14" class="docs-icon" aria-hidden="true" />
          DBML Syntax
        </a>

        <div class="code-area-wrapper">
          <pre
            ref="previewEl"
            class="code-layer code-preview"
            :class="{ backdrop: isEditable }"
            :aria-hidden="isEditable ? 'true' : undefined"
            :aria-label="isEditable ? undefined : 'Mermaid code (read-only)'"
            v-html="highlightedHtml"
          />
          <textarea
            v-if="isEditable"
            ref="textareaEl"
            class="code-layer code-area"
            :value="codeText"
            spellcheck="false"
            wrap="soft"
            aria-label="DBML code"
            @input="onInput"
            @scroll="syncScroll"
            @keydown.escape="blurOnEscape"
          />
        </div>

        <button class="apply-btn" :disabled="!isEditable" @click="handleApply">Apply</button>

        <div v-if="parseStatus === 'success' && applyStats" class="parse-message success">
          <button type="button" class="apply-dismiss" title="Dismiss" aria-label="Dismiss" @click="dismissApplyResult"><X :size="12" /></button>
          <div class="apply-title">Applied</div>
          <div class="apply-totals">
            {{ applyStats.tables }} {{ applyStats.tables === 1 ? 'table' : 'tables' }}
            ·
            {{ applyStats.rels }} {{ applyStats.rels === 1 ? 'relationship' : 'relationships' }}
          </div>
          <div v-if="applyUnchanged" class="apply-note">No changes</div>
          <div v-else class="apply-diff">
            <div v-if="tableDiff.length" class="apply-col">
              <div class="apply-col-label">Tables</div>
              <ul>
                <li v-for="line in tableDiff" :key="'t-' + line.kind" :class="line.kind">
                  <span class="diff-n">{{ line.n }}</span> {{ line.label }}
                </li>
              </ul>
            </div>
            <div v-if="relDiff.length" class="apply-col">
              <div class="apply-col-label">Relationships</div>
              <ul>
                <li v-for="line in relDiff" :key="'r-' + line.kind" :class="line.kind">
                  <span class="diff-n">{{ line.n }}</span> {{ line.label }}
                </li>
              </ul>
            </div>
          </div>
          <div v-if="applyStats.ignored > 0" class="apply-note muted">
            {{ applyStats.ignored }} unsupported {{ applyStats.ignored === 1 ? 'item' : 'items' }} skipped
          </div>
        </div>

        <div v-else-if="parseStatus === 'error'" class="parse-message error">
          <button type="button" class="apply-dismiss" title="Dismiss" aria-label="Dismiss" @click="dismissApplyResult"><X :size="12" /></button>
          <div class="apply-title error-title">Could not apply</div>
          <ul class="error-list">
            <li v-for="(line, i) in errorLines" :key="i">{{ line }}</li>
          </ul>
        </div>
  </div>
</template>

<style scoped>
/* Content root: fills the shell's content area (the shell owns position,
   size, collapse and resize). */
.code-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.format-row {
  padding-top: 10px;
}

/* Buttons keep a standard max width and stay centered as the dock widens. */
.btn-group {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
  width: 100%;
  max-width: 240px;
  margin-inline: auto;
}

.docs-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: 10px;
  font-weight: 600;
  color: var(--c-panel-label);
  text-decoration: none;
  white-space: nowrap;
}

.docs-link:hover {
  color: var(--c-entity-border-hover);
}

.docs-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-group .btn {
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

.btn-group .btn:last-child {
  border-right: none;
}

.btn-group .btn:hover {
  background: var(--c-btn-hover-bg);
}

.btn-group .btn.active {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
}

.code-area-wrapper {
  position: relative;
  flex: 1;
  min-height: 200px;
  width: 100%;
  border: 1px solid var(--c-panel-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--c-canvas-bg);
}

/* Shared box for highlight <pre> and edit <textarea> — identical metrics so
   soft-wrap and caret stay aligned. Both are absolute fills of the wrapper. */
.code-layer {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 10px;
  border: none;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-wrap: break-word;
  tab-size: 2;
  overflow: auto;
  scrollbar-gutter: stable;
}

.code-preview {
  background: transparent;
  color: var(--c-field-name);
  cursor: default;
  outline: none;
  z-index: 0;
}

/* Under the textarea: ignore pointer + hide scrollbar (textarea scrolls). */
.code-preview.backdrop {
  pointer-events: none;
  scrollbar-width: none;
}

.code-preview.backdrop::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.code-area {
  z-index: 1;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--c-field-name);
  outline: none;
  cursor: text;
}

.code-area::selection {
  background: color-mix(in srgb, var(--c-btn-active-bg) 35%, transparent);
  color: transparent;
}

.apply-btn {
  width: 100%;
  max-width: 240px;
  margin-inline: auto;
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
  position: relative;
  font-size: 10px;
  line-height: 1.45;
  padding: 8px 28px 8px 10px;
  border-radius: 6px;
  margin-top: 4px;
  transition: color 0.2s, background 0.2s;
}

.parse-message.success {
  color: var(--c-field-name);
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
}

.parse-message.error {
  color: #991b1b;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.4);
}

html[data-theme='dark'] .parse-message.error {
  color: #fecaca;
}

.apply-title.error-title {
  color: #dc2626;
}

html[data-theme='dark'] .apply-title.error-title {
  color: #f87171;
}

.error-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: inherit;
  max-height: 160px;
  overflow: auto;
}

.error-list li {
  word-break: break-word;
}

.apply-dismiss {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--c-field-type);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.apply-dismiss:hover {
  background: rgba(127, 127, 127, 0.18);
  color: var(--c-field-name);
}

.apply-title {
  font-size: 12px;
  font-weight: 700;
  color: #15803d;
  letter-spacing: 0.01em;
}

html[data-theme='dark'] .apply-title {
  color: #4ade80;
}

.apply-totals {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--c-field-name);
}

.apply-note {
  margin-top: 6px;
  color: var(--c-field-type);
}

.apply-note.muted {
  font-size: 9px;
  color: var(--c-field-type);
}

.apply-diff {
  display: flex;
  gap: 14px;
  margin-top: 8px;
}

.apply-col-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-field-type);
  margin-bottom: 3px;
}

.apply-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.apply-col li {
  font-size: 11px;
  font-weight: 500;
  color: var(--c-field-name);
}

.apply-col .diff-n {
  display: inline-block;
  min-width: 1.1em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.apply-col li.added { color: #15803d; }
.apply-col li.removed { color: #b91c1c; }
.apply-col li.updated { color: #a16207; }

.apply-col li.added .diff-n,
.apply-col li.removed .diff-n,
.apply-col li.updated .diff-n {
  color: inherit;
}

html[data-theme='dark'] .apply-col li.added { color: #4ade80; }
html[data-theme='dark'] .apply-col li.removed { color: #f87171; }
html[data-theme='dark'] .apply-col li.updated { color: #fbbf24; }
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

.code-preview .tok-err-line {
  background: rgba(239, 68, 68, 0.55);
  box-shadow: inset 3px 0 0 #ef4444;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

html[data-theme='dark'] .code-preview .tok-err-line {
  background: rgba(239, 68, 68, 0.42);
  box-shadow: inset 3px 0 0 #f87171;
}
</style>
