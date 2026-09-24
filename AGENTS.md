# AGENTS.md

Guia para agentes de IA (e humanos) que trabalham neste repositório.

## Visão geral

`db_draw` (npm name: `db-diagram`) é um editor visual de diagramas ER (entidade-relacionamento) no navegador. Ele desenha entidades/relações em um canvas SVG, permite arrastar/redimensionar cards, editar pontos de conexão, trocar notação e exportar/importar o schema em DBML ou Mermaid.

Stack: Vue 3 (`<script setup>`) + Vite + Pinia + TypeScript + SVG (sem libs de grafo) + Lucide (`lucide-vue-next`, import por ícone — nada de emoji/glifo em UI). Produção: Express (`server/`) atrás de Caddy + Cloudflare.

## Comandos

```bash
npm install          # instala dependências
npm run dev          # sobe o dev server (Vite + API Express em /api)
npm run build        # typecheck (vue-tsc) + build de produção
npm start            # serve dist/ + /api (Express). Requer npm run build
npm run preview      # só o build estático (sem API)
# Docker (VPS): docker compose up -d --build
```

Não há lint nem teste automatizado configurado. O typecheck é feito pelo `vue-tsc` dentro de `npm run build`. É importante rodar `npm run build` após alterações para validar tipos.

## Arquitetura / estrutura

```
src/
  main.ts                     # bootstrap: createApp + Pinia + mount
  App.vue                     # gate: landing vs EditorApp vs /admin; cookie session via GET /auth/me
  EditorApp.vue               # canvas + painéis; carrega/semeia estado após auth
  AdminApp.vue                # /admin (lazy): lista users + user.json + modelos; só se /auth/me.admin
  style.css                   # CSS global + variáveis (--c-*)
  model/
    types.ts                  # TODOS os tipos de domínio e apresentação (ErSchema, DiagramState, etc.)
    sampleData.ts             # schema de exemplo "biblioteca" (9 entidades, todas as cardinalidades)
    landingSample.ts          # 4 tabelas + posições do preview da landing
  stores/
    diagram.ts                # Pinia store: estado central, getters, actions, auto-save debounced
    auth.ts                   # sessão (email em memória; cookie HttpOnly) + login/logout
  utils/
    authApi.ts                # POST /api/auth (leve — a landing não puxa persist/DBML); credentials: include
    adminApi.ts               # GET /api/admin/* (só importado pelo AdminApp)
    persist.ts                # load/save via API local + validação de DBML (@dbml/parse)
    codePlaceholder.ts        # serializers DBML e Mermaid a partir de ErSchema
    connectionPoints.ts       # geometria de pontos de conexão, snap em arestas, posição de labels
    connectorPath.ts          # paths SVG: bezier (curved) e ortogonal (Manhattan)
    diagramExport.ts          # PNG/SVG do canvas (html2canvas nos cards; bake de markers)
  components/
    LandingPage.vue           # landing: hero + DemoPreview + LoginPanel
    DemoPreview.vue           # viewport de demo (notação/conector/tema, sem store)
    DiagramCanvas.vue         # SVG raiz, pan/zoom, drag de entidade/ponto/label
    ErEntity.vue              # card de entidade (foreignObject com HTML interno)
    ErConnector.vue           # linha de relação + markers + handles + label
    DemoConnector.vue         # conector só-leitura da landing (sem store / drag)
    ConnectorMarker.vue       # <defs> com todos os markers SVG por notação/cardinalidade
    SettingsPanel.vue         # controles de estilo/notação/zoom + export PNG/SVG/Mermaid + usuário/logout + status de save
    SidePanel.vue             # dock lateral esquerdo (overlay): rail de ícones + resize horizontal + header; views plugáveis
    CodeView.vue              # view de código DBML (edição + apply + highlight)
    MermaidExportDialog.vue   # popup de exportação Mermaid: código read-only + SVG da lib mermaid (modelo ou scope visível)
    ScopeView.vue             # CRUD de scopes + checklist de tabelas; modo scope no canvas via activeScopeId (sessão) com badge de saída na ModelBar
    ModelBar.vue              # pílula /id + nome + botão 🗂 (popover ModelManager)
    ModelManager.vue          # modal com mode open|create: lista/abre (flush antes) ou cria (blank)
    LoginPanel.vue            # card de login (e-mail + token, gerar token)
server/
  app.ts                      # Express: /api/auth + /api/models (Vite e produção)
  migrations/                 # change management de data/: registry + runner (meta.json, backup sempre, restore+abort) — roda no boot via createApiRouter
  store.ts                    # TODO o acesso fs; MODELS_DIRNAME = 'er-models' (v1 renomeou models/ → er-models/)
  session.ts                  # cookie dbdraw_sid + índice data/sessions + tickets mágicos
  store.ts                    # filesystem de user.json e modelos
  tokenEmail.ts               # e-mail de token via Resend
  prod.ts                     # npm start — estáticos + API em 127.0.0.1:3000
deploy/Caddyfile              # reverse proxy Caddy → Express
vite.config.ts                # monta o router Express em /api no dev server
data/
  user/<dominio>/<nome>/      # NÃO versionado (ver .gitignore)
    user.json                 # { email, tokenHash, createdAt, lastLoginAt, …, loginCount, lastModelId, codePanelSize? }
    er-models/<nome>/         # um .json/.dbml/.mermaid por modelo (renomeado de models/ na data v1)
  sessions/<hh>/<sidHash>.json  # índice de sessões (cookie HttpOnly)
  tickets/<hh>/<ticketHash>.json
docs/                         # imagens/assets de documentação
```

