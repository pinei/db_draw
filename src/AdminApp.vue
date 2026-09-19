<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { useAuthStore } from './stores/auth'
import { AuthError } from './utils/authApi'
import { highlightDbml } from './utils/dbmlHighlight'
import { highlightJson } from './utils/jsonHighlight'
import { sanitizeTags } from './utils/modelMeta'
import {
  cloneAdminModel,
  deleteAdminModel,
  listAdminUsers,
  listOwnModelIds,
  loadAdminModelDbml,
  loadAdminUser,
  type AdminModelEntry,
  type AdminUserSummary,
} from './utils/adminApi'

const auth = useAuthStore()
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

const users = ref<AdminUserSummary[]>([])
const selectedEmail = ref<string | null>(null)
const userJson = ref('')
const models = ref<AdminModelEntry[]>([])
const loadingList = ref(true)
const loadingDetail = ref(false)
const message = ref('')

const dbmlOpen = ref(false)
const dbmlTitle = ref('')
const dbmlSource = ref('')
const dbmlLoading = ref(false)
const copied = ref(false)
const dbmlPanelEl = ref<HTMLElement | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const cloneOpen = ref(false)
const cloneBusy = ref(false)
const cloneFromId = ref('')
const cloneId = ref('')
const cloneName = ref('')
const cloneDesc = ref('')
const cloneTags = ref('')
const ownModelIds = ref<string[]>([])
const clonePanelEl = ref<HTMLElement | null>(null)

const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteTarget = ref<AdminModelEntry | null>(null)
const deletePanelEl = ref<HTMLElement | null>(null)

const cloneIdError = computed(() => {
  const clean = cloneId.value.trim().toLowerCase()
  if (!cloneId.value) return ''
  if (!/^[a-z0-9_-]+$/i.test(clean)) return 'Use letters, numbers, _ or -'
  if (ownModelIds.value.includes(clean)) return 'This ID already exists in your models'
  return ''
})

const highlightedJson = computed(() => highlightJson(userJson.value || '{\n  \n}'))

const highlightedDbml = computed(() => {
  const src = dbmlSource.value
  const names = [...src.matchAll(/^\s*Table\s+([A-Za-z_]\w*)/gm)].map((m) => m[1])
  const html = highlightDbml(src, names)
  return src.endsWith('\n') ? html + '\n' : html
})

function applyTheme() {
  document.documentElement.setAttribute(
    'data-theme',
    systemMedia.matches ? 'dark' : 'light',
  )
}

function displayName(m: AdminModelEntry): string {
  return m.meta?.name?.trim() || m.id
}

function displayDescription(m: AdminModelEntry): string {
  return m.meta?.description?.trim() ?? ''
}

function displayTags(m: AdminModelEntry): string[] {
  return m.meta?.tags ?? []
}

async function fail(e: unknown, fallback: string) {
  if (e instanceof AuthError) {
    await auth.logout()
    return
  }
  message.value = e instanceof Error ? e.message : fallback
}

async function refreshUsers() {
  loadingList.value = true
  message.value = ''
  try {
    users.value = await listAdminUsers()
  } catch (e) {
    await fail(e, 'Failed to list users')
  } finally {
    loadingList.value = false
  }
}

async function selectUser(email: string) {
  if (loadingDetail.value) return
  selectedEmail.value = email
  loadingDetail.value = true
  message.value = ''
  try {
    const detail = await loadAdminUser(email)
    userJson.value = JSON.stringify(detail.user, null, 2)
    models.value = detail.models
  } catch (e) {
    userJson.value = ''
    models.value = []
    await fail(e, 'Failed to load user')
  } finally {
    loadingDetail.value = false
  }
}

function closeDbml() {
  dbmlOpen.value = false
  dbmlSource.value = ''
  dbmlTitle.value = ''
  copied.value = false
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
}

