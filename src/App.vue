<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useDiagramStore } from './stores/diagram'
import { useAuthStore } from './stores/auth'
import { loadModel, saveModel, AuthError } from './utils/persist'
import DiagramCanvas from './components/DiagramCanvas.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SupportKofi from './components/SupportKofi.vue'
import CodePanel from './components/CodePanel.vue'
import ModelBar from './components/ModelBar.vue'
import LoginPanel from './components/LoginPanel.vue'

const store = useDiagramStore()
const auth = useAuthStore()

// ─── Theme application ──────────────────────────────────────────────────────
// Resolves the current ThemeMode ('light' | 'dark' | 'system') to a concrete
// value and reflects it as `data-theme` on <html>, which drives the CSS tokens.
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(): 'light' | 'dark' {
  if (store.layout.theme === 'system') {
    return systemMedia.matches ? 'dark' : 'light'
  }
  return store.layout.theme
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolveTheme())
}

watch(() => store.layout.theme, applyTheme, { immediate: true })

// Follow OS preference changes while in 'system' mode
systemMedia.addEventListener('change', applyTheme)

// Model init runs only when authenticated; first login seeds the user's
// models/default/ from the in-memory sample schema (loadModel → 404 → saveModel)
let initialized = false

async function initModel() {
  // Server hint wins on fresh login; the remembered browser id covers reloads
  if (auth.lastModelId) store.setCurrentModelId(auth.lastModelId)
  else store.restoreCurrentModelId()
  const id = store.currentModelId
  try {
    const loaded = await loadModel(id)
    if (loaded) {
      store.loadState(loaded, id)
    } else if (id === 'default') {
      // First run — seed the user folder with PRISTINE defaults, never with
      // whatever happens to sit in memory (another user's diagram after a
      // logout→login switch without reload)
      store.resetState()
      await saveModel(id, store.state)
    } else {
      // Remembered model gone (deleted elsewhere) — start it blank
      store.seedFreshModel(id, { blank: true })
      await saveModel(id, store.state)
    }
  } catch (e) {
    if (e instanceof AuthError) auth.logout()
    // else: dev server not running or API unavailable — use in-memory state silently
  }
}

function takeMagicLink(): { email: string; token: string } | null {
  const params = new URLSearchParams(window.location.search)
  const email = params.get('email')?.trim() ?? ''
  const token = params.get('token')?.trim() ?? ''
  if (!email && !token) return null
  const url = new URL(window.location.href)
  url.searchParams.delete('email')
  url.searchParams.delete('token')
  const next = url.pathname + url.search + url.hash
  history.replaceState({}, document.title, next)
  if (!email || !token) return null
  return { email, token }
}

onMounted(async () => {
  const magic = takeMagicLink()
  if (magic) {
    const previousEmail = auth.email
    try {
      await auth.login(magic.email, magic.token)
      auth.setLoginDraft(null)
      if (previousEmail && previousEmail !== magic.email) {
        initialized = false
        store.resetState()
      }
    } catch {
      auth.setLoginDraft(magic)
    }
  }
  if (auth.isAuthenticated) {
    initialized = true
    initModel()
  }
})

watch(() => auth.isAuthenticated, (ok) => {
  if (ok && !initialized) {
    initialized = true
    initModel()
  }
  if (!ok) {
    initialized = false
    // Forget everything: the in-memory diagram belongs to the user who just
    // left and must not leak into the next session's view or 404 seed
    store.resetState()
  }
})
</script>

<template>
  <LoginPanel v-if="!auth.isAuthenticated" />
  <div v-else class="app-root">
    <DiagramCanvas />
    <CodePanel />
    <div class="settings-stack">
      <SupportKofi />
      <SettingsPanel />
    </div>
    <ModelBar />
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.settings-stack {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 180px;
}
</style>