## Modelo de dados (o mais importante)

O modelo está dividido em **lógico** (schema) e **apresentação** (layout), ambos definidos em `src/model/types.ts`.

- `ErSchema` = `{ entities: ErEntity[]; relationships: ErRelationship[] }` — independe de layout.
- `DiagramState` = `meta` + schema + `scopes` + `entityPositions` + `layout` + `connectorPoints` + `labelPositions` + `routeOverrides`.
- `ErScope` = `{ id (slug imutável), name, entityIds[], positions{}, connectorPoints{}, labelPositions{}, routeOverrides{} }` — um arquivo próprio por scope (`<model>.scope.<id>.json`, flat para o clone renomear via prefixo); rels derivadas (ambos os extremos no checklist); overrides independentes com snapshot dos globais na criação (opção B); fora do `.json` do model.
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
Login com e-mail + token colável via `LoginPanel.vue` na landing. A sessão vive num cookie HttpOnly `dbdraw_sid` (7 dias, `SameSite=Lax`, `Secure` em HTTPS; o JS nunca lê o sid). O editor (`EditorApp.vue`) é `import()` depois do login — a landing não puxa `persist` / `@dbml/parse` / `html2canvas`. Boot: `GET /api/auth/me` com `credentials: 'include'`; 401 → landing. Logout chama `POST /api/auth/logout` (revoga o sid), desmonta o editor (`resetState()` no `onUnmounted`). Seed de primeiro login usa `resetState()` + `saveModel`. Auto-save não dispara deslogado. Endpoints: `POST /api/auth/token {email}` (gera token longo hashed em `user.json` + ticket mágico single-use 30 min, e-mail via Resend), `POST /api/auth/login {email, token}` (compara hash/`timingSafeEqual`, `Set-Cookie`, devolve `lastModelId` + `codePanelSize` + `admin`), `GET /api/auth/magic?ticket=` (consome ticket, cookie, 302 `/`), `GET /api/auth/me` (inclui `admin` a partir de `ADMIN_EMAILS` no servidor — a allowlist não vai no bundle), `POST /api/auth/logout`, `GET/PUT /api/auth/prefs`. Settings mostra o link Admin (`/admin` noutra aba) só se `admin`. `App.vue` trata `/admin`: lazy `AdminApp` se `admin`, senão `replaceState` para `/`. `GET /api/admin/users`, `GET /api/admin/user?email=`, `GET /api/admin/dbml?email=&model=`, `POST /api/admin/clone` e `POST /api/admin/delete` exigem sessão admin (404 se não); o JSON do user vem sem `token`/`tokenHash`/`magicTicketHash`. Clique num modelo no admin abre popup DBML; Clone copia a pasta para os models do admin (id novo, sem conflito). Delete remove a pasta do modelo (e limpa `lastModelId` se apontava para ela). Mutações `/api` exigem Origin na allowlist (`SITE_URL` + Host) e rejeitam `Sec-Fetch-Site: cross-site`. E-mail vira pasta `data/user/<dominio>/<nome>`. `GET/PUT /api/models` usam o cookie (não headers). 401 vira `AuthError` e desloga. Sid hashed em `data/sessions/<hh>/<hash>.json`; tickets em `data/tickets/`. Token plaintext legado em `user.json` ainda autentica até o próximo Generate. `lastModelId` / `codePanelSize` como antes.

### Persistência (dev apenas)
A persistência é o router Express em `server/app.ts` (`GET/PUT /api/models/:name`, autenticado) e grava em `data/user/.../er-models/:name/` (`.json`, `.dbml`, `.mermaid`). Em dev o Vite monta o mesmo router; em produção `npm start` serve `dist/` + API. Sem o servidor (`vite preview` ou arquivo estático) o app roda em memória silenciosamente (`EditorApp.vue` usa try/catch). Primeiro login sem modelo → 404 → `EditorApp.vue` semeia do `sampleData` em memória.

