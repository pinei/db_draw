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
  applyLandingTheme()
  systemMedia.addEventListener('change', applyLandingTheme)

  const magic = takeMagicLink()
  if (magic) {
    try {
      await auth.login(magic.email, magic.token)
      auth.setLoginDraft(null)
    } catch {
      auth.setLoginDraft(magic)
    }
  }
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
  <LandingPage v-else />
</template>
