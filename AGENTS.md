# AGENTS.md

Guia para agentes de IA (e humanos) que trabalham neste repositório.

## Visão geral

`db_draw` (npm name: `db-diagram`) é um editor visual de diagramas ER (entidade-relacionamento) no navegador. Ele desenha entidades/relações em um canvas SVG, permite arrastar/redimensionar cards, editar pontos de conexão, trocar notação e exportar/importar o schema em DBML ou Mermaid.

Stack: Vue 3 (`<script setup>`) + Vite + Pinia + TypeScript + SVG (sem libs de grafo).

## Comandos

```bash
npm install          # instala dependências
npm run dev          # sobe o dev server (Vite) — necessário para persistência
npm run build        # typecheck (vue-tsc) + build de produção
npm run preview      # serve o build de produção
```

Não há lint nem teste automatizado configurado. O typecheck é feito pelo `vue-tsc` dentro de `npm run build`. É importante rodar `npm run build` após alterações para validar tipos.

## Arquitetura / estrutura

```
src/
  main.ts                     # bootstrap: createApp + Pinia + mount
  App.vue                     # compõe Canvas + CodePanel + SettingsPanel; carrega/semeia estado no mount
  style.css                   # CSS global + variáveis (--c-*)
  model/
    types.ts                  # TODOS os tipos de domínio e apresentação (ErSchema, DiagramState, etc.)
    sampleData.ts             # schema de exemplo "biblioteca" (9 entidades, todas as cardinalidades)
  stores/
    diagram.ts                # Pinia store: estado central, getters, actions, auto-save debounced
  utils/
    persist.ts                # load/save via API local + validação de DBML (@dbml/parse)
    codePlaceholder.ts        # serializers DBML e Mermaid a partir de ErSchema
    connectionPoints.ts       # geometria de pontos de conexão, snap em arestas, posição de labels
    connectorPath.ts          # paths SVG: bezier (curved) e ortogonal (Manhattan)
  components/
    DiagramCanvas.vue         # SVG raiz, pan/zoom, drag de entidade/ponto/label
    ErEntity.vue              # card de entidade (foreignObject com HTML interno)
    ErConnector.vue           # linha de relação + markers + handles + label
    ConnectorMarker.vue       # <defs> com todos os markers SVG por notação/cardinalidade
    SettingsPanel.vue         # controles de estilo/notação/zoom + status de save
    CodePanel.vue             # painel de código DBML/Mermaid (edição + apply)
  vite.config.ts              # plugin de persistência: API /api/models em middleware do dev server
data/
  default/
    default.json              # estado persistido (DiagramState sem campos derivados)
    default.dbml              # export DBML gerado
    default.mermaid           # export Mermaid gerado
docs/                         # imagens/assets de documentação
```

## Modelo de dados (o mais importante)

O modelo está dividido em **lógico** (schema) e **apresentação** (layout), ambos definidos em `src/model/types.ts`.

- `ErSchema` = `{ entities: ErEntity[]; relationships: ErRelationship[] }` — independe de layout.
- `DiagramState` = schema + `entityPositions` + `layout` + `connectorPoints` + `labelPositions`.
- `Cardinality`: `ONE | ONE_AND_ONLY_ONE | MANY | ONE_OR_MANY | ZERO_OR_ONE | ZERO_OR_MANY`.

Regras importantes:
- IDs de entidade/relação são strings; relacionamentos referenciam `fromEntityId`/`toEntityId`.
- Campos com `isFK` apontam para outra entidade via `referencedEntityId`.
- Posições guardam `EntityRect { x, y, width, height }`.
- Pontos de conexão customizados e posições de labels são normalizados (frações 0..1), nunca pixels absolutos — assim sobrevivem a pan/zoom/resize.

## Como as coisas funcionam

### Persistência (dev apenas)
A persistência é um middleware do Vite em `vite.config.ts`. Ela expõe `GET/PUT /api/models/:name` e grava arquivos em `data/:name/` (`.json`, `.dbml`, `.mermaid`). Só funciona com `npm run dev`; fora disso o app roda em memória silenciosamente (`App.vue` usa try/catch).

`saveModel` (em `utils/persist.ts`) anexa os campos derivados `_dbml` e `_mermaid` como side-channel; `loadModel` os remove ao ler. O auto-save é debounced (1.5s) via `watch(..., { deep: true })` na store.

### Serialização
`utils/codePlaceholder.ts` faz o mapeamento bidirecional parcial:
- `generateDbml(schema)` → `Table ... { ... }` + `Ref: ...` (mapeia cardinalidade para operadores `<>`, `>`, `<`, `-`).
- `generateMermaid(schema)` → `erDiagram`.
Nota: importar DBML **de volta** para o schema ainda não está totalmente implementado — `validateDbml` só valida o texto, não aplica no estado.

### Validação de DBML
`validateDbml` em `utils/persist.ts` usa `@dbml/parse` (`Compiler` + `MemoryProjectLayout` + `Filepath`). Ver `DBML_PARSE_*.md` (4 arquivos na raiz) para referência completa da API do `@dbml/parse`.

### Notação / markers
A convenção de ID dos markers SVG é `{prefixo}-{Cardinality}-{end|start}`, onde prefixo = `cf` (crowsfoot), `arr` (arrow) ou `uml`. `ConnectorMarker.vue` os define no `<defs>` e `ErConnector.vue` os referencia. Se adicionar uma cardinalidade ou notação, ambos os arquivos precisam ser atualizados de forma consistente.

## Convenções de código

- TypeScript estrito; sem `any` exceto quando inevitável (ver `persist.ts` no catch).
- Vue `<script setup lang="ts">` com `defineProps`/`defineEmits` tipados inline.
- Estado centralizado na store Pinia (`stores/diagram.ts`); componentes chamam actions, não mutam `state` diretamente (exceção prática: leituras).
- Utility pura (sem estado Vue) em `src/utils/*.ts`.
- Comentários curtos com separadores `// ─── ... ───` usados para agrupar seções — seguir esse estilo ao adicionar código.
- Cores via variáveis CSS globais `--c-*` definidas em `src/style.css`.

## Ao fazer mudanças

1. Entenda se a mudança é no **modelo lógico** (schema) ou na **apresentação** (layout) — a fronteira é em `types.ts`.
2. Para novas cardinalidades/notações, atualize `types.ts`, `ConnectorMarker.vue`, `ErConnector.vue` e os serializers em conjunto.
3. Para geometria de conexão, mexa em `connectionPoints.ts` / `connectorPath.ts` (pura) e reflita no drag em `DiagramCanvas.vue`.
4. Valide com `npm run build` (inclui typecheck). Não há testes; teste manual pelo `npm run dev`.
