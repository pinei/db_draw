import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { requestToken as fetchToken, loginRequest } from '../utils/persist'

const EMAIL_KEY = 'dbdraw.auth.email'
const TOKEN_KEY = 'dbdraw.auth.token'

export const useAuthStore = defineStore('auth', () => {
  // Session restored from localStorage so reloads keep the user logged in
  const email = ref<string | null>(localStorage.getItem(EMAIL_KEY))
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))

  // Last model from the server (authoritative on fresh login; the diagram
  // store's remembered id covers reloads in the same browser)
  const lastModelId = ref<string | null>(null)

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
    localStorage.setItem(EMAIL_KEY, result.email)
    localStorage.setItem(TOKEN_KEY, inputToken.trim())
  }

  function logout() {
    email.value = null
    token.value = null
    lastModelId.value = null
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return { email, token, isAuthenticated, lastModelId, loginDraft, setLoginDraft, generateToken, login, logout }
})
