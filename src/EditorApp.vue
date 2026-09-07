<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useDiagramStore } from './stores/diagram'
import { useAuthStore } from './stores/auth'
import { loadModel, saveModel, AuthError } from './utils/persist'
import DiagramCanvas from './components/DiagramCanvas.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SupportKofi from './components/SupportKofi.vue'
import CodePanel from './components/CodePanel.vue'
import ModelBar from './components/ModelBar.vue'

const store = useDiagramStore()
const auth = useAuthStore()

// ─── Theme application ──────────────────────────────────────────────────────
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
systemMedia.addEventListener('change', applyTheme)

async function initModel() {
  if (auth.lastModelId) store.setCurrentModelId(auth.lastModelId)
  else store.restoreCurrentModelId()
  const id = store.currentModelId
  try {
    const loaded = await loadModel(id)
    if (loaded) {
      store.loadState(loaded, id)
    } else if (id === 'default') {
      store.resetState()
      await saveModel(id, store.state)
    } else {
      store.seedFreshModel(id, { blank: true })
      await saveModel(id, store.state)
    }
  } catch (e) {
    if (e instanceof AuthError) auth.logout()
  }
}

onMounted(() => {
  initModel()
})

watch(() => auth.email, (email, previous) => {
  if (email && previous && email !== previous) {
    store.resetState()
    initModel()
  }
})

onUnmounted(() => {
  systemMedia.removeEventListener('change', applyTheme)
  store.resetState()
})
</script>

<template>
  <div class="app-root">
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
