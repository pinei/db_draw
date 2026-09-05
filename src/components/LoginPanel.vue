<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const email = ref(auth.email ?? '')
const token = ref('')
const busy = ref(false)
const message = ref('')
const messageKind = ref<'info' | 'error'>('info')

function setMessage(text: string, kind: 'info' | 'error') {
  message.value = text
  messageKind.value = kind
}

async function handleLogin() {
  if (!email.value.trim() || !token.value.trim()) {
    setMessage('Enter email and token.', 'error')
    return
  }
  busy.value = true
  try {
    await auth.login(email.value, token.value)
  } catch (e) {
    setMessage(e instanceof Error ? e.message : 'Login failed.', 'error')
  } finally {
    busy.value = false
  }
}

async function handleGenerate() {
  if (!email.value.trim()) {
    setMessage('Enter an email to generate a token.', 'error')
    return
  }
  busy.value = true
  try {
    const msg = await auth.generateToken(email.value)
    setMessage(msg, 'info')
  } catch (e) {
    setMessage(e instanceof Error ? e.message : 'Failed to generate token.', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-root">
    <div class="login-card">
      <div class="login-title">DB Diagram</div>
      <div class="login-subtitle">Sign in with email and token</div>

      <label class="login-field">
        <span>Email</span>
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          :disabled="busy"
          @keyup.enter="handleLogin"
        />
      </label>

      <label class="login-field">
        <span>Token</span>
        <input
          v-model="token"
          type="password"
          placeholder="paste token here"
          autocomplete="current-password"
          :disabled="busy"
          @keyup.enter="handleLogin"
        />
      </label>

      <div class="login-actions">
        <button class="btn primary" :disabled="busy" @click="handleLogin">Sign in</button>
        <button class="btn" :disabled="busy" @click="handleGenerate">Generate token</button>
      </div>

      <div v-if="message" class="login-message" :class="messageKind">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-canvas-bg);
}

.login-card {
  background: var(--c-panel-bg);
  border: 1px solid var(--c-panel-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  padding: 28px 28px 24px;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--c-field-name);
}

.login-subtitle {
  font-size: 12px;
  color: var(--c-panel-label);
  margin-bottom: 4px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-panel-label);
}

.login-field input {
  font-family: inherit;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
  color: var(--c-field-name);
  outline: none;
}

.login-field input:focus {
  border-color: var(--c-entity-border-hover);
}

.login-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--c-btn-border);
  border-radius: 6px;
  background: var(--c-btn-bg);
  color: var(--c-btn-fg);
  cursor: pointer;
  transition: background 0.12s;
}

.btn:hover:not(:disabled) {
  background: var(--c-btn-hover-bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.primary {
  background: var(--c-btn-active-bg);
  color: var(--c-btn-active-fg);
  border-color: var(--c-btn-active-border);
}

.login-message {
  font-size: 11px;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 6px;
}

.login-message.info {
  color: var(--c-field-name);
  background: var(--c-btn-hover-bg);
}

.login-message.error {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}
</style>
