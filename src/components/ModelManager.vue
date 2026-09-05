<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import { listModels } from '../utils/persist'
import type { ModelSummary } from '../model/types'

const emit = defineEmits<{
  close: []
}>()

const store = useDiagramStore()
const current = computed(() => store.currentModelId)

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
  if (!/^[a-z0-9_-]+$/i.test(clean)) return 'Use letras, números, _ ou -'
  if (models.value.some((m) => m.id === clean)) return 'Este ID já existe'
  return ''
})

function setMessage(text: string, kind: 'info' | 'error' = 'info') {
  message.value = text
  messageKind.value = kind
}

async function refresh() {
  loading.value = true
  try {
    models.value = await listModels()
  } catch (e) {
    setMessage(e instanceof Error ? e.message : 'Falha ao listar modelos', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

async function open(id: string) {
  if (busy.value || id === current.value) return
  busy.value = true
  setMessage('')
  const result = await store.openModel(id)
  busy.value = false
  if (!result.success) {
    setMessage(result.message ?? 'Falha ao abrir modelo', 'error')
    return
  }
  await refresh()
  emit('close')
}

async function create() {
  if (busy.value || idError.value) return
  const clean = newId.value.trim().toLowerCase()
  if (!clean) {
    setMessage('Informe um ID para o novo modelo', 'error')
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
    setMessage(result.message ?? 'Falha ao criar modelo', 'error')
    return
  }
  await refresh()
  emit('close')
}
</script>

<template>
  <div class="manager-popover" @keydown.escape="$emit('close')">
    <div class="manager-header">
      <span class="manager-title">Models</span>
      <button type="button" class="icon-btn" aria-label="Close" @click="$emit('close')">×</button>
    </div>

    <div v-if="loading" class="manager-state">Loading…</div>
    <div v-else class="manager-list">
      <button
        v-for="m in models"
        :key="m.id"
        type="button"
        class="model-item"
        :class="{ current: m.id === current }"
        :title="m.meta?.description || m.id"
        :disabled="busy || m.id === current"
        @click="open(m.id)"
      >
        <span class="item-check">{{ m.id === current ? '✓' : '' }}</span>
        <span class="item-text">
          <span class="item-name">{{ m.meta?.name || m.id }}</span>
          <span class="item-id">/{{ m.id }}</span>
        </span>
        <span v-if="m.meta?.tags?.length" class="item-tags">{{ m.meta.tags.slice(0, 3).join(' · ') }}</span>
      </button>
      <div v-if="!models.length" class="manager-state">No models yet.</div>
    </div>

    <div class="create-section">
      <div class="create-title">New model</div>
      <input v-model="newId" class="inline-input mono" placeholder="model_id" aria-label="New model id" />
      <div v-if="idError" class="id-error">{{ idError }}</div>
      <input v-model="newName" class="inline-input" placeholder="Display name" aria-label="New model display name" />
      <input v-model="newDesc" class="inline-input" placeholder="Description (optional)" aria-label="New model description" />
      <input v-model="newTags" class="inline-input mono" placeholder="tags, comma_separated (optional)" aria-label="New model tags" />
      <button type="button" class="btn primary" :disabled="busy || !newId.trim() || !!idError" @click="create">
        {{ busy ? 'Working…' : 'Create & open' }}
      </button>
    </div>

    <div v-if="message" class="manager-message" :class="messageKind">{{ message }}</div>
  </div>
</template>

<style scoped>
.manager-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: min(70vh, 480px);
  overflow-y: auto;
  z-index: 102;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.manager-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}

.icon-btn:hover {
  color: var(--c-btn-fg);
}

.manager-state {
  font-size: 12px;
  color: var(--c-panel-label);
  padding: 4px 0;
}

.manager-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 7px 9px;
  border: 1px solid var(--c-btn-border);
  border-radius: 7px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  font-family: inherit;
  min-width: 0;
}

.model-item:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.model-item.current {
  border-color: var(--c-btn-active-border);
  cursor: default;
}

.model-item:disabled {
  opacity: 1;
}

.item-check {
  width: 14px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #4ade80;
}

.item-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.item-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-id {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-panel-label);
  white-space: nowrap;
  flex-shrink: 0;
}

.item-tags {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-panel-label);
  white-space: nowrap;
  flex-shrink: 0;
}

.create-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--c-panel-border);
}

.create-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
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

.id-error {
  font-size: 10px;
  color: #f87171;
}

.btn {
  padding: 6px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
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
  font-size: 11px;
  line-height: 1.4;
  padding: 6px 8px;
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
