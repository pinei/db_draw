<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useDiagramStore } from './stores/diagram'
import { useAuthStore } from './stores/auth'
import { loadModel, saveModel, AuthError } from './utils/persist'
import DiagramCanvas from './components/DiagramCanvas.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import CodePanel from './components/CodePanel.vue'
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
  try {
    const loaded = await loadModel('default')
    if (loaded) {
      store.loadState(loaded)
    } else {
      // First run — seed the user folder with the current in-memory state
      await saveModel('default', store.state)
    }
  } catch (e) {
    if (e instanceof AuthError) auth.logout()
    // else: dev server not running or API unavailable — use in-memory state silently
  }
}

onMounted(() => {
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
  if (!ok) initialized = false
})
</script>

<template>
  <LoginPanel v-if="!auth.isAuthenticated" />
  <div v-else class="app-root">
    <DiagramCanvas />
    <CodePanel />
    <SettingsPanel />
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