async function openDbml(m: AdminModelEntry) {
  if (!selectedEmail.value) return
  dbmlOpen.value = true
  dbmlTitle.value = `${displayName(m)} /${m.id}`
  dbmlSource.value = ''
  dbmlLoading.value = true
  copied.value = false
  try {
    dbmlSource.value = await loadAdminModelDbml(selectedEmail.value, m.id)
    await nextTick()
    dbmlPanelEl.value?.focus()
  } catch (e) {
    closeDbml()
    await fail(e, 'Failed to load DBML')
  } finally {
    dbmlLoading.value = false
  }
}

function suggestId(base: string, taken: string[]): string {
  const clean = base.trim().toLowerCase() || 'model'
  if (!taken.includes(clean)) return clean
  for (let n = 2; n < 1000; n++) {
    const id = `${clean}_${n}`
    if (!taken.includes(id)) return id
  }
  return `${clean}_${Date.now()}`
}

function closeClone() {
  cloneOpen.value = false
  cloneBusy.value = false
}

async function openClone(m: AdminModelEntry) {
  if (!selectedEmail.value) return
  cloneFromId.value = m.id
  cloneName.value = displayName(m)
  cloneDesc.value = displayDescription(m)
  cloneTags.value = displayTags(m).join(', ')
  cloneOpen.value = true
  try {
    ownModelIds.value = await listOwnModelIds()
  } catch (e) {
    cloneOpen.value = false
    await fail(e, 'Failed to list your models')
    return
  }
  cloneId.value = suggestId(m.id, ownModelIds.value)
  await nextTick()
  clonePanelEl.value?.focus()
}

function closeDelete() {
  deleteOpen.value = false
  deleteBusy.value = false
  deleteTarget.value = null
}

async function openDelete(m: AdminModelEntry) {
  deleteTarget.value = m
  deleteOpen.value = true
  await nextTick()
  deletePanelEl.value?.focus()
}

async function submitDelete() {
  if (!selectedEmail.value || !deleteTarget.value || deleteBusy.value) return
  deleteBusy.value = true
  message.value = ''
  const id = deleteTarget.value.id
  try {
    await deleteAdminModel(selectedEmail.value, id)
    closeDelete()
    await refreshUsers()
    if (selectedEmail.value) await selectUser(selectedEmail.value)
    message.value = `Deleted /${id}`
  } catch (e) {
    await fail(e, 'Delete failed')
  } finally {
    deleteBusy.value = false
  }
}

async function submitClone() {
  if (!selectedEmail.value || cloneBusy.value || cloneIdError.value || !cloneId.value.trim()) return
  cloneBusy.value = true
  message.value = ''
  try {
    const id = await cloneAdminModel({
      email: selectedEmail.value,
      model: cloneFromId.value,
      id: cloneId.value.trim().toLowerCase(),
      name: cloneName.value.trim() || cloneId.value.trim().toLowerCase(),
      description: cloneDesc.value.trim(),
      tags: sanitizeTags(cloneTags.value.split(',')),
    })
    closeClone()
    await refreshUsers()
    if (selectedEmail.value) await selectUser(selectedEmail.value)
    message.value = `Cloned to /${id}`
  } catch (e) {
    await fail(e, 'Clone failed')
  } finally {
    cloneBusy.value = false
  }
}

async function copyDbml() {
  if (!dbmlSource.value) return
  try {
    await navigator.clipboard.writeText(dbmlSource.value)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1600)
  } catch {
    message.value = 'Could not copy to clipboard'
  }
}

onMounted(() => {
  document.title = 'DBDraw — Admin'
  applyTheme()
  systemMedia.addEventListener('change', applyTheme)
  void refreshUsers()
})

