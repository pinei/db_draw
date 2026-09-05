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
  App.vue                     # gate de login + compõe Canvas/CodePanel/SettingsPanel; carrega/semeia estado após auth
  style.css                   # CSS global + variáveis (--c-*)
  model/
    types.ts                  # TODOS os tipos de domínio e apresentação (ErSchema, DiagramState, etc.)
    sampleData.ts             # schema de exemplo "biblioteca" (9 entidades, todas as cardinalidades)
  stores/
    diagram.ts                # Pinia store: estado central, getters, actions, auto-save debounced
    auth.ts                   # sessão do usuário (email/token em localStorage) + login/logout
  utils/
    persist.ts                # load/save via API local + validação de DBML (@dbml/parse) + auth API
    codePlaceholder.ts        # serializers DBML e Mermaid a partir de ErSchema
    connectionPoints.ts       # geometria de pontos de conexão, snap em arestas, posição de labels
    connectorPath.ts          # paths SVG: bezier (curved) e ortogonal (Manhattan)
  components/
    DiagramCanvas.vue         # SVG raiz, pan/zoom, drag de entidade/ponto/label
    ErEntity.vue              # card de entidade (foreignObject com HTML interno)
    ErConnector.vue           # linha de relação + markers + handles + label
    ConnectorMarker.vue       # <defs> com todos os markers SVG por notação/cardinalidade
    SettingsPanel.vue         # controles de estilo/notação/zoom + usuário/logout + status de save
    CodePanel.vue             # painel de código DBML/Mermaid (edição + apply + highlight read-only)
    ModelBar.vue              # barra superior: meta do model (nome/tags/descrição editáveis, id só leitura)
    LoginPanel.vue            # tela de login (e-mail + token, gerar token)
  vite.config.ts              # plugins de auth (/api/auth) e persistência (/api/models) em middleware do dev server
data/
  user/<dominio>/<nome>/      # NÃO versionado (ver .gitignore)
    user.json                 # { email, token, createdAt, lastLoginAt, lastLoginIp, lastLoginUserAgent, loginCount }
    models/<nome>/            # um .json/.dbml/.mermaid por modelo (hoje só "default")
