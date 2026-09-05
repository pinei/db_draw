import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { requestToken as fetchToken, loginRequest } from '../utils/persist'

const EMAIL_KEY = 'dbdraw.auth.email'
const TOKEN_KEY = 'dbdraw.auth.token'

export const useAuthStore = defineStore('auth', () => {
  // Session restored from localStorage so reloads keep the user logged in
  const email = ref<string | null>(localStorage.getItem(EMAIL_KEY))
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))

  const isAuthenticated = computed(() => !!email.value && !!token.value)

  /** Asks the server to (re)generate a token for the email (dev: check server stdout). */
  async function generateToken(inputEmail: string): Promise<string> {
    return fetchToken(inputEmail.trim())
  }

  async function login(inputEmail: string, inputToken: string): Promise<void> {
    const confirmedEmail = await loginRequest(inputEmail.trim(), inputToken.trim())
    email.value = confirmedEmail
    token.value = inputToken.trim()
    localStorage.setItem(EMAIL_KEY, confirmedEmail)
    localStorage.setItem(TOKEN_KEY, inputToken.trim())
  }

  function logout() {
    email.value = null
    token.value = null
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return { email, token, isAuthenticated, generateToken, login, logout }
})
