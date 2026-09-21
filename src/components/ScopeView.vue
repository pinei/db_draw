<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight, Pencil, Plus, Scan, Table as TableIcon, Trash2, X } from 'lucide-vue-next'
import { useDiagramStore } from '../stores/diagram'

const store = useDiagramStore()
const scopes = computed(() => Object.values(store.state.scopes).sort((a, b) => a.name.localeCompare(b.name)))
const entities = computed(() => store.state.schema.entities)
const activeId = computed(() => store.activeScopeId)
const busy = ref(false)
const message = ref('')

// ─── Expanded tree nodes (scope ids). The active scope is always expanded. ───
const expandedIds = ref<Set<string>>(new Set())

function isExpanded(id: string): boolean {
  return id === activeId.value || expandedIds.value.has(id)
}

function toggleExpanded(id: string) {
  if (id === activeId.value) return
  if (expandedIds.value.has(id)) expandedIds.value.delete(id)
  else expandedIds.value.add(id)
}

// ─── Create ──────────────────────────────────────────────────────────────────
const newName = ref('')

async function create() {
  const name = newName.value.trim()
  if (!name || busy.value) return
  busy.value = true
  message.value = ''
  const result = await store.createScope(name)
  busy.value = false
  if (!result.success) {
    message.value = result.message ?? 'Failed to create scope'
    return
  }
  newName.value = ''
}

// ─── Rename (inline) ─────────────────────────────────────────────────────────
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

function startRename(id: string, name: string) {
  renamingId.value = id
  renameDraft.value = name
}

async function commitRename(id: string) {
  if (renamingId.value !== id) return
  renamingId.value = null
  const result = await store.renameScope(id, renameDraft.value)
  if (!result.success) message.value = result.message ?? 'Failed to rename scope'
}

function cancelRename() {
  renamingId.value = null
}

// ─── Delete (two-step confirm) ───────────────────────────────────────────────
const confirmDeleteId = ref<string | null>(null)

async function remove(id: string) {
  if (confirmDeleteId.value !== id) {
    confirmDeleteId.value = id
    return
  }
  confirmDeleteId.value = null
  busy.value = true
  const result = await store.deleteScope(id)
  busy.value = false
  if (!result.success) message.value = result.message ?? 'Failed to delete scope'
}
</script>

<template>
  <div class="scope-view">
    <div class="scope-create">
      <input
        v-model="newName"
        class="inline-input"
        placeholder="New scope name ⏎"
        aria-label="New scope name"
        :disabled="busy"
        @keydown.enter="create"
      />
      <button
        type="button"
        class="btn primary icon"
        title="Create scope"
        aria-label="Create scope"
        :disabled="busy || !newName.trim()"
        @click="create"
      >
        <Plus :size="14" />
      </button>
    </div>

    <div v-if="!scopes.length" class="scope-empty">
      <Scan :size="28" class="scope-icon" aria-hidden="true" />
      <p class="scope-text">
        Scopes are named views over a subset of tables — create one above,
        expand it to check tables into its diagram, then open it to rearrange
        freely. Connector edits are copied from the main diagram at creation
        and diverge afterwards.
      </p>
    </div>

    <div v-else role="tree" aria-label="Scopes" class="scope-tree">
      <div v-for="scope in scopes" :key="scope.id" class="tree-scope">
        <div
          class="tree-row level-1"
          :class="{ active: scope.id === activeId }"
          role="treeitem"
          :aria-expanded="isExpanded(scope.id)"
          :aria-selected="scope.id === activeId"
        >
          <button
            type="button"
            class="twisty"
            :aria-label="isExpanded(scope.id) ? `Collapse ${scope.name}` : `Expand ${scope.name}`"
            @click="toggleExpanded(scope.id)"
          >
            <ChevronDown v-if="isExpanded(scope.id)" :size="14" />
            <ChevronRight v-else :size="14" />
          </button>
          <button
            type="button"
            class="scope-open"
            :title="scope.id === activeId ? 'Viewing this scope (click to exit)' : 'Open scope in diagram'"
            @click="store.setActiveScope(scope.id === activeId ? null : scope.id)"
          >
            <span v-if="renamingId !== scope.id" class="scope-name">{{ scope.name }}</span>
            <input
              v-else
              v-model="renameDraft"
              class="inline-input"
              aria-label="Scope name"
              @click.stop
              @keydown.enter="commitRename(scope.id)"
              @keydown.escape="cancelRename"
              @blur="commitRename(scope.id)"
            />
          </button>
          <span class="scope-count" :title="`${scope.entityIds.length} tables in scope`">{{ scope.entityIds.length }}</span>
          <span class="row-actions">
            <button
              v-if="renamingId !== scope.id"
              type="button"
              class="mini-btn"
              title="Rename scope"
              aria-label="Rename scope"
              @click="startRename(scope.id, scope.name)"
            >
              <Pencil :size="12" />
            </button>
            <button
              type="button"
              class="mini-btn danger"
              :title="confirmDeleteId === scope.id ? 'Click again to confirm delete' : 'Delete scope'"
              :aria-label="confirmDeleteId === scope.id ? 'Confirm delete scope' : 'Delete scope'"
              @click="remove(scope.id)"
            >
              <X v-if="confirmDeleteId !== scope.id" :size="12" />
              <Trash2 v-else :size="12" />
            </button>
          </span>
        </div>
        <div v-if="isExpanded(scope.id)" role="group" class="tree-children">
          <label v-for="entity in entities" :key="entity.id" class="tree-row level-2">
            <input
              type="checkbox"
              :checked="scope.entityIds.includes(entity.id)"
              @change="store.toggleScopeEntity(scope.id, entity.id)"
            />
            <TableIcon :size="13" class="table-icon" aria-hidden="true" />
            <span class="check-name">{{ entity.name }}</span>
          </label>
          <div v-if="!entities.length" class="tree-empty">No tables in the model.</div>
        </div>
      </div>
    </div>

    <div v-if="message" class="scope-message">{{ message }}</div>
  </div>
