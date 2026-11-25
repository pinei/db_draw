<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Annotation, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { CircleQuestionMark, X } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'
import { generateDbml } from '../utils/codePlaceholder'
import type { DbmlApplyStats, DbmlIssueLine } from '../utils/dbmlImport'
import { dbmlSupport } from '../utils/dbmlLanguage'

const store = useDiagramStore()
const editorHost = ref<HTMLElement | null>(null)
let editor: EditorView | null = null

const schemaSync = Annotation.define<boolean>()
const setErrorLines = StateEffect.define<DecorationSet>()
const errorLine = Decoration.line({ class: 'dbml-error-line' })
const errorDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLines)) return effect.value
    }
    return transaction.docChanged ? Decoration.none : decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})

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

function clearApplyResult() {
  parseStatus.value = 'idle'
  parseMessage.value = ''
  applyStats.value = null
  applyIssues.value = []
}

function dismissApplyResult() {
  clearApplyResult()
  editor?.dispatch({ effects: setErrorLines.of(Decoration.none) })
}

function createEditorState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'DBML code', spellcheck: 'false' }),
      lineNumbers(),
      history(),
      dbmlSupport,
      errorDecorations,
      keymap.of([
        { key: 'Escape', run: (view) => { view.contentDOM.blur(); return true } },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.transactions.some((transaction) => transaction.docChanged && !transaction.annotation(schemaSync))) {
          clearApplyResult()
        }
      }),
    ],
  })
}

const generatedDbml = computed(() => generateDbml(store.state.schema))

onMounted(() => {
  if (editorHost.value) {
    editor = new EditorView({ parent: editorHost.value, state: createEditorState(generatedDbml.value) })
  }
})

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})

watch([() => store.currentModelId, generatedDbml], ([modelId, generated], [previousModelId]) => {
  if (!editor) return
  if (modelId !== previousModelId) {
    clearApplyResult()
    editor.setState(createEditorState(generated))
  } else if (editor.state.doc.toString() !== generated) {
    if (parseStatus.value === 'error') clearApplyResult()
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: generated },
      annotations: [schemaSync.of(true), Transaction.addToHistory.of(false)],
    })
  }
})

function handleApply() {
  // Single-step incremental sync: validates, diffs by exact name and patches
  // the schema in one mutation. Matched ids (hence layout) are preserved; the
  // draft resyncs from the new schema through the generateDbml watcher.
  const view = editor
  if (!view) return
  const result = store.applyDbml(view.state.doc.toString())
  if (result.success) {
    parseStatus.value = 'success'
    parseMessage.value = ''
    applyStats.value = result.stats
    applyIssues.value = []
    view.dispatch({ effects: setErrorLines.of(Decoration.none) })
  } else {
    parseStatus.value = 'error'
    parseMessage.value = result.message
    applyStats.value = null
    applyIssues.value = result.issues
    const doc = view.state.doc
    const lines = [...new Set(result.issues.map(({ line }) => line))]
      .filter((line) => line >= 1 && line <= doc.lines)
    const positions = lines.map((line) => doc.line(line).from)
    view.dispatch({ effects: setErrorLines.of(Decoration.set(positions.map((pos) => errorLine.range(pos)), true)) })
    const first = positions[0]
    if (first !== undefined) {
      nextTick(() => {
        if (editor !== view || view.state.doc !== doc) return
        view.focus()
        view.dispatch({ selection: { anchor: first }, effects: EditorView.scrollIntoView(first, { y: 'center' }) })
      })
    }
  }
}
</script>

<template>
  <div class="code-view">
        <a
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

        <div ref="editorHost" class="code-area-wrapper" />

        <button class="apply-btn" @click="handleApply">Apply</button>

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

.code-area-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--c-panel-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--c-canvas-bg);
}

.code-area-wrapper:focus-within {
  border-color: var(--c-entity-border-hover);
}

.code-area-wrapper :deep(.cm-editor) {
  height: 100%;
  font-size: 11px;
  color: var(--c-field-name);
}

.code-area-wrapper :deep(.cm-editor.cm-focused) {
  outline: none;
}

.code-area-wrapper :deep(.cm-scroller) {
  font-family: var(--font-mono);
  line-height: 1.6;
}

.code-area-wrapper :deep(.cm-content) {
  padding-block: 10px;
  caret-color: var(--c-field-name);
}

.code-area-wrapper :deep(.cm-gutters) {
  background: var(--c-canvas-bg);
  color: var(--c-panel-label);
  border-color: var(--c-panel-border);
}

.code-area-wrapper {
  --c-dbml-keyword: #1d4ed8;
  --c-dbml-table: #0e6471;
  --c-dbml-type: #166534;
  --c-dbml-setting: #6b21a8;
  --c-dbml-operator: #9a3412;
  --c-dbml-string: #9d174d;
  --c-dbml-value: #854d0e;
  --c-dbml-comment: #526074;
}

:global(html[data-theme='dark'] .code-area-wrapper) {
  --c-dbml-keyword: #93c5fd;
  --c-dbml-table: #67e8f9;
  --c-dbml-type: #86efac;
  --c-dbml-setting: #d8b4fe;
  --c-dbml-operator: #fdba74;
  --c-dbml-string: #f9a8d4;
  --c-dbml-value: #fde68a;
  --c-dbml-comment: #a7b3c5;
}

.code-area-wrapper :deep(.dbml-keyword) { color: var(--c-dbml-keyword); }
.code-area-wrapper :deep(.dbml-table) { color: var(--c-dbml-table); }
.code-area-wrapper :deep(.dbml-field) { color: var(--c-field-name); }
.code-area-wrapper :deep(.dbml-type) { color: var(--c-dbml-type); }
.code-area-wrapper :deep(.dbml-setting) { color: var(--c-dbml-setting); }
.code-area-wrapper :deep(.dbml-operator) { color: var(--c-dbml-operator); }
.code-area-wrapper :deep(.dbml-string) { color: var(--c-dbml-string); }
.code-area-wrapper :deep(.dbml-value) { color: var(--c-dbml-value); }
.code-area-wrapper :deep(.dbml-comment) { color: var(--c-dbml-comment); }

.code-area-wrapper :deep(.dbml-error-line) {
  background: rgba(239, 68, 68, 0.22);
  box-shadow: inset 2px 0 0 #ef4444;
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

.apply-btn:hover {
  background: var(--c-btn-hover-bg);
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