onUnmounted(() => {
  systemMedia.removeEventListener('change', applyTheme)
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="admin-root">
    <header class="admin-bar">
      <span class="admin-title">Admin</span>
      <span class="admin-email" :title="auth.email ?? ''">{{ auth.email }}</span>
      <a class="admin-link" href="/">Editor</a>
    </header>

    <div class="admin-layout">
      <aside class="user-pane">
        <div class="pane-label">Users</div>
        <div v-if="loadingList" class="pane-state">Loading…</div>
        <div v-else-if="!users.length" class="pane-state">No users yet.</div>
        <ul v-else class="user-list">
          <li v-for="u in users" :key="u.email">
            <button
              type="button"
              class="user-row"
              :class="{ selected: u.email === selectedEmail }"
              @click="selectUser(u.email)"
            >
              <span class="user-row-email">{{ u.email }}</span>
              <span class="user-row-meta">
                {{ u.models }} {{ u.models === 1 ? 'model' : 'models' }}
                · {{ u.loginCount }} {{ u.loginCount === 1 ? 'login' : 'logins' }}
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <main class="detail-pane">
        <div v-if="!selectedEmail" class="pane-state">Select a user.</div>
        <div v-else-if="loadingDetail" class="pane-state">Loading…</div>
        <template v-else>
          <section class="detail-block">
            <div class="pane-label">User record</div>
            <pre class="json-view" v-html="highlightedJson" />
          </section>
          <section class="detail-block">
            <div class="pane-label">Models</div>
            <div v-if="!models.length" class="pane-state inset">No models.</div>
            <div v-else class="model-cards">
              <article v-for="m in models" :key="m.id" class="model-card">
                <button type="button" class="model-card-main" @click="openDbml(m)">
                  <div class="card-header">
                    <span class="card-name">{{ displayName(m) }}</span>
                    <span class="card-id">/{{ m.id }}</span>
                  </div>
                  <p v-if="displayDescription(m)" class="card-desc">{{ displayDescription(m) }}</p>
                  <p v-else class="card-desc muted">No description</p>
                  <div class="card-stats">
                    {{ m.tables }} {{ m.tables === 1 ? 'table' : 'tables' }}
                    ·
                    {{ m.relationships }} {{ m.relationships === 1 ? 'relationship' : 'relationships' }}
                  </div>
                  <div v-if="displayTags(m).length" class="card-tags">
                    <span v-for="tag in displayTags(m)" :key="tag" class="tag-chip">{{ tag }}</span>
                  </div>
                </button>
                <div class="model-card-actions">
                  <button type="button" class="clone-btn" @click="openClone(m)">Clone</button>
                  <button type="button" class="delete-btn" @click="openDelete(m)">Delete</button>
                </div>
              </article>
            </div>
          </section>
        </template>
        <p v-if="message" class="admin-error">{{ message }}</p>
      </main>
    </div>

    <Teleport to="body">
      <div
        v-if="dbmlOpen"
        class="dbml-overlay"
        @click.self="closeDbml"
      >
        <div
          ref="dbmlPanelEl"
          class="dbml-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dbml-title"
          tabindex="-1"
          @keydown.escape="closeDbml"
        >
          <div class="dbml-header">
            <span id="dbml-title" class="dbml-heading">DBML · {{ dbmlTitle }}</span>
            <div class="dbml-actions">
              <button type="button" class="dbml-btn" :disabled="!dbmlSource" @click="copyDbml">
                {{ copied ? 'Copied' : 'Copy' }}
              </button>
              <button type="button" class="dbml-close" aria-label="Close" @click="closeDbml"><X :size="16" /></button>
            </div>
          </div>
          <div class="dbml-body">
            <div v-if="dbmlLoading" class="pane-state">Loading…</div>
            <pre v-else class="code-preview" v-html="highlightedDbml" />
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="cloneOpen" class="dbml-overlay" @click.self="closeClone">
        <div
          ref="clonePanelEl"
          class="clone-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clone-title"
          tabindex="-1"
          @keydown.escape="closeClone"
        >
          <div class="dbml-header">
            <span id="clone-title" class="dbml-heading">Clone into your models</span>
            <button type="button" class="dbml-close" aria-label="Close" @click="closeClone"><X :size="16" /></button>
          </div>
          <div class="clone-body">
            <p class="clone-hint">Copies the folder as-is, then applies the identity below. Id must be unique among your models.</p>
            <div class="clone-grid">
              <label class="clone-field">
                <span>Model id</span>
                <input v-model="cloneId" class="clone-input mono" placeholder="model_id" aria-label="Clone model id" />
              </label>
              <label class="clone-field">
                <span>Display name</span>
                <input v-model="cloneName" class="clone-input" placeholder="Display name" aria-label="Clone display name" />
              </label>
            </div>
            <div v-if="cloneIdError" class="clone-error">{{ cloneIdError }}</div>
            <label class="clone-field">
              <span>Description</span>
              <textarea v-model="cloneDesc" class="clone-input desc" rows="2" placeholder="What is this model about?" aria-label="Clone description" />
            </label>
            <label class="clone-field">
              <span>Tags (comma separated)</span>
              <input v-model="cloneTags" class="clone-input mono" placeholder="tag_one, tag_two" aria-label="Clone tags" />
            </label>
            <button
              type="button"
              class="clone-submit"
              :disabled="cloneBusy || !cloneId.trim() || !!cloneIdError"
              @click="submitClone"
            >
              {{ cloneBusy ? 'Cloning…' : 'Clone' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="deleteOpen && deleteTarget" class="dbml-overlay" @click.self="closeDelete">
        <div
          ref="deletePanelEl"
          class="clone-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          tabindex="-1"
          @keydown.escape="closeDelete"
        >
          <div class="dbml-header">
            <span id="delete-title" class="dbml-heading">Delete model</span>
            <button type="button" class="dbml-close" aria-label="Close" @click="closeDelete"><X :size="16" /></button>
          </div>
          <div class="clone-body">
            <p class="clone-hint">
              Permanently delete
              <strong>{{ displayName(deleteTarget) }}</strong>
              <span class="card-id"> /{{ deleteTarget.id }}</span>
              and all files in its folder. This cannot be undone.
            </p>
            <div class="delete-actions">
              <button type="button" class="clone-btn" :disabled="deleteBusy" @click="closeDelete">Cancel</button>
              <button type="button" class="delete-submit" :disabled="deleteBusy" @click="submitDelete">
                {{ deleteBusy ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.admin-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-canvas-bg);
  color: var(--c-field-name);
}

.admin-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--c-panel-bg);
  border-bottom: 1px solid var(--c-panel-border);
  flex-shrink: 0;
}

.admin-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.admin-email {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-link {
  font-size: 12px;
  color: var(--c-entity-border-hover);
  text-decoration: none;
}

.admin-link:hover {
  text-decoration: underline;
}

.admin-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.user-pane {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--c-panel-bg);
  border-right: 1px solid var(--c-panel-border);
}

.detail-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pane-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-panel-label);
  padding: 12px 14px 6px;
}

