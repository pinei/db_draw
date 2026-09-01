<script setup lang="ts">
import { onMounted } from 'vue'
import { useDiagramStore } from './stores/diagram'
import { loadModel, saveModel } from './utils/persist'
import DiagramCanvas from './components/DiagramCanvas.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import CodePanel from './components/CodePanel.vue'

const store = useDiagramStore()

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
