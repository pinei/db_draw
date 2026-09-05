<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useDiagramStore } from './stores/diagram'
import { loadModel, saveModel } from './utils/persist'
import DiagramCanvas from './components/DiagramCanvas.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import CodePanel from './components/CodePanel.vue'

const store = useDiagramStore()

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

onMounted(async () => {
  try {
    const loaded = await loadModel('default')
    if (loaded) {
      store.loadState(loaded)
    } else {
      // First run — seed the data folder with the current in-memory state
      await saveModel('default', store.state)
    }
  } catch {
    // Dev server not running or API unavailable — use in-memory state silently
  }
})
</script>

<template>
  <div class="app-root">
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