.detail-block .pane-label {
  padding: 0 0 8px;
}

.pane-state {
  font-size: 12px;
  color: var(--c-panel-label);
  padding: 12px 14px;
}

.pane-state.inset {
  padding: 0;
}

.user-list {
  list-style: none;
  margin: 0;
  padding: 0 8px 12px;
  overflow: auto;
  min-height: 0;
  flex: 1;
}

.user-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.user-row:hover {
  background: var(--c-btn-hover-bg);
}

.user-row.selected {
  background: var(--c-btn-hover-bg);
  border-color: var(--c-btn-active-border);
}

.user-row-email {
  font-size: 12px;
  font-weight: 600;
  word-break: break-all;
}

.user-row-meta {
  font-size: 10px;
  color: var(--c-panel-label);
}

.json-view {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 8px;
  overflow: auto;
  max-height: 320px;
  white-space: pre;
}

.model-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-card {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 4px 4px 4px 0;
  border: 1px solid var(--c-btn-border);
  border-radius: 8px;
  background: var(--c-panel-bg);
}

.model-card-main {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  text-align: left;
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.model-card-main:hover {
  background: var(--c-btn-hover-bg);
}

.model-card-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 6px;
  flex-shrink: 0;
  align-self: center;
  margin-right: 8px;
}

