<script setup lang="ts">
import kofiMark from '../assets/kofi-logomark.png'

const KOFI_URL = 'https://ko-fi.com/pinei'
</script>

<template>
  <a
    class="kofi-btn"
    :href="KOFI_URL"
    target="_blank"
    rel="noopener noreferrer"
    title="Support DBDraw on Ko-fi"
  >
    <img class="kofi-mark" :src="kofiMark" alt="" width="22" height="18" />
    <span>Support on Ko-fi</span>
  </a>
</template>

<style scoped>
.kofi-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 12px;
  background: #ff5e5b;
  color: #ffffff;
  border: 1px solid #e24b48;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  text-decoration: none;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  user-select: none;
}

.kofi-btn:hover {
  background: #ff716e;
}

.kofi-mark {
  width: 22px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
  display: block;
}
</style>
