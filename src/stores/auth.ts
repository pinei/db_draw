import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  requestToken as fetchToken,
  loginRequest,
  loadUserPrefs,
  saveCodePanelSize as putCodePanelSize,
  AuthError,
  type CodePanelSize,
} from '../utils/authApi'

const EMAIL_KEY = 'dbdraw.auth.email'
const TOKEN_KEY = 'dbdraw.auth.token'

export const useAuthStore = defineStore('auth', () => {
  // Session restored from localStorage so reloads keep the user logged in
  const email = ref<string | null>(localStorage.getItem(EMAIL_KEY))
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))

  // Last model from the server (authoritative on fresh login; the diagram
  // store's remembered id covers reloads in the same browser)
  const lastModelId = ref<string | null>(null)

  // Diagram Code panel size from user.json (login or prefs fetch)
  const codePanelSize = ref<CodePanelSize | null>(null)

  // Prefill for the login form after a failed magic-link attempt
  const loginDraft = ref<{ email: string; token: string } | null>(null)

  const isAuthenticated = computed(() => !!email.value && !!token.value)

  function setLoginDraft(next: { email: string; token: string } | null) {
    loginDraft.value = next
  }

  /** Asks the server to (re)generate a token and email it to the user. */
  async function generateToken(inputEmail: string): Promise<string> {
    return fetchToken(inputEmail.trim())
  }

  async function login(inputEmail: string, inputToken: string): Promise<void> {
    const result = await loginRequest(inputEmail.trim(), inputToken.trim())
    email.value = result.email
    token.value = inputToken.trim()
    lastModelId.value = result.lastModelId
    codePanelSize.value = result.codePanelSize
    localStorage.setItem(EMAIL_KEY, result.email)
    localStorage.setItem(TOKEN_KEY, inputToken.trim())
  }

  /** Pull prefs from user.json when the session was restored without a login call. */
  async function restorePrefs(): Promise<void> {
    if (!email.value || !token.value) return
    try {
      const prefs = await loadUserPrefs(email.value, token.value)
      if (prefs.lastModelId) lastModelId.value = prefs.lastModelId
      codePanelSize.value = prefs.codePanelSize
    } catch (e) {
      if (e instanceof AuthError) logout()
    }
  }

  async function persistCodePanelSize(size: CodePanelSize): Promise<void> {
    codePanelSize.value = size
    if (!email.value || !token.value) return
    try {
      await putCodePanelSize(email.value, token.value, size)
    } catch (e) {
      if (e instanceof AuthError) logout()
    }
  }

  function logout() {
    email.value = null
    token.value = null
    lastModelId.value = null
    codePanelSize.value = null
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return {
    email,
    token,
    isAuthenticated,
    lastModelId,
    codePanelSize,
    loginDraft,
    setLoginDraft,
    generateToken,
    login,
    restorePrefs,
    persistCodePanelSize,
    logout,
  }
})
