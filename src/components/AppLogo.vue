<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()
</script>

<template>
  <svg
    class="logo"
    viewBox="0 0 260 228"
    role="img"
    aria-labelledby="logo-title"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title id="logo-title">DBDraw - Database Draw</title>

    <!-- ─── Database cylinder (4 stacked discs) ─────────────────────────── -->
    <g fill="var(--logo-navy)">
      <path d="M22 88v16a28 8 0 0 0 56 0V88a28 8 0 0 1-56 0Z" />
      <path d="M22 64v16a28 8 0 0 0 56 0V64a28 8 0 0 1-56 0Z" />
      <path d="M22 40v16a28 8 0 0 0 56 0V40a28 8 0 0 1-56 0Z" />
      <path d="M22 16v16a28 8 0 0 0 56 0V16a28 8 0 0 1-56 0Z" />
    </g>
    <g fill="var(--logo-navy-rim)">
      <ellipse cx="50" cy="88" rx="28" ry="8" />
      <ellipse cx="50" cy="64" rx="28" ry="8" />
      <ellipse cx="50" cy="40" rx="28" ry="8" />
      <ellipse cx="50" cy="16" rx="28" ry="8" />
    </g>

    <!-- ─── Table cards ─────────────────────────────────────────────────── -->
    <g>
      <rect
        x="168" y="12" width="78" height="46" rx="7"
        fill="var(--logo-table-fill)"
        stroke="var(--logo-teal)"
        stroke-width="2.5"
      />
      <rect x="172" y="16" width="70" height="12" rx="3" fill="var(--logo-table-bar)" />
      <rect x="180" y="34" width="50" height="4" rx="2" fill="var(--logo-table-bar)" />
      <rect x="180" y="43" width="36" height="4" rx="2" fill="var(--logo-table-bar)" />
    </g>
    <g>
      <rect
        x="168" y="80" width="78" height="46" rx="7"
        fill="var(--logo-table-fill)"
        stroke="var(--logo-teal)"
        stroke-width="2.5"
      />
      <rect x="172" y="84" width="70" height="12" rx="3" fill="var(--logo-table-bar)" />
      <rect x="180" y="102" width="50" height="4" rx="2" fill="var(--logo-table-bar)" />
      <rect x="180" y="111" width="36" height="4" rx="2" fill="var(--logo-table-bar)" />
    </g>

    <!-- ─── Orthogonal connectors + ER markers ──────────────────────────── -->
    <path
      d="M80 64H110Q118 64 118 56V43Q118 35 126 35H158"
      fill="none"
      stroke="var(--logo-teal)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="162" cy="35" r="4.5" fill="var(--logo-teal)" />

    <path
      d="M118 72V97Q118 103 124 103H132"
      fill="none"
      stroke="var(--logo-teal)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      cx="140"
      cy="103"
      r="5"
      fill="none"
      stroke="var(--logo-teal)"
      stroke-width="2.2"
    />
    <path
      d="M146 103H152M152 103L166 92M152 103H166M152 103L166 114"
      fill="none"
      stroke="var(--logo-teal)"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- ─── Wordmark ────────────────────────────────────────────────────── -->
    <text
      x="130"
      y="176"
      text-anchor="middle"
      font-size="36"
      font-weight="800"
      font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    >
      <tspan fill="var(--logo-navy)">DB</tspan><tspan fill="var(--logo-teal)">Draw</tspan>
    </text>

    <!-- ─── Tagline ─────────────────────────────────────────────────────── -->
    <g v-if="!compact">
      <line x1="18" y1="206" x2="52" y2="206" stroke="var(--logo-tag)" stroke-width="1.2" />
      <text
        x="130"
        y="210"
        text-anchor="middle"
        font-size="10.5"
        font-weight="600"
        letter-spacing="2.6"
        fill="var(--logo-tag)"
        font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
      >DATABASE DRAW</text>
      <line x1="208" y1="206" x2="242" y2="206" stroke="var(--logo-tag)" stroke-width="1.2" />
    </g>
  </svg>
</template>

<style scoped>
.logo {
  display: block;
  width: 100%;
  height: auto;
  --logo-navy: #1e3a5f;
  --logo-navy-rim: #2d5280;
  --logo-teal: #1a9b94;
  --logo-table-fill: #eef1f4;
  --logo-table-bar: #c5ccd4;
  --logo-tag: #8a93a3;
}

:global([data-theme='dark']) .logo {
  --logo-navy: #8bb4e0;
  --logo-navy-rim: #a8c8ec;
  --logo-teal: #2dd4bf;
  --logo-table-fill: #21262d;
  --logo-table-bar: #3d444d;
  --logo-tag: #6e7681;
}
</style>
