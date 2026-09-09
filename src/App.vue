<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import LandingPage from './components/LandingPage.vue'

const EditorApp = defineAsyncComponent(() => import('./EditorApp.vue'))
const AdminApp = defineAsyncComponent(() => import('./AdminApp.vue'))

const auth = useAuthStore()
const path = ref(window.location.pathname)
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

const isAdminRoute = computed(() => path.value.replace(/\/+$/, '') === '/admin')

function applyLandingTheme() {
  if (auth.isAuthenticated && !isAdminRoute.value) return
  document.documentElement.setAttribute(
    'data-theme',
    systemMedia.matches ? 'dark' : 'light',
  )
}

function leaveAdminPath() {
  if (!isAdminRoute.value) return
  history.replaceState({}, document.title, '/')
  path.value = '/'
}

onMounted(async () => {
  applyLandingTheme()
  systemMedia.addEventListener('change', applyLandingTheme)
  await auth.restoreSession()
  if (isAdminRoute.value && !auth.admin) leaveAdminPath()
})

onUnmounted(() => {
  systemMedia.removeEventListener('change', applyLandingTheme)
})

watch(() => auth.isAuthenticated, (ok) => {
  if (!ok) {
    leaveAdminPath()
    applyLandingTheme()
  }
})
</script>

<template>
  <AdminApp v-if="!auth.restoring && isAdminRoute && auth.admin" />
  <EditorApp v-else-if="auth.isAuthenticated" />
  <LandingPage v-else-if="!auth.restoring" />
</template>