.clone-btn,
.delete-btn {
  padding: 5px 10px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
}

.clone-btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.delete-btn {
  color: #dc2626;
  border-color: #fca5a5;
  background: #fef2f2;
}

.delete-btn:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #f87171;
}

.delete-btn:disabled,
.clone-btn:disabled {
  opacity: 0.4;
  cursor: default;
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
}

.card-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-panel-label);
}

.card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.card-desc.muted {
  color: var(--c-panel-label);
  font-style: italic;
}

.card-stats {
  font-size: 11px;
  color: var(--c-field-type);
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

.admin-error {
  margin: 0;
  font-size: 12px;
  color: #f87171;
}

@media (max-width: 720px) {
  .clone-grid {
    grid-template-columns: 1fr;
  }

  .admin-layout {
    flex-direction: column;
  }

  .user-pane {
    width: 100%;
    max-height: 36vh;
    border-right: none;
    border-bottom: 1px solid var(--c-panel-border);
  }
}

.dbml-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.dbml-panel {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(85vh, 800px);
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  outline: none;
}

.dbml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-panel-border);
}

.dbml-heading {
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-panel-label);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dbml-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dbml-btn {
  padding: 5px 10px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
}

.dbml-btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.dbml-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.dbml-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-panel-label);
  line-height: 1;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
}

.dbml-close:hover {
  color: var(--c-field-name);
}

.dbml-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--c-canvas-bg);
}

.clone-panel {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  outline: none;
}

.clone-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 16px;
}

.clone-hint {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-field-type);
}

.clone-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.clone-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.clone-input {
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--c-field-name);
  background: var(--c-canvas-bg);
  border: 1px solid var(--c-btn-border);
  border-radius: 5px;
  padding: 6px 8px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.clone-input:focus {
  border-color: var(--c-btn-active-border);
}

.clone-input.mono {
  font-family: var(--font-mono);
  font-size: 11px;
}

.clone-input.desc {
  resize: vertical;
  min-height: 48px;
  line-height: 1.5;
}

.clone-error {
  font-size: 10px;
  color: #f87171;
}

.clone-submit {
  align-self: flex-start;
  margin-top: 4px;
  padding: 7px 12px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--c-btn-active-border);
  border-radius: 5px;
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  cursor: pointer;
}

.clone-submit:disabled,
.delete-submit:disabled {
  opacity: 0.4;
  cursor: default;
}

.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.delete-submit {
  padding: 7px 12px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid #dc2626;
  border-radius: 5px;
  background: #dc2626;
  color: #fff;
  cursor: pointer;
}

.delete-submit:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.dbml-body .code-preview {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  tab-size: 2;
  color: var(--c-field-name);
}
</style>

<style>
/* Unscoped: spans injected via v-html */
.admin-root .tok-key { color: #0f766e; }
.admin-root .tok-str { color: #0e7490; }
.admin-root .tok-num { color: #9333ea; }
.admin-root .tok-kw  { color: #1d4ed8; font-weight: 600; }

html[data-theme='dark'] .admin-root .tok-key { color: #2dd4bf; }
html[data-theme='dark'] .admin-root .tok-str { color: #22d3ee; }
html[data-theme='dark'] .admin-root .tok-num { color: #d8b4fe; }
html[data-theme='dark'] .admin-root .tok-kw  { color: #60a5fa; }

html[data-theme='dark'] .admin-root .delete-btn {
  color: #f87171;
  border-color: #7f1d1d;
  background: #3f1515;
}

html[data-theme='dark'] .admin-root .delete-btn:hover:not(:disabled) {
  background: #5f1d1d;
  border-color: #f87171;
}

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
