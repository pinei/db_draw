<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import { listModels } from '../utils/persist'
import type { ModelSummary } from '../model/types'

const emit = defineEmits<{
  close: []
}>()

const store = useDiagramStore()
const current = computed(() => store.currentModelId)
const panelEl = ref<HTMLElement | null>(null)

const models = ref<ModelSummary[]>([])
const loading = ref(true)
const busy = ref(false)
const message = ref('')
const messageKind = ref<'info' | 'error'>('info')

// ─── Create form ─────────────────────────────────────────────────────────────
const newId = ref('')
const newName = ref('')
const newDesc = ref('')
const newTags = ref('')

const idError = computed(() => {
  const clean = newId.value.trim().toLowerCase()
  if (!newId.value) return ''
  if (!/^[a-z0-9_-]+$/i.test(clean)) return 'Use letters, numbers, _ or -'
  if (models.value.some((m) => m.id === clean)) return 'This ID already exists'
  return ''
})

function displayName(m: ModelSummary): string {
  return m.meta?.name?.trim() || m.id
}

function displayDescription(m: ModelSummary): string {
  return m.meta?.description?.trim() ?? ''
}

function displayTags(m: ModelSummary): string[] {
  return m.meta?.tags ?? []
}

function setMessage(text: string, kind: 'info' | 'error' = 'info') {
  message.value = text
  messageKind.value = kind
}

async function refresh() {
  loading.value = true
  try {
    models.value = await listModels()
  } catch (e) {
    setMessage(e instanceof Error ? e.message : 'Failed to list models', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
  void nextTick(() => panelEl.value?.focus())
})

async function open(id: string) {
  if (busy.value || id === current.value) return
  busy.value = true
  setMessage('')
  const result = await store.openModel(id)
  busy.value = false
  if (!result.success) {
    setMessage(result.message ?? 'Failed to open model', 'error')
    return
  }
  emit('close')
}

async function create() {
  if (busy.value || idError.value) return
  const clean = newId.value.trim().toLowerCase()
  if (!clean) {
    setMessage('Enter an ID for the new model', 'error')
    return
  }
  busy.value = true
  setMessage('')
  const result = await store.createModel(clean, {
    name: newName.value.trim() || clean,
    description: newDesc.value.trim(),
    tags: newTags.value.split(','),
  })
  busy.value = false
  if (!result.success) {
    setMessage(result.message ?? 'Failed to create model', 'error')
    return
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="manager-overlay" @click.self="$emit('close')">
      <div
        ref="panelEl"
        class="manager-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-title"
        tabindex="-1"
        @keydown.escape="$emit('close')"
      >
        <div class="manager-header">
          <span id="manager-title" class="manager-title">Models</span>
          <button type="button" class="icon-btn" aria-label="Close" @click="$emit('close')">×</button>
        </div>

        <div class="manager-body">
          <div v-if="loading" class="manager-state">Loading…</div>
          <div v-else class="model-cards">
            <button
              v-for="m in models"
              :key="m.id"
              type="button"
              class="model-card"
              :class="{ current: m.id === current }"
              :disabled="busy || m.id === current"
              @click="open(m.id)"
            >
              <div class="card-header">
                <span class="card-name">{{ displayName(m) }}</span>
                <span class="card-id">/{{ m.id }}</span>
                <span v-if="m.id === current" class="current-badge">Open</span>
              </div>
              <p v-if="displayDescription(m)" class="card-desc">{{ displayDescription(m) }}</p>
              <p v-else class="card-desc muted">No description</p>
              <div v-if="displayTags(m).length" class="card-tags">
                <span v-for="tag in displayTags(m)" :key="tag" class="tag-chip">{{ tag }}</span>
              </div>
            </button>
            <div v-if="!models.length" class="manager-state">No models yet.</div>
          </div>

          <div class="create-section">
            <div class="create-title">New model</div>
            <div class="create-grid">
              <label class="create-field">
                <span>Model id</span>
                <input v-model="newId" class="inline-input mono" placeholder="model_id" aria-label="New model id" />
              </label>
              <label class="create-field">
                <span>Display name</span>
                <input v-model="newName" class="inline-input" placeholder="Display name" aria-label="New model display name" />
              </label>
            </div>
            <div v-if="idError" class="id-error">{{ idError }}</div>
            <label class="create-field">
              <span>Description</span>
              <textarea
                v-model="newDesc"
                class="inline-input desc-input"
                rows="2"
                placeholder="What is this model about?"
                aria-label="New model description"
              />
            </label>
            <label class="create-field">
              <span>Tags (comma separated)</span>
              <input
                v-model="newTags"
                class="inline-input mono"
                placeholder="tag_one, tag_two"
                aria-label="New model tags"
              />
            </label>
            <button type="button" class="btn primary" :disabled="busy || !newId.trim() || !!idError" @click="create">
              {{ busy ? 'Working…' : 'Create & open' }}
            </button>
          </div>
        </div>

        <div v-if="message" class="manager-message" :class="messageKind">{{ message }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.manager-overlay {
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

.manager-panel {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(85vh, 720px);
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  outline: none;
  overflow: hidden;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-panel-border);
}

.manager-title {
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
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
}

.icon-btn:hover {
  color: var(--c-btn-fg);
}

.manager-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.manager-state {
  font-size: 12px;
  color: var(--c-panel-label);
  padding: 16px;
}

.model-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
  flex: 1;
}

.model-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--c-btn-border);
  border-radius: 8px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  font-family: inherit;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.model-card:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
  border-color: var(--c-btn-active-border);
}

.model-card.current {
  border-color: var(--c-btn-active-border);
  background: var(--c-btn-hover-bg);
  cursor: default;
}

.model-card:disabled {
  opacity: 1;
}

.card-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-field-name);
}

.card-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-panel-label);
}

.current-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #4ade80;
  padding: 2px 7px;
  border: 1px solid rgba(74, 222, 128, 0.35);
  border-radius: 20px;
  background: rgba(74, 222, 128, 0.08);
}

.card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--c-btn-fg);
  word-break: break-word;
}

.card-desc.muted {
  color: var(--c-panel-label);
  font-style: italic;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--c-btn-border);
  border-radius: 20px;
  background: var(--c-canvas-bg);
  color: var(--c-panel-label);
}

.create-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--c-panel-border);
  background: var(--c-canvas-bg);
}

.create-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.create-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

@media (max-width: 480px) {
  .create-grid {
    grid-template-columns: 1fr;
  }
}

.create-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.inline-input {
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--c-field-name);
  background: var(--c-panel-bg);
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  padding: 6px 8px;
  outline: none;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.inline-input:focus {
  border-color: var(--c-btn-active-border);
}

.inline-input.mono {
  font-family: var(--font-mono);
  font-size: 11px;
}

.desc-input {
  resize: vertical;
  min-height: 48px;
  line-height: 1.5;
}

.id-error {
  font-size: 10px;
  color: #f87171;
}

.btn {
  padding: 7px 12px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  align-self: flex-start;
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

.manager-message {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1.4;
  margin: 0 16px 14px;
  padding: 8px 10px;
  border-radius: 5px;
}

.manager-message.error {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.manager-message.info {
  color: var(--c-field-name);
  background: var(--c-btn-hover-bg);
}
</style>
