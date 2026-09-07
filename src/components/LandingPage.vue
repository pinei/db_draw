<script setup lang="ts">
import AppLogo from './AppLogo.vue'
import LoginPanel from './LoginPanel.vue'
import DemoPreview from './DemoPreview.vue'
</script>

<template>
  <div class="landing">
    <div class="landing-inner">
      <header class="landing-hero">
        <AppLogo class="landing-logo" />
        <h1 class="landing-title">Visual <em>ER diagrams</em> in the browser</h1>
        <p class="landing-lead">
          Draw entities and relationships, switch notation, and export or import DBML and Mermaid.
        </p>
        <ul class="landing-chips">
          <li>DBML</li>
          <li>Mermaid</li>
          <li>ER Notations</li>
        </ul>
      </header>

      <div class="landing-main">
        <section class="landing-demo" aria-label="Diagram preview">
          <DemoPreview />
        </section>
        <div class="landing-sep" role="separator" />
        <aside class="landing-auth">
          <LoginPanel />
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100%;
  height: 100%;
  overflow: auto;
  background: var(--c-canvas-bg);
}

.landing-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 20px 40px;
}

.landing-hero {
  text-align: center;
  margin-bottom: 32px;
  padding: 8px 0 4px;
}

.landing-logo {
  display: block;
  width: 220px;
  max-width: 56%;
  margin: 0 auto;
}

.landing-title {
  margin: 16px auto 10px;
  max-width: 22ch;
  font-size: 32px;
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
  color: var(--c-field-name);
}

.landing-title em {
  font-style: normal;
  color: var(--c-entity-border-hover);
}

.landing-lead {
  margin: 0 auto;
  max-width: 34rem;
  font-size: 16px;
  line-height: 1.5;
  color: var(--c-panel-label);
}

.landing-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
}

.landing-chips li {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--c-panel-border);
  background: var(--c-panel-bg);
  color: var(--c-btn-fg);
}

.landing-main {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.landing-sep {
  width: min(280px, 40%);
  height: 1px;
  margin: 0 auto;
  background: var(--c-panel-border);
}

.landing-auth {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

@media (max-width: 840px) {
  .landing-inner {
    padding: 20px 16px 32px;
  }

  .landing-logo {
    width: 168px;
  }

  .landing-title {
    font-size: 24px;
  }

  .landing-lead {
    font-size: 14px;
  }
}
</style>