docs/                         # imagens/assets de documentação
```

## Modelo de dados (o mais importante)

O modelo está dividido em **lógico** (schema) e **apresentação** (layout), ambos definidos em `src/model/types.ts`.

- `ErSchema` = `{ entities: ErEntity[]; relationships: ErRelationship[] }` — independe de layout.
- `DiagramState` = `meta` + schema + `entityPositions` + `layout` + `connectorPoints` + `labelPositions`.
- `ModelMeta` = `{ id (pasta, imutável), name, description, tags[] }` — vai no `.json` do model; `id` sempre vence no load, tags sanitizadas (`modelMeta.ts`), artefatos antigos ganham backfill via `loadState(loaded, modelId)`.
- `Cardinality`: `ONE | ONE_OR_MANY | ZERO_OR_ONE | ZERO_OR_MANY` (só combinações min/max reais; `ErRelationship` usa só essas).
- `LogicalCardinality`: `'ONE' | 'MANY'` — placeholders não-especializados p/ modelagem lógica futura; os renderers aceitam `Cardinality | LogicalCardinality`, então os glifos do `MANY` existem em todas as notações mesmo sem uso atual.

Regras importantes:
- IDs de entidade/relação são strings; relacionamentos referenciam `fromEntityId`/`toEntityId`.
- Campos com `isFK` apontam para outra entidade via `referencedEntityId`.
- Posições guardam `EntityRect { x, y, width, height }`.
- Pontos de conexão customizados e posições de labels são normalizados (frações 0..1), nunca pixels absolutos — assim sobrevivem a pan/zoom/resize.

## Como as coisas funcionam

### Autenticação multiusuário (dev apenas)
Login com e-mail + token via `LoginPanel.vue` (gate no `App.vue`; sessão em `localStorage`, store `auth.ts`). Logout chama `resetState()` da diagram store (estado é global e sem dono — sem isso o próximo login herdaria o diagrama em memória e o seed de 404 o persistiria na pasta do novo usuário). Seed de primeiro login usa `resetState()` + `saveModel` (defaults pristinos, nunca o estado corrente). Auto-save não dispara deslogado. Endpoints em `vite.config.ts`: `POST /api/auth/token {email}` (gera token, grava `user.json`, imprime o token no stdout — sem e-mail nesta fase) e `POST /api/auth/login {email, token}` (compara com `timingSafeEqual`). E-mail vira pasta `data/user/<dominio>/<nome>` (lowercase, validado contra path traversal). `GET/PUT /api/models/:name` exigem headers `X-User-Email`/`X-Auth-Token` e operam em `data/user/.../models/:name/`; 401 vira `AuthError` e desloga. Tokens em plaintext, sem expiração — débito assumido até a fase do e-mail.

### Persistência (dev apenas)
A persistência é um middleware do Vite em `vite.config.ts`. Ela expõe `GET/PUT /api/models/:name` (autenticado, ver acima) e grava arquivos em `data/user/.../models/:name/` (`.json`, `.dbml`, `.mermaid`). Só funciona com `npm run dev`; fora disso o app roda em memória silenciosamente (`App.vue` usa try/catch). Primeiro login sem modelo → 404 → `App.vue` semeia do `sampleData` em memória.

`saveModel` (em `utils/persist.ts`) anexa os campos derivados `_dbml` e `_mermaid` como side-channel; `loadModel` os remove ao ler. O auto-save é debounced (1.5s) via `watch(..., { deep: true })` na store.

**Artefato vs. UI:** o `.json` guarda propriedades do **diagrama** (`PersistedDiagramState`), não da aplicação. `saveModel` remove as preferências de UI do `layout` (`codeFormat`, `codePanelOpen`, `theme` — ver `UiPreferenceKey` em `types.ts`); `loadState` na store as restaura com defaults (`dbml`, aberto, `system`). Preferências de UI vivem só em memória e nunca entram no artefato.

### Serialização
`utils/codePlaceholder.ts` faz o mapeamento bidirecional parcial:
- `generateDbml(schema)` → `Table ... { ... }` (`[pk]` + `[not null]` na FK quando o lado oposto é mandatório, sem `ref:` inline) + `Ref: From.col op To.col` (coluna FK real do lado muitos → PK do outro lado; cardinalidade vira operador `<>`, `>`, `<`, `-`; rels do mesmo par dividem as FKs first-unused-wins). Sem `ref:` inline porque o binder rejeita refs duplicadas de mesmos endpoints (erro 5001) — o output próprio tem que passar no Apply.
- `generateMermaid(schema)` → `erDiagram`.
- Import DBML→diagrama (`utils/dbmlImport.ts` + `applyDbml` na store, Apply em 1 passo): `compileDbml` valida e normaliza refs (explícitas via regex da linha `Ref:` com label do comentário + inline `inline_refs` do AST; 5002 autoref sintetizada, resto bloqueia); `buildDbmlPatch` casa por nome exato e preserva ids (logo posições e overrides), cardinalidades default com o eixo-muitos em ONE_OR_MANY e o eixo-um via `[not null]` da FK oposta (`ONE` se not-null, `ZERO_OR_ONE` se não — o DBML não expressa "muitos mandatório", esse eixo só se preserva), FK órfã vira campo comum, ordem espelha o bloco `Table`, entidades novas ao lado dos vizinhos ou no 1º slot livre, `[not null]` consumido não conta como ignorado. Resumo `+criadas −removidas ~alteradas` + ignorados.

### Validação de DBML
`validateDbml` em `utils/persist.ts` usa `@dbml/parse` (`Compiler` + `MemoryProjectLayout` + `Filepath`). Ver `DBML_PARSE_*.md` (4 arquivos na raiz) para referência completa da API do `@dbml/parse`.

### Notação / markers
A convenção de ID dos markers SVG é `{prefixo}-{Cardinality}-{end|start}`, onde prefixo = `cf` (crowsfoot), `mm` (minmax) ou `bar` (barker). `ConnectorMarker.vue` os define no `<defs>` e `ErConnector.vue` os referencia. Se adicionar uma cardinalidade ou notação, ambos os arquivos precisam ser atualizados de forma consistente. (`arrow`/`uml` foram removidos; `loadState` faz fallback para `crowsfoot` se o artefato trouxer notação desconhecida.)

Exceção: `minmax` usa extremidades sem símbolo (markers `mm-*` vazios, gerados via `v-for`) e a cardinalidade vai como **texto** nas pontas (`1`, `0..1`, `*`, `1..*`, `0..*`), via `cardinalityToMinMax` em `ErConnector.vue`. O posicionamento é fixo e determinístico via `minMaxLabelPosition` em `connectionPoints.ts`: gap da entidade e da linha medidos da **borda** do texto (via `text-anchor`/`dominant-baseline` dinâmicos — `start`/`end` também no eixo da entidade em conectores horizontais, para `0..*` e `1` ficarem à mesma distância), lado externo = canto mais próximo, nunca relativo à direção da linha. Notação é só apresentação — os serializers DBML/Mermaid (baseados em cardinalidade) não mudam.

Exceção: `barker` combina símbolo (pé-de-galinha só nos lados "muitos", markers `bar-*`) com estilo de linha por metade (sólida = mandatório, pontilhada = opcional). `ErConnector.vue` divide o path em duas metades (`splitBezierPath`/`splitOrthogonalPath` em `connectorPath.ts`: De Casteljau t=0.5 / ponto médio do comprimento) e aplica `barker-optional` por ponta. `MANY` é `LogicalCardinality` (placeholder) e renderiza como mandatório-muitos, consistente com os serializers.

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
3. Para geometria de conexão, mexa em `connectionPoints.ts` / `connectorPath.ts` (pura) e reflita no drag em `DiagramCanvas.vue`. Self-loops (`from === to`, ex. `referred_by`): geometria fixa via `selfLoopPoints` (top@0.75 → right@0.25) + rota externa `selfLoopCorners`, render suave `roundedPolylinePath` nos dois estilos, handles escondidos, label fixa no ápice (sem drag — evita texto preso atrás do card). Markers `-start` reutilizam a geometria dos `-end` (`auto-start-reverse` já gira 180° — espelhar de novo desenharia o glifo para dentro do card). `loadState` descarta `labelPositions`/`connectorPoints` de self-loops ao carregar (auto-cura de valores obsoletos).
4. Valide com `npm run build` (inclui typecheck). Não há testes; teste manual pelo `npm run dev`.
