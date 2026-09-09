import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  requestToken as fetchToken,
  loginRequest,
  fetchMe,
  logoutRequest,
  loadUserPrefs,
  saveCodePanelSize as putCodePanelSize,
  AuthError,
  type CodePanelSize,
} from '../utils/authApi'

const LEGACY_EMAIL_KEY = 'dbdraw.auth.email'
const LEGACY_TOKEN_KEY = 'dbdraw.auth.token'

function clearLegacyStorage() {
  try {
    localStorage.removeItem(LEGACY_EMAIL_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch { /* non-browser */ }
}

export const useAuthStore = defineStore('auth', () => {
  const email = ref<string | null>(null)
  const admin = ref(false)
  const restoring = ref(true)

  const lastModelId = ref<string | null>(null)
  const codePanelSize = ref<CodePanelSize | null>(null)

  const isAuthenticated = computed(() => !!email.value)

  function applySession(result: { email: string; lastModelId: string | null; codePanelSize: CodePanelSize | null; admin: boolean }) {
    email.value = result.email
    admin.value = result.admin
    lastModelId.value = result.lastModelId
    codePanelSize.value = result.codePanelSize
    clearLegacyStorage()
  }

  function clearSession() {
    email.value = null
    admin.value = false
    lastModelId.value = null
    codePanelSize.value = null
  }

  /** Asks the server to (re)generate a token and email it to the user. */
  async function generateToken(inputEmail: string): Promise<string> {
    return fetchToken(inputEmail.trim())
  }

  async function login(inputEmail: string, inputToken: string): Promise<void> {
    const result = await loginRequest(inputEmail.trim(), inputToken.trim())
    applySession(result)
  }

  /** Cookie session on boot — 401 means landing, not an error banner. */
  async function restoreSession(): Promise<void> {
    restoring.value = true
    clearLegacyStorage()
    try {
      applySession(await fetchMe())
    } catch {
      clearSession()
    } finally {
      restoring.value = false
    }
  }

  /** Pull prefs from user.json when the editor mounts. */
  async function restorePrefs(): Promise<void> {
    if (!email.value) return
    try {
      const prefs = await loadUserPrefs()
      if (prefs.lastModelId) lastModelId.value = prefs.lastModelId
      codePanelSize.value = prefs.codePanelSize
    } catch (e) {
      if (e instanceof AuthError) void logout()
    }
  }

  async function persistCodePanelSize(size: CodePanelSize): Promise<void> {
    codePanelSize.value = size
    if (!email.value) return
    try {
      await putCodePanelSize(size)
    } catch (e) {
      if (e instanceof AuthError) void logout()
    }
  }

  async function logout() {
    await logoutRequest()
    clearSession()
    clearLegacyStorage()
  }

  return {
    email,
    admin,
    restoring,
    isAuthenticated,
    lastModelId,
    codePanelSize,
    generateToken,
    login,
    restoreSession,
    restorePrefs,
    persistCodePanelSize,
    logout,
  }
})
