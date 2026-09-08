<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import LandingPage from './components/LandingPage.vue'

const EditorApp = defineAsyncComponent(() => import('./EditorApp.vue'))

const auth = useAuthStore()
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

function applyLandingTheme() {
  if (auth.isAuthenticated) return
  document.documentElement.setAttribute(
    'data-theme',
    systemMedia.matches ? 'dark' : 'light',
  )
}

onMounted(async () => {
  applyLandingTheme()
  systemMedia.addEventListener('change', applyLandingTheme)
  await auth.restoreSession()
})

onUnmounted(() => {
  systemMedia.removeEventListener('change', applyLandingTheme)
})

watch(() => auth.isAuthenticated, (ok) => {
  if (!ok) applyLandingTheme()
})
</script>

<template>
  <EditorApp v-if="auth.isAuthenticated" />
  <LandingPage v-else-if="!auth.restoring" />
</template>