`PUT /api/models/:name` aceita um envelope parcial `{ meta?, schema?, presentation?, exports? }` (`mergeModelPatch` em `store.ts`): o `.json` é mesclado fatia a fatia; `.dbml`/`.mermaid` só são reescritos quando `exports.dbml` / `exports.mermaid` vêm como string (o cliente continua autoritativo — o servidor **não** regenera). Snapshot legado com `_dbml`/`_mermaid` no topo ainda funciona. No cliente, `saveModelSlices` monta o envelope; `saveModel` = full (create/seed). Dirty flags na store (`meta` / `schema` / `presentation` / `exports`) + debounce 1.5s: drag/zoom/mid-route só sujam `presentation` (sem tocar nos exports); mudanças de schema (Apply etc.) sujam `schema`+`exports`. Preferências de UI (`codePanelOpen`, `sidePanelView`, `theme`) não sujam nada. `loadState`/`resetState` usam `suppressDirty`.

**Artefato vs. UI:** o `.json` guarda propriedades do **diagrama** (`PersistedDiagramState`), não da aplicação. Saves removem as preferências de UI do `layout` (`codePanelOpen`, `sidePanelView`, `theme` — ver `UiPreferenceKey` em `types.ts`); `loadState` na store as restaura com defaults (painel aberto, view `code`, tema `system`). Preferências de UI vivem só em memória e nunca entram no artefato. O servidor ainda descarta `layout.codeFormat` se um cliente antigo enviar.

### Serialização
`utils/codePlaceholder.ts` faz o mapeamento bidirecional parcial:
- `generateDbml(schema)` → `Table ... { ... }` (`[pk]` + `[not null]` na FK quando o lado oposto é mandatório, sem `ref:` inline) + `Ref: From.col op To.col` (coluna FK real do lado muitos → PK do outro lado; cardinalidade vira operador `<>`, `>`, `<`, `-`; rels do mesmo par dividem as FKs first-unused-wins). Sem `ref:` inline porque o binder rejeita refs duplicadas de mesmos endpoints (erro 5001) — o output próprio tem que passar no Apply.
- `generateMermaid(schema)` → `erDiagram`. O painel Diagram Code é só DBML. O botão Mermaid na seção Export do Settings abre `MermaidExportDialog`: o texto é `generateMermaid` do schema visível (`visibleEntities` / `visibleRelationships` — modelo inteiro ou scope ativo), com highlight read-only e botão de copiar; a vista Diagram renderiza esse texto com a lib `mermaid` (import dinâmico), tema `default` no claro e `dark` no escuro, com botão de baixar o SVG. O `.mermaid` gravado no save continua sendo o schema completo.
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
3. Para geometria de conexão, mexa em `connectionPoints.ts` / `connectorPath.ts` (pura) e reflita no drag em `DiagramCanvas.vue`. Self-loops (`from === to`, ex. `referred_by`): slot por canto `ne|se|sw|nw` via `selfLoopPoints(rect, corner)` + `selfLoopCorners(..., extent, corner)`; Curved → `roundedPolylinePath`, Orthogonal → `polylinePath` — independente da notação. Barker Curved usa `splitRoundedPolyline`. Handles de ponta escondidos; handle no canto externo ajusta `routeOverrides[relId].selfLoop.{corner,extent}` (extent px default 56; canto default `ne`; compartilhados Curved↔Orthogonal). Arrastar o miolo muda extent e, ao cruzar o centro da entidade, o canto; dblclick reseta só o extent. Label fixa fora do loop (sem drag). `loadState` descarta `labelPositions`/`connectorPoints` de self-loops e limpa `orthogonal`/`curved` neles, mas preserva `selfLoop`. Apply DBML: self-loops novas recebem `pickFreeSelfLoopCorner` (NE→SE→SW→NW; se os 4 ocupados, o menos usado). Mid-route (não-loop): `routeOverrides[relId].orthogonal.midOffset` / `.curved.{along,bulge}` (frações assinadas, por estilo — trocar Curved↔Orthogonal preserva ambos); handle no meio do conector (hover), dblclick reseta o estilo actual. Curved: arrastar o miolo em 2 eixos (ao longo da corda + perpendicular), sempre entre as pontas com margem; markers em Curved usam `orient` fixo por aresta (`…-end-left`, etc.) para não inclinarem com a tangente. Orthogonal: só HH/VV (dois cotovelos) com espaço útil; HV/VH de um cotovelo não editam o meio; o canal fica sempre entre as pontas com margem (~28px) para os markers. Mudar a ponta para outra aresta (soltar o drag) limpa os overrides daquela relação.
4. Valide com `npm run build` (inclui typecheck). Não há testes; teste manual pelo `npm run dev`.
