<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useDiagramStore } from '../stores/diagram'
import { normalizeTag } from '../utils/modelMeta'
import ModelManager from './ModelManager.vue'

const store = useDiagramStore()
const meta = computed(() => store.state.meta)
const displayName = computed(() => meta.value.name || meta.value.id)
const showManager = ref(false)

// ─── Edit popover (all 4 metadata fields; id is read-only) ───────────────────
const open = ref(false)
const editName = ref('')
const editDesc = ref('')
const editTags = ref<string[]>([])
const tagDraft = ref('')
const tagInputEl = ref<HTMLInputElement | null>(null)

function openPopover() {
  editName.value = meta.value.name
  editDesc.value = meta.value.description
  editTags.value = [...meta.value.tags]
  tagDraft.value = ''
  open.value = true
}

function closePopover() {
  open.value = false
}

function addTag() {
  const tag = normalizeTag(tagDraft.value)
  if (tag && !editTags.value.includes(tag)) editTags.value.push(tag)
  tagDraft.value = ''
  nextTick(() => tagInputEl.value?.focus())
}

function onTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  }
}

function removeTag(tag: string) {
  editTags.value = editTags.value.filter((t) => t !== tag)
}

function save() {
  store.updateModelMeta({
    name: editName.value,
    description: editDesc.value,
    tags: editTags.value,
  })
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closePopover()
  else if ((e.key === 'Enter' || e.key === ' ') && !open.value) {
    e.preventDefault()
    openPopover()
  }
}
</script>

<template>
  <div class="model-bar">
    <div class="pill-anchor">
      <div
        class="model-pill"
        role="button"
        tabindex="0"
        :title="`Model ${meta.id} — click to edit metadata`"
        @click="openPopover"
        @keydown="onKeydown"
      >
        <span class="model-id">/{{ meta.id }}</span>
        <span class="model-name">{{ displayName }}</span>
        <span class="chev">▾</span>
      </div>

      <div v-if="open" class="edit-popover" @keydown="onKeydown">
      <label class="edit-field">
        <span>Model id (folder, read-only)</span>
        <span class="id-readonly">/{{ meta.id }}</span>
      </label>
      <label class="edit-field">
        <span>Display name</span>
        <input v-model="editName" class="inline-input" placeholder="Model display name" />
      </label>
      <label class="edit-field">
        <span>Description</span>
        <textarea v-model="editDesc" class="inline-input desc-input" rows="3" placeholder="What is this model about?" />
      </label>
      <div class="edit-field">
        <span>Tags (lowercase, _)</span>
        <div class="tags">
          <span v-for="tag in editTags" :key="tag" class="tag-chip">
            {{ tag }}
            <button type="button" class="tag-remove" :aria-label="`Remove tag ${tag}`" @click="removeTag(tag)">×</button>
          </span>
          <input
            ref="tagInputEl"
            v-model="tagDraft"
            class="inline-input tag-input"
            placeholder="new_tag ⏎"
            aria-label="New tag"
            @keydown="onTagKeydown"
            @blur="addTag"
          />
        </div>
      </div>
      <div class="edit-actions">
        <button type="button" class="btn" @click="closePopover">Cancel</button>
        <button type="button" class="btn primary" @click="save">Save</button>
      </div>
      </div>
    </div>

    <button
      type="button"
      class="manage-btn"
      title="Manage models"
      aria-label="Manage models"
      @click="showManager = true"
    >🗂</button>

    <ModelManager v-if="showManager" @close="showManager = false" />

    <div v-if="open" class="backdrop" @click="open = false" />
  </div>
</template>

<style scoped>
/* Full free-zone strip (CodePanel ↔ SettingsPanel), centered content.
   Click-through except on the pill/popover so canvas stays usable underneath. */
.model-bar {
  position: absolute;
  top: 16px;
  left: 312px;
  right: 248px;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
  user-select: none;
}

.pill-anchor {
  position: relative;
  pointer-events: auto;
  max-width: 100%;
}

.manage-btn {
  pointer-events: auto;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
}

.manage-btn:hover {
  border-color: var(--c-btn-active-border);
}

.model-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 5px 12px;
  cursor: pointer;
  outline: none;
}

.model-pill:hover,
.model-pill:focus-visible {
  border-color: var(--c-btn-active-border);
}

.model-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-panel-label);
  white-space: nowrap;
  flex-shrink: 0;
}

.model-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-field-name);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.chev {
  font-size: 9px;
  color: var(--c-panel-label);
  flex-shrink: 0;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 101;
  pointer-events: auto;
}

.edit-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  max-width: calc(100vw - 32px);
  z-index: 102;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.id-readonly {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--c-field-name);
}

.tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  padding: 1px 4px 1px 7px;
  border: 1px solid var(--c-btn-border);
  border-radius: 20px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  white-space: nowrap;
}

.tag-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;
}

.tag-remove:hover {
  color: #f87171;
}

.inline-input {
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
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

.tag-input {
  font-family: var(--font-mono);
  font-size: 11px;
  width: 110px;
  flex-grow: 1;
}

.desc-input {
  resize: vertical;
  min-height: 54px;
  line-height: 1.5;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
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
}

.btn:hover {
  background: var(--c-btn-hover-bg);
}

.btn.primary {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  border-color: var(--c-btn-active-border);
}
</style>