</template>

<style scoped>
.scope-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.scope-create {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.inline-input {
  font-family: inherit;
  font-size: 12px;
  color: var(--c-field-name);
  background: var(--c-canvas-bg);
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  padding: 5px 8px;
  outline: none;
  min-width: 0;
  flex: 1;
}

.inline-input:focus {
  border-color: var(--c-btn-active-border);
}

.btn {
  padding: 5px 12px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  flex-shrink: 0;
}

.btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn.primary {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  border-color: var(--c-btn-active-border);
}

.btn.icon {
  display: inline-flex;
  align-items: center;
  padding: 5px 8px;
}

.scope-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 12px;
  text-align: center;
}

.scope-icon {
  color: var(--c-panel-label);
}

.scope-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-panel-label);
}

/* ── Two-level tree ────────────────────────────────────────────────────────── */
.scope-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  min-width: 0;
}

.level-1 {
  padding: 3px 4px 3px 0;
}

.level-1:hover {
  background: var(--c-btn-hover-bg);
}

.level-1.active {
  background: var(--c-btn-hover-bg);
  outline: 1px solid var(--c-btn-active-border);
}

.twisty {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  padding: 3px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  flex-shrink: 0;
}

.twisty:hover {
  color: var(--c-btn-fg);
}

.scope-open {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 2px 0;
  font-family: inherit;
}

.scope-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.scope-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-panel-label);
  flex-shrink: 0;
  min-width: 16px;
  text-align: right;
}

.row-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.level-1:hover .row-actions,
.level-1:focus-within .row-actions {
  display: inline-flex;
}

.mini-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  padding: 3px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
}

.mini-btn:hover {
  color: var(--c-btn-fg);
  background: var(--c-btn-hover-bg);
}

.mini-btn.danger:hover {
  color: #f87171;
}

.tree-children {
  display: flex;
  flex-direction: column;
  margin-left: 17px;
  border-left: 1px solid var(--c-btn-border);
  padding-left: 4px;
}

.level-2 {
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
  gap: 7px;
}

.level-2:hover {
  background: var(--c-btn-hover-bg);
}

.level-2 input[type='checkbox'] {
  accent-color: var(--c-btn-active-bg);
  margin: 0;
  flex-shrink: 0;
}

.table-icon {
  color: var(--c-panel-label);
  flex-shrink: 0;
}

.check-name {
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-empty {
  font-size: 11px;
  font-style: italic;
  color: var(--c-panel-label);
  padding: 4px 6px;
}

.scope-message {
  font-size: 11px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 5px;
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  flex-shrink: 0;
}
</style>
